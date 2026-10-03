import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/core/age.dart';
import 'package:nursecall/theme/generated_tokens.dart';

void main() {
  group('ageStep', () {
    test('a call that just arrived is already step 1, never 0', () {
      // There is no "not yet a call" state: a patient has pressed the button.
      expect(ageStep(Duration.zero), 1);
    });

    test(
      'steps change exactly at the thresholds, not a second either side',
      () {
        expect(ageStep(const Duration(seconds: 119)), 1);
        expect(ageStep(const Duration(seconds: 120)), 2);
        expect(ageStep(const Duration(seconds: 599)), 2);
        expect(ageStep(const Duration(seconds: 600)), 3);
      },
    );

    test('nothing goes past step 3, however long it waits', () {
      expect(ageStep(const Duration(hours: 9)), 3);
    });

    test('the thresholds are the generated ones, not a second copy', () {
      // This test used to assert the literal [0, 120, 600] under a comment
      // saying it matched the web dashboard. It did not match: the dashboard
      // and the watch were on [0, 30, 120]. The test asserted the phone agreed
      // with itself and certified a claim that was false.
      //
      // Now it asserts the only thing worth asserting -- that this surface
      // takes the value from tokens.json rather than keeping its own.
      expect(thresholdsSec, same(kCallThresholdsSec));
    });
  });

  group('elapsedLabel', () {
    test('reads as a clock under an hour', () {
      expect(elapsedLabel(Duration.zero), '0:00');
      expect(elapsedLabel(const Duration(seconds: 9)), '0:09');
      expect(elapsedLabel(const Duration(seconds: 75)), '1:15');
      expect(elapsedLabel(const Duration(minutes: 23, seconds: 8)), '23:08');
      expect(elapsedLabel(const Duration(minutes: 59, seconds: 59)), '59:59');
    });

    test('grows an hours field rather than counting past 59 minutes', () {
      expect(elapsedLabel(const Duration(hours: 1)), '1:00:00');
      expect(
        elapsedLabel(const Duration(hours: 2, minutes: 5, seconds: 3)),
        '2:05:03',
      );
    });

    test(
      'a clock skew that makes a call look future-dated shows 0:00, not a negative',
      () {
        // The phone's clock and the server's can disagree. "-0:03" on a call card
        // would look like a bug in the ward's eyes and tell them nothing useful.
        expect(elapsedLabel(const Duration(seconds: -3)), '0:00');
      },
    );
  });
}
