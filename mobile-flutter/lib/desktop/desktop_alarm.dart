import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:window_manager/window_manager.dart';

import '../api/models.dart';
import '../calls/alarm_service.dart';

/// Set at startup on the Windows build only, for the settings screen's sound
/// test.
DesktopAlarm? desktopAlarm;

/// The Windows alarm: the same chime the phones use, looped until the call is
/// answered or silenced, a toast naming the room, and the window pulled in
/// front of whatever else the PC is showing.
///
/// A ward PC is used for other things -- charts, the lab system, a browser --
/// and the NurseCall window is behind them most of the shift. A sound alone
/// tells the nurse *that* somebody is calling; the window coming forward tells
/// her *who*, without her having to find it.
class DesktopAlarm implements AlarmBackend {
  DesktopAlarm();

  final AudioPlayer _player = AudioPlayer(playerId: 'nursecall-alarm');
  final FlutterLocalNotificationsPlugin _toasts =
      FlutterLocalNotificationsPlugin();
  bool _toastsReady = false;
  final Set<int> _toasted = {};

  /// Called once at startup, before the first call can arrive.
  Future<void> init() async {
    try {
      await _player.setReleaseMode(ReleaseMode.loop);
      await _player.setVolume(1.0);
      // Opened now rather than on the first call: the first ring should not
      // wait on a file being decoded.
      await _player.setSource(AssetSource('sounds/nursecall_chime.wav'));
    } catch (e) {
      debugPrint('Signal ovozi yuklanmadi: $e');
    }
    try {
      _toastsReady =
          await _toasts.initialize(
            settings: const InitializationSettings(
              windows: WindowsInitializationSettings(
                appName: 'NurseCall',
                appUserModelId: 'Boos.NurseCall.Desktop',
                // Identifies this app's toast activator to Windows. Fixed for
                // good: changing it orphans toasts from older installs.
                guid: 'b7d5c3a2-4f1e-4c8a-9e6d-2a1f0c3b5d71',
              ),
            ),
            onDidReceiveNotificationResponse: (_) => _bringToFront(),
          ) ??
          false;
    } catch (e) {
      // The sound and the window are the alarm; a toast is a courtesy. A PC
      // with notifications turned off must still ring.
      debugPrint('Windows bildirishnomasi ishlamadi: $e');
    }
  }

  /// Plays the chime once, for the settings screen's "test the sound" row.
  Future<void> test() async {
    final probe = AudioPlayer();
    try {
      await probe.setVolume(1.0);
      await probe.play(AssetSource('sounds/nursecall_chime.wav'));
      await probe.onPlayerComplete.first.timeout(const Duration(seconds: 6));
    } catch (_) {
    } finally {
      await probe.dispose();
    }
  }

  @override
  Future<void> start(Set<int> callIds, List<Call> arrived) async {
    if (_player.state != PlayerState.playing) {
      try {
        await _player.resume();
      } catch (e) {
        debugPrint('Signal chalinmadi: $e');
      }
    }
    for (final id in _toasted.difference(callIds).toList()) {
      await _cancelToast(id);
    }
    for (final call in arrived) {
      await _toast(call);
    }
    if (arrived.isNotEmpty) await _bringToFront();
    // Kept on top while anything rings, so a click elsewhere does not bury the
    // call again before somebody has answered it.
    await _setOnTop(true);
  }

  @override
  Future<void> stop() async {
    try {
      await _player.stop();
    } catch (_) {}
    for (final id in _toasted.toList()) {
      await _cancelToast(id);
    }
    await _setOnTop(false);
  }

  Future<void> _toast(Call call) async {
    if (!_toastsReady) return;
    try {
      await _toasts.show(
        id: call.callId,
        title: '${call.roomNumber} chaqirmoqda',
        body: '${call.floor}-qavat',
        notificationDetails: NotificationDetails(
          windows: WindowsNotificationDetails(
            // The chime is already looping; the toast's own sound on top of it
            // would only be noise.
            audio: WindowsNotificationAudio.silent(),
            duration: WindowsNotificationDuration.long,
          ),
        ),
        payload: '${call.callId}',
      );
      _toasted.add(call.callId);
    } catch (e) {
      debugPrint('Bildirishnoma ko‘rsatilmadi: $e');
    }
  }

  Future<void> _cancelToast(int id) async {
    _toasted.remove(id);
    try {
      await _toasts.cancel(id: id);
    } catch (_) {}
  }

  Future<void> _bringToFront() async {
    try {
      if (await windowManager.isMinimized()) await windowManager.restore();
      await windowManager.show();
      await windowManager.focus();
    } catch (_) {}
  }

  Future<void> _setOnTop(bool value) async {
    try {
      await windowManager.setAlwaysOnTop(value);
    } catch (_) {}
  }
}
