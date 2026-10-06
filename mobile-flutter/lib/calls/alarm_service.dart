import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Manages continuous alarm audio and vibration when active calls are waiting.
///
/// Until a nurse taps "Qabul qilish" (Acknowledge) and no active calls remain,
/// this service rings and vibrates continuously on the device's alarm channel.
class AlarmService {
  AlarmService._();
  static final AlarmService instance = AlarmService._();

  static const MethodChannel _channel = MethodChannel('uz.boos.nursecall/alarm');

  bool _isPlaying = false;
  bool get isPlaying => _isPlaying;

  /// Starts the alarm sound loop and repeating vibration.
  Future<void> startAlarm() async {
    if (_isPlaying) return;
    try {
      _isPlaying = true;
      await _channel.invokeMethod('startAlarm');
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
