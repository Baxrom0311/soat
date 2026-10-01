// The profile settings, tested where the subtlety actually is.
//
// Not the layout -- that is checked by screenshot -- but the two pieces of
// logic a nurse's safety rests on: whether the app is honest about Android
// being about to swallow a call, and whether a preference survives storage
// that refuses to answer.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/settings/settings_store.dart';

NotificationState _state({
  bool appEnabled = true,
  bool channelExists = true,
  int channelImportance = 4,
  bool dndActive = false,
  bool canBypassDnd = true,
}) => NotificationState(
  appEnabled: appEnabled,
  channelExists: channelExists,
  channelImportance: channelImportance,
  dndActive: dndActive,
  canBypassDnd: canBypassDnd,
);

void main() {
  group('NotificationState', () {
    test('a healthy handset reports no problem', () {
      final s = _state();
      expect(s.willAlert, isTrue);
      expect(s.problem, isNull);
    });

    test('notifications off for the app silences everything', () {
      final s = _state(appEnabled: false);
      expect(s.willAlert, isFalse);
      expect(s.problem, contains('Bildirishnomalar'));
    });

    test('a lowered channel is reported even though it still shows', () {
      // Importance 3 still posts a notification, but it does not take over the
      // screen -- which, for a sleeping phone on a ward desk, is the same as
      // not arriving. This is the case most likely to be missed.
      final s = _state(channelImportance: 3);
      expect(s.willAlert, isFalse);
      expect(s.problem, contains('pasaytirilgan'));
    });

    test('a muted channel is reported as off, not as lowered', () {
      final s = _state(channelImportance: 0);
      expect(s.problem, contains('o‘chirilgan'));
      expect(s.problem, isNot(contains('pasaytirilgan')));
    });

    test('Do Not Disturb counts only when this app cannot bypass it', () {
      expect(_state(dndActive: true, canBypassDnd: true).willAlert, isTrue);
      final blocked = _state(dndActive: true, canBypassDnd: false);
      expect(blocked.willAlert, isFalse);
      expect(blocked.problem, contains('Bezovta'));
    });

    test('the app being off outranks every other fault', () {
      // Order matters: fixing DND first would leave the nurse still deaf.
      final s = _state(
        appEnabled: false,
        channelImportance: 0,
        dndActive: true,
        canBypassDnd: false,
      );
      expect(s.problem, contains('Bildirishnomalar'));
    });

    test('a channel not yet created is not treated as a fault', () {
      // Before the first call the channel does not exist; importance -1 must
      // not be read as "somebody turned it down".
      final s = _state(channelExists: false, channelImportance: -1);
      expect(s.willAlert, isTrue);
      expect(s.problem, isNull);
    });

    test('the unknown default assumes the phone will ring', () {
      expect(NotificationState.unknown.willAlert, isTrue);
      expect(NotificationState.unknown.problem, isNull);
    });
  });

  group('SettingsStore', () {
    // No secure-storage plugin is registered under the test binding, so every
    // read and write throws MissingPluginException. That is exactly the case
    // the store has to survive: a handset whose keystore will not answer.
    TestWidgetsFlutterBinding.ensureInitialized();

    test(
      'unreadable storage leaves the safe defaults and still loads',
      () async {
        final s = SettingsStore();
        await s.load();
        expect(s.loaded, isTrue);
        expect(s.themeMode, ThemeMode.system);
        expect(
          s.pushEnabled,
          isTrue,
          reason: 'silence must never be a default',
        );
      },
    );

    test('a failed write does not lose the choice in this session', () async {
      final s = SettingsStore();
      var notified = 0;
      s.addListener(() => notified++);

      await s.setThemeMode(ThemeMode.light);
      expect(s.themeMode, ThemeMode.light);
      await s.setPushEnabled(false);
      expect(s.pushEnabled, isFalse);
      expect(notified, 2);
    });

    test('setting the value already held notifies nobody', () async {
      final s = SettingsStore();
      var notified = 0;
      s.addListener(() => notified++);
      await s.setThemeMode(ThemeMode.system);
      await s.setPushEnabled(true);
      expect(notified, 0);
    });
  });
}
