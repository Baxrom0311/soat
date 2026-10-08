import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/push/push_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('dexterous.com/flutter/local_notifications');

  setUp(() {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    AndroidFlutterLocalNotificationsPlugin.registerWith();
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  void activeNotifications(Object? result) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          if (call.method == 'getActiveNotifications') {
            if (result is Exception) throw result;
            return result;
          }
          return null;
        });
  }

  Map<String, Object?> notification(int id, String channelId) => {
    'id': id,
    'channelId': channelId,
    'groupKey': null,
    'tag': null,
    'title': null,
    'body': null,
    'payload': null,
    'bigText': null,
  };

  test('ringing while the alarm service notification is showing', () async {
    activeNotifications([
      notification(12, callsChannelId),
      notification(7301, alarmServiceChannelId),
    ]);
    expect(
      await alarmServiceRinging(FlutterLocalNotificationsPlugin()),
      isTrue,
    );
  });

  test('not ringing when only call notifications are showing', () async {
    activeNotifications([notification(12, callsChannelId)]);
    expect(
      await alarmServiceRinging(FlutterLocalNotificationsPlugin()),
      isFalse,
    );
  });

  test(
    'a failed lookup counts as not ringing, so the push still sounds',
    () async {
      activeNotifications(PlatformException(code: 'boom'));
      expect(
        await alarmServiceRinging(FlutterLocalNotificationsPlugin()),
        isFalse,
      );
    },
  );
}
