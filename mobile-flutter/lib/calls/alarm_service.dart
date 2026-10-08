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

/// Where the sound actually comes from. Android rings through a foreground
/// service; the Windows desk build plays the chime itself (see
/// desktop/desktop_alarm.dart). The screen does not care which.
abstract class AlarmBackend {
  /// Rings for exactly [callIds]. [arrived] are the calls in that set that were
  /// not ringing a moment ago -- what a desktop toast should name.
  Future<void> start(Set<int> callIds, List<Call> arrived);
  Future<void> stop();
}

class _AndroidAlarm implements AlarmBackend {
  static const MethodChannel _channel = MethodChannel(
    'uz.boos.nursecall/alarm',
  );

  @override
  Future<void> start(Set<int> callIds, List<Call> arrived) =>
      _channel.invokeMethod('startAlarm', {'callIds': callIds.toList()});

  @override
  Future<void> stop() => _channel.invokeMethod('stopAlarm');
}

/// Drives the alarm (CallAlarmService on Android, a looping chime on Windows).
///
/// The alarm is a foreground service rather than something the screen owns,
/// so it keeps ringing after the nurse leaves the app, and stops only when the
/// calls are answered, silenced, or too old to matter. The service is told
/// which calls it rings for: muting it from its notification mutes those calls,
/// and a new call starts it again.
class AlarmService {
  AlarmService._();
  static final AlarmService instance = AlarmService._();

  /// Swapped for the desktop backend at startup on Windows, and for a fake in
  /// tests.
  AlarmBackend backend = _AndroidAlarm();

  Set<int> _ids = const {};
  bool get isPlaying => _ids.isNotEmpty;

  /// Rings for exactly [callIds]; an empty set stops it. Cheap to call on every
  /// feed update: the platform is only told when the set changes. [calls] is
  /// the list the ids came from, so a backend can say which room is calling.
  Future<void> sync(Set<int> callIds, {Iterable<Call> calls = const []}) async {
    if (callIds.isEmpty) return stopAlarm();
    if (setEquals(callIds, _ids)) return;
    final arrived = [
      for (final c in calls)
        if (callIds.contains(c.callId) && !_ids.contains(c.callId)) c,
    ];
    // Recorded before the call, not after: if Android refuses (starting a
    // foreground service from the background), retrying every tick would only
    // repeat the refusal. The next change to the set tries again, and the push
    // notification rings meanwhile.
    _ids = Set.unmodifiable(callIds);
    try {
      await backend.start(callIds, arrived);
    } catch (e) {
      debugPrint('Alarm start xatosi: $e');
    }
  }

  /// Stops the sound and vibration now.
  Future<void> stopAlarm() async {
    if (_ids.isEmpty) return;
    _ids = const {};
    try {
      await backend.stop();
    } catch (e) {
      debugPrint('Alarm stop xatosi: $e');
    }
  }
}
