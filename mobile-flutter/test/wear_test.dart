// Handing the nurse's session to the ward watch.
//
// The failure that matters is not "it didn't send" -- a watch in a drawer is a
// normal state and the screen says so. It is claiming the watch has her session
// when it does not, because the nurse then puts the phone down believing the
// watch will ring for her, and nothing will.

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/wear/wear_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('uz.boos.nursecall/wear');
  final calls = <MethodCall>[];

  /// Installs a fake platform side. [watches] is what connectedWatches returns;
  /// [sendResult] is what sendToken answers, or null to throw.
  void fakePlatform({
    List<String> watches = const [],
    Object? sendResult = true,
  }) {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          return switch (call.method) {
            'connectedWatches' => watches,
            'sendToken' =>
              sendResult is Exception
                  ? throw PlatformException(code: 'ERR')
                  : sendResult,
            _ => null,
          };
        });
  }

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  group('finding the watch', () {
    test('no watch is a state, not an error', () async {
      fakePlatform();
      final state = await WearService().refresh();
      expect(state.connected, isFalse);
      expect(state.names, isEmpty);
    });

    test('a connected watch is named, so the nurse knows which one', () async {
      fakePlatform(watches: ['Galaxy Watch 5']);
      final state = await WearService().refresh();
      expect(state.connected, isTrue);
      expect(state.names, ['Galaxy Watch 5']);
    });

    test('a platform failure reads as no watch, not as a crash', () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            channel,
            (_) async => throw PlatformException(code: 'BLUETOOTH_OFF'),
          );
      final state = await WearService().refresh();
      expect(state.connected, isFalse);
    });

    test('a build without the bridge does not throw', () async {
      // iOS, or the preview build. MissingPluginException must not reach a
      // screen that is only trying to render a row.
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
      final state = await WearService().refresh();
      expect(state.connected, isFalse);
    });
  });

  group('sending the session', () {
    test('the token is what is sent, under the agreed name', () async {
      // The watch build in the field reads this exact argument. A rename here
      // would leave every deployed watch silently unable to sign in.
      fakePlatform(watches: ['Watch']);
      await WearService().sendToken('jwt-abc');
      expect(calls.single.method, 'sendToken');
      expect(calls.single.arguments, {'token': 'jwt-abc'});
    });

    test('a successful send is remembered', () async {
      fakePlatform(watches: ['Watch']);
      final wear = WearService();
      expect(await wear.sendToken('jwt-abc'), isTrue);
      expect(wear.state.tokenSent, isTrue);
    });

    test('a failed send is never reported as sent', () async {
      // The whole point: a nurse must not be told the watch has her session
      // when it has not, or she puts the phone down and the watch stays silent.
      fakePlatform(sendResult: false);
      final wear = WearService();
      expect(await wear.sendToken('jwt-abc'), isFalse);
      expect(wear.state.tokenSent, isFalse);
    });

    test('a platform exception is a failed send, not an exception', () async {
      fakePlatform(sendResult: Exception());
      final wear = WearService();
      expect(await wear.sendToken('jwt-abc'), isFalse);
      expect(wear.state.tokenSent, isFalse);
    });
  });

  group('signing the watch out', () {
    test('it sends an empty token, which is the agreed sign-out', () async {
      fakePlatform(watches: ['Watch']);
      await WearService().signOutWatch();
      expect(calls.single.arguments, {'token': ''});
    });

    test('a successful sign-out is not recorded as a session sent', () async {
      // The subtle one, and the first version of this test missed it. Sign-out
      // goes through sendToken, which records success -- so a sign-out that
      // *worked* would set "session sent on the watch" to true, and the profile
      // would claim the watch holds a session it was just told to drop.
      //
      // Checked with a reachable watch on purpose: with an unreachable one the
      // send fails and the flag ends up false either way, which is exactly how
      // the earlier version of this test passed against the broken code.
      fakePlatform(sendResult: true);
      final wear = WearService();
      await wear.sendToken('jwt-abc');
      expect(wear.state.tokenSent, isTrue);

      expect(await wear.signOutWatch(), isTrue);
      expect(wear.state.tokenSent, isFalse);
    });
  });
}
