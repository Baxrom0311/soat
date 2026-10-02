import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/client.dart';
import '../api/live_socket.dart';
import '../api/models.dart';
import 'shift_stats.dart';

/// The ward's unanswered calls, kept fresh while the app is on screen.
///
/// Three clocks and a socket, deliberately separate:
///
///  - a **socket**, which carries the server's own "somebody just pressed a
///    button" the instant it happens;
///  - a **poll**, now slow, which exists only to heal whatever the socket
///    missed -- a connection that died quietly, a frame lost on a carrier NAT;
///  - a **tick** every second, which only re-renders the waiting counters;
///  - a **statistics refresh** every couple of minutes.
///
/// Folding the first two together is the tempting mistake. A WebSocket that
/// dies silently is the classic way to build a screen that looks live and is
/// not: the phone sleeps, the connection is dropped by something in the middle,
/// the socket object stays open and no error is ever delivered. On a ward that
/// failure mode looks exactly like a quiet night. So the poll stays -- just at
/// thirty seconds instead of five, since it is now a safety net rather than the
/// mechanism.
///
/// The socket never carries the call list itself, only the news that something
/// changed; the list is always re-read over HTTP. A dropped or duplicated event
/// therefore cannot leave the screen disagreeing with the server.
class CallsFeed extends ChangeNotifier {
  CallsFeed(this._api, {required this.onUnauthorized, this.onAcknowledged});

  final ApiClient _api;

  /// Called when the server stops recognising this session, so the app can send
  /// the nurse back to the login screen rather than showing a board that has
  /// quietly stopped updating. A stale board is worse than an empty one: it
  /// looks like a quiet ward.
  final VoidCallback onUnauthorized;

  /// Called once a call is no longer waiting, so its notification can be taken
  /// off the lock screen. An `ongoing` alert for a call somebody has already
  /// been to is worse than none: the next one is easy to mistake for it.
  final void Function(int callId)? onAcknowledged;

  /// The safety net, not the mechanism -- see the class comment. Still frequent
  /// enough that a nurse whose socket has died never waits more than this.
  static const Duration pollInterval = Duration(seconds: 30);

  /// Used while the socket is down, so a phone with no live connection is no
  /// worse off than it was before the socket existed.
  static const Duration fallbackPollInterval = Duration(seconds: 5);

  Timer? _poll;
  Timer? _tick;
  Timer? _stats2;
  LiveSocket? _socket;
  bool _live = false;

  /// True when the server can reach this phone the instant a button is pressed.
  bool get live => _live;

  List<Call> _calls = const [];
  DateTime _now = DateTime.now();
  bool _loading = true;
  bool _reachable = true;
  BillingNotice? _notice;
  ShiftStats _stats = ShiftStats.empty;
  String? _clinicName;

  List<Call> get calls => _calls;
  DateTime get now => _now;
  bool get loading => _loading;
  BillingNotice? get notice => _notice;
  ShiftStats get stats => _stats;
  String? get clinicName => _clinicName;

  /// False once a refresh has failed. Surfaced in the UI because a phone that
  /// cannot reach the server shows an empty list, which is indistinguishable
  /// from a ward where nobody needs anything.
  bool get reachable => _reachable;

  void start({String? token}) {
    stop();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      _now = DateTime.now();
      notifyListeners();
    });
    _startPolling(pollInterval);
    if (token != null) _connectSocket(token);
    refresh();
    _refreshNotice();
    _refreshStats();
    if (_clinicName == null) _refreshClinic();
    // Far less often than the call list: the strip is context for the shift, and
    // history is a heavier query that must never compete with finding out that
    // somebody is waiting.
    _stats2 = Timer.periodic(
      const Duration(minutes: 2),
      (_) => _refreshStats(),
    );
  }

  void _startPolling(Duration every) {
    _poll?.cancel();
    _poll = Timer.periodic(every, (_) => refresh());
  }

  void _connectSocket(String token) {
    _socket = LiveSocket(
      onEvent: (_) => refresh(),
      onStateChanged: (connected) {
        _live = connected;
        // Falling back to the old five-second poll the moment the socket drops
        // is what makes this safe to depend on: the worst case is exactly the
        // behaviour the app had before, never a screen that has stopped moving.
        _startPolling(connected ? pollInterval : fallbackPollInterval);
        if (connected) refresh();
        notifyListeners();
      },
    )..connect(token);
  }

  void stop() {
    _poll?.cancel();
    _tick?.cancel();
    _stats2?.cancel();
    _socket?.dispose();
    _poll = null;
    _tick = null;
    _stats2 = null;
    _socket = null;
    _live = false;
  }

  Future<void> refresh() async {
    try {
      final list = await _api.activeCalls();
      // Oldest first, always. The nurse should not have to scan for the person
      // who has been waiting longest — and an arrival-ordered list buries them
      // as the ward gets busy, which is exactly when it matters.
      list.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      _calls = list;
      _reachable = true;
      _loading = false;
      notifyListeners();
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        stop();
        onUnauthorized();
        return;
      }
      _reachable = false;
      _loading = false;
      notifyListeners();
    } catch (_) {
      _reachable = false;
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> _refreshClinic() async {
    try {
      _clinicName = (await _api.clinic()).name;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> _refreshStats() async {
    try {
      _stats = ShiftStats.from(await _api.history(), DateTime.now());
      notifyListeners();
    } catch (_) {
      // Billing-gated and non-essential. A blocked clinic simply loses the
      // strip, which is the right thing to lose before an alert ever is.
    }
  }

  Future<void> _refreshNotice() async {
    try {
      _notice = await _api.billingNotice();
      notifyListeners();
    } catch (_) {
      // The subscription banner is the least important thing on this screen;
      // failing to fetch it must never disturb the call list.
    }
  }

  /// Acknowledge, and drop the card immediately rather than waiting for the next
  /// poll. Five seconds of a card that is already answered still sitting there
  /// invites a second nurse to walk to the same room.
  Future<void> acknowledge(int callId) async {
    final before = _calls;
    _calls = _calls.where((c) => c.callId != callId).toList(growable: false);
    notifyListeners();
    try {
      await _api.acknowledge(callId);
      onAcknowledged?.call(callId);
      _refreshStats();
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        stop();
        onUnauthorized();
        return;
      }
      // Anything else and we genuinely do not know whether it landed, so put the
      // card back: showing a call that was in fact answered costs a wasted walk,
      // hiding one that was not costs a patient waiting with nobody coming.
      _calls = before;
      notifyListeners();
      rethrow;
    } catch (_) {
      _calls = before;
      notifyListeners();
      rethrow;
    }
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}
