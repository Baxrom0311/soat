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

/// Whether the alarm should be ringing: some call is active, recent, and not
/// one the nurse has already silenced.
bool shouldRing(Iterable<Call> calls, Set<int> silenced, DateTime now) =>
    calls.any(
      (c) =>
          c.status == 'active' &&
          !silenced.contains(c.callId) &&
          c.waited(now) < alarmMaxAge,
    );

/// Manages continuous alarm audio and vibration when active calls are waiting.
///
/// Until a nurse taps "Qabul qilish" (Acknowledge) and no active calls remain,
/// this service rings and vibrates continuously on the device's alarm channel.
class AlarmService {
  AlarmService._();
  static final AlarmService instance = AlarmService._();

  static const MethodChannel _channel = MethodChannel(
    'uz.boos.nursecall/alarm',
  );

  bool _isPlaying = false;
  bool get isPlaying => _isPlaying;

  /// Starts the alarm sound loop and repeating vibration.
  Future<void> startAlarm() async {
    if (_isPlaying) return;
    try {
      await _channel.invokeMethod('startAlarm');
      // Only once it really started: set before the call, a failure left this
      // true and every later start returned early, so it never rang again.
      _isPlaying = true;
    } catch (e) {
      debugPrint('Alarm start xatosi: $e');
    }
  }

  /// Stops alarm sound and silences vibration immediately.
  Future<void> stopAlarm() async {
    if (!_isPlaying) return;
    try {
      _isPlaying = false;
      await _channel.invokeMethod('stopAlarm');
    } catch (e) {
      debugPrint('Alarm stop xatosi: $e');
    }
  }
}
