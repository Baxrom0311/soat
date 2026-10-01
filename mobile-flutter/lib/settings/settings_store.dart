import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The handful of things a nurse may choose, kept across restarts.
///
/// Deliberately short. Every option on a shared ward phone is something two
/// people can set differently and a third can be confused by, so each one here
/// has to earn its place: the theme, because daylight and a dark corridor are
/// genuinely different rooms, and whether this handset rings at all, because a
/// nurse going off shift needs a way to stop it that is not uninstalling the app.
class SettingsStore extends ChangeNotifier {
  SettingsStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _themeKey = 'nursecall.theme';
  static const _pushKey = 'nursecall.push';

  final FlutterSecureStorage _storage;

  ThemeMode _themeMode = ThemeMode.system;
  bool _pushEnabled = true;
  bool _loaded = false;

  ThemeMode get themeMode => _themeMode;

  /// Whether this handset should receive call notifications at all. Switching it
  /// off unregisters the push token rather than merely hiding alerts, so the
  /// server stops sending to a phone nobody is carrying.
  bool get pushEnabled => _pushEnabled;

  bool get loaded => _loaded;

  Future<void> load() async {
    try {
      final theme = await _storage.read(key: _themeKey);
      _themeMode = switch (theme) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };
      _pushEnabled = (await _storage.read(key: _pushKey)) != 'off';
    } catch (_) {
      // Unreadable storage means defaults, not a crash on launch. The defaults
      // are the safe ones: follow the system, and ring.
    }
    _loaded = true;
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    if (mode == _themeMode) return;
    _themeMode = mode;
    notifyListeners();
    try {
      await _storage.write(
        key: _themeKey,
        value: switch (mode) {
          ThemeMode.light => 'light',
          ThemeMode.dark => 'dark',
          ThemeMode.system => 'system',
        },
      );
    } catch (_) {}
  }

  Future<void> setPushEnabled(bool on) async {
    if (on == _pushEnabled) return;
    _pushEnabled = on;
    notifyListeners();
    try {
      await _storage.write(key: _pushKey, value: on ? 'on' : 'off');
    } catch (_) {}
  }
}

/// What Android will actually do with a call alert on this handset.
///
/// Read from the system rather than assumed, because three separate things can
/// each silence a call on their own and none of them is visible from inside the
/// app: notifications switched off for the app, the channel lowered or muted
/// after it was created, and Do Not Disturb — which silences even the alarm
/// channel unless this app has been let through.
@immutable
class NotificationState {
  const NotificationState({
    required this.appEnabled,
    required this.channelExists,
    required this.channelImportance,
    required this.dndActive,
    required this.canBypassDnd,
  });

  final bool appEnabled;
  final bool channelExists;

  /// Android's own scale. 4 is the max this app asks for; anything lower means
  /// somebody turned it down and the alert will not interrupt.
  final int channelImportance;

  final bool dndActive;
  final bool canBypassDnd;

  static const unknown = NotificationState(
    appEnabled: true,
    channelExists: false,
    channelImportance: -1,
    dndActive: false,
    canBypassDnd: true,
  );

  /// True only when nothing is standing between a call and the nurse hearing it.
  bool get willAlert =>
      appEnabled &&
      (!channelExists || channelImportance >= 4) &&
      (!dndActive || canBypassDnd);

  /// The single most important thing wrong, in the order it silences a call.
  String? get problem {
    if (!appEnabled) return 'Bildirishnomalar o‘chirilgan';
    if (channelExists && channelImportance <= 0) {
      return 'Chaqiruv bildirishnomasi o‘chirilgan';
    }
    if (channelExists && channelImportance < 4) {
      return 'Chaqiruv bildirishnomasi pasaytirilgan — ekranda chiqmaydi';
    }
    if (dndActive && !canBypassDnd) {
      return '“Bezovta qilmang” yoqilgan — chaqiruv ovozi eshitilmaydi';
    }
    return null;
  }

  factory NotificationState.fromMap(Map<dynamic, dynamic> m) =>
      NotificationState(
        appEnabled: m['appEnabled'] as bool? ?? true,
        channelExists: m['channelExists'] as bool? ?? false,
        channelImportance: m['channelImportance'] as int? ?? -1,
        dndActive: m['dndActive'] as bool? ?? false,
        canBypassDnd: m['canBypassDnd'] as bool? ?? true,
      );
}
