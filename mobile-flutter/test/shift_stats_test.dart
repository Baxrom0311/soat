import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/api/models.dart';
import 'package:nursecall/calls/shift_stats.dart';

final _now = DateTime(2026, 10, 1, 15, 0);

HistoryCall _h({required int agoMinutes, int? answeredAfterSeconds}) {
  final created = _now.subtract(Duration(minutes: agoMinutes));
  return HistoryCall(
    createdAt: created.toUtc(),
    acknowledgedAt: answeredAfterSeconds == null
        ? null
        : created.add(Duration(seconds: answeredAfterSeconds)).toUtc(),
  );
}

void main() {
  group('ShiftStats', () {
    test('an empty history reports nothing rather than a confident zero', () {
      final s = ShiftStats.from(const [], _now);
      expect(s.typicalAnswer, isNull);
      expect(s.answeredToday, 0);
      expect(answerLabel(s.typicalAnswer), '—');
    });

    test('calls still waiting are not counted as answered', () {
      final s = ShiftStats.from([_h(agoMinutes: 10)], _now);
      expect(s.answeredToday, 0);
      expect(s.typicalAnswer, isNull);
    });

    test('yesterday does not count towards today', () {
      final s = ShiftStats.from([
        _h(agoMinutes: 60 * 20, answeredAfterSeconds: 30),
      ], _now);
      expect(s.answeredToday, 0);
    });

    test(
      'a few slow outliers do not drag the figure somewhere unrecognisable',
      () {
        // This is the whole reason it is a median. On the real database one
        // clinic's mean was 435 minutes while its median was two: calls cleared in
        // a batch hours later moved the average, not the experience.
        final s = ShiftStats.from([
          _h(agoMinutes: 30, answeredAfterSeconds: 40),
          _h(agoMinutes: 29, answeredAfterSeconds: 50),
          _h(agoMinutes: 28, answeredAfterSeconds: 60),
          _h(agoMinutes: 27, answeredAfterSeconds: 70),
          _h(agoMinutes: 26, answeredAfterSeconds: 26000),
        ], _now);
        expect(s.answeredToday, 5);
        expect(s.typicalAnswer, const Duration(seconds: 60));
      },
    );

    test(
      'an even number of calls takes the midpoint of the two middle ones',
      () {
        final s = ShiftStats.from([
          _h(agoMinutes: 30, answeredAfterSeconds: 10),
          _h(agoMinutes: 29, answeredAfterSeconds: 20),
          _h(agoMinutes: 28, answeredAfterSeconds: 40),
          _h(agoMinutes: 27, answeredAfterSeconds: 60),
        ], _now);
        expect(s.typicalAnswer, const Duration(seconds: 30));
      },
    );
  });

  group('answerLabel', () {
    test('under a minute is seconds', () {
      expect(answerLabel(const Duration(seconds: 48)), '48s');
    });

    test('minutes and seconds, as the design shows', () {
      expect(answerLabel(const Duration(minutes: 1, seconds: 15)), '1m 15s');
    });

    test('a whole number of minutes drops the seconds', () {
      expect(answerLabel(const Duration(minutes: 4)), '4m');
    });

    test('hours are spelled out, so nothing reads as seconds', () {
      // "1s 05m" could mean one second or one hour. It must not be possible.
      expect(answerLabel(const Duration(hours: 2, minutes: 5)), '2 soat 5m');
      expect(answerLabel(const Duration(hours: 1)), '1 soat');
    });
  });
}
