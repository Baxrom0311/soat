import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/desktop/desktop.dart';

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('the desk build is Windows and only Windows', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.windows;
    expect(isDesktop, isTrue);
    for (final p in [TargetPlatform.android, TargetPlatform.iOS]) {
      debugDefaultTargetPlatformOverride = p;
      expect(isDesktop, isFalse);
    }
  });
}
