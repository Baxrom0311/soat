import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/client.dart';
import '../api/models.dart';

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
  CallsFeed(this._api, {required this.onUnauthorized});

  final ApiClient _api;

  /// Called when the server stops recognising this session, so the app can send
  /// the nurse back to the login screen rather than showing a board that has
  /// quietly stopped updating. A stale board is worse than an empty one: it
  /// looks like a quiet ward.
  final VoidCallback onUnauthorized;

  static const Duration pollInterval = Duration(seconds: 5);

  Timer? _poll;
  Timer? _tick;

  List<Call> _calls = const [];
  DateTime _now = DateTime.now();
  bool _loading = true;
  bool _reachable = true;
  BillingNotice? _notice;

  List<Call> get calls => _calls;
  DateTime get now => _now;
  bool get loading => _loading;
  BillingNotice? get notice => _notice;

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
  }

  void stop() {
    _poll?.cancel();
    _tick?.cancel();
    _poll = null;
    _tick = null;
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
