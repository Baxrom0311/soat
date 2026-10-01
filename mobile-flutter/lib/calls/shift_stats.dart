import '../api/models.dart';

/// The two numbers in the strip under the call list.
///
/// Computed on the phone from the history the nurse can already read, rather
/// than from a new endpoint. That keeps them honest in a way a clinic-wide
/// figure would not be: the history route is floor-filtered for a nurse, so
/// these describe the wards she actually covers.
class ShiftStats {
  const ShiftStats({this.typicalAnswer, required this.answeredToday});

  /// Null until at least one call has been answered — better than showing a
  /// confident "0:00" for a shift that has not started.
  final Duration? typicalAnswer;
  final int answeredToday;

  static const empty = ShiftStats(answeredToday: 0);

  /// [now] is passed in rather than read, so "today" is testable.
  factory ShiftStats.from(List<HistoryCall> history, DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    final answeredTimes = <Duration>[];
    var count = 0;

    for (final call in history) {
      final took = call.answeredIn;
      if (took == null) continue;
      final at = call.acknowledgedAt!.toLocal();
      if (at.isBefore(today)) continue;
      count++;
      if (!took.isNegative) answeredTimes.add(took);
    }

    if (answeredTimes.isEmpty) return ShiftStats(answeredToday: count);

    // The median, not the mean, despite the label reading "o'rtacha".
    //
    // Measured on the real database, one clinic's mean answer time was 435
    // minutes while its median was two: a handful of calls cleared in a batch
    // hours later dragged the average somewhere no nurse would recognise. The
    // median is what "typically" actually means, and it is the number that would
    // have told the truth about that ward.
    answeredTimes.sort();
    final mid = answeredTimes.length ~/ 2;
    final median = answeredTimes.length.isOdd
        ? answeredTimes[mid]
        : Duration(
            microseconds:
                (answeredTimes[mid - 1].inMicroseconds +
                    answeredTimes[mid].inMicroseconds) ~/
                2,
          );

    return ShiftStats(typicalAnswer: median, answeredToday: count);
  }
}

/// `48s`, `1m 15s`, `2 soat 5m` — the shape the design shows.
///
/// Hours are spelled out rather than abbreviated: in Uzbek the natural short
/// form for soat collides with the one already used for soniya, and a strip
/// that reads "1s 05m" could mean either one second or one hour.
String answerLabel(Duration? d) {
  if (d == null) return '—';
  final secs = d.inSeconds;
  if (secs < 60) return '${secs}s';
  final mins = secs ~/ 60;
  final restSecs = secs % 60;
  if (mins < 60) return restSecs == 0 ? '${mins}m' : '${mins}m ${restSecs}s';
  final hours = mins ~/ 60;
  final restMins = mins % 60;
  return restMins == 0 ? '$hours soat' : '$hours soat ${restMins}m';
}
