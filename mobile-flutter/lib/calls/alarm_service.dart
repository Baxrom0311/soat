import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';

/// Calls older than this no longer start the in-app alarm.
///
/// Matches the server's RENOTIFY_MAX_HOURS: past two hours the server stops
/// re-sending pushes, because a call still open by then is almost always one a
/// nurse dealt with and never closed, and an alarm that keeps crying wolf gets
/// silenced for good. The app must not undo that by ringing on every launch
/// until the twelve-hour expiry finally closes the call.
const alarmMaxAge = Duration(hours: 2);

/// The calls the alarm should be ringing for: active, recent, and not ones the
/// nurse has already silenced.
Set<int> ringingIds(Iterable<Call> calls, Set<int> silenced, DateTime now) => {
  for (final c in calls)
    if (c.status == 'active' &&
        !silenced.contains(c.callId) &&
        c.waited(now) < alarmMaxAge)
      c.callId,
};

bool shouldRing(Iterable<Call> calls, Set<int> silenced, DateTime now) =>
    ringingIds(calls, silenced, now).isNotEmpty;

/// Drives the native alarm (CallAlarmService on Android).
///
/// The alarm is a foreground service rather than something the screen owns,
/// so it keeps ringing after the nurse leaves the app, and stops only when the
/// calls are answered, silenced, or too old to matter. The service is told
/// which calls it rings for: muting it from its notification mutes those calls,
/// and a new call starts it again.
class AlarmService {
  AlarmService._();
  static final AlarmService instance = AlarmService._();

  static const MethodChannel _channel = MethodChannel(
    'uz.boos.nursecall/alarm',
  );

  Set<int> _ids = const {};
  bool get isPlaying => _ids.isNotEmpty;

  /// Rings for exactly [callIds]; an empty set stops it. Cheap to call on every
  /// feed update: the platform is only told when the set changes.
  Future<void> sync(Set<int> callIds) async {
    if (callIds.isEmpty) return stopAlarm();
    if (setEquals(callIds, _ids)) return;
    // Recorded before the call, not after: if Android refuses (starting a
    // foreground service from the background), retrying every tick would only
    // repeat the refusal. The next change to the set tries again, and the push
    // notification rings meanwhile.
    _ids = Set.unmodifiable(callIds);
    try {
      await _channel.invokeMethod('startAlarm', {'callIds': callIds.toList()});
    } catch (e) {
      debugPrint('Alarm start xatosi: $e');
    }
  }

  /// Stops the sound and vibration now.
  Future<void> stopAlarm() async {
    if (_ids.isEmpty) return;
    _ids = const {};
    try {
      await _channel.invokeMethod('stopAlarm');
    } catch (e) {
      debugPrint('Alarm stop xatosi: $e');
    }
  }
}
