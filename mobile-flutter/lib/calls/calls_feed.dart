import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/client.dart';
import '../api/models.dart';
import 'shift_stats.dart';

/// The ward's unanswered calls, kept fresh while the app is on screen.
///
/// Two clocks, deliberately separate:
///
///  - a **poll** every few seconds, which is what discovers new calls and calls
///    other nurses have answered;
///  - a **tick** every second, which only re-renders the waiting counters.
///
/// Folding them together would mean either counters that jump in five-second
/// steps, or a network request every second on a phone in somebody's pocket.
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

  static const Duration pollInterval = Duration(seconds: 5);

  Timer? _poll;
  Timer? _tick;
  Timer? _stats2;

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

  void start() {
    stop();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      _now = DateTime.now();
      notifyListeners();
    });
    _poll = Timer.periodic(pollInterval, (_) => refresh());
    refresh();
    _refreshNotice();
    _refreshStats();
    if (_clinicName == null) _refreshClinic();
    // Far less often than the call list: the strip is context for the shift, and
    // history is a heavier query that must never compete with finding out that
    // somebody is waiting.
    _stats2 = Timer.periodic(const Duration(minutes: 2), (_) => _refreshStats());
  }

  void stop() {
    _poll?.cancel();
    _tick?.cancel();
    _stats2?.cancel();
    _poll = null;
    _tick = null;
    _stats2 = null;
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
