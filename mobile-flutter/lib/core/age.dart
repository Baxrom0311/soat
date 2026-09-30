/// How long a call has been waiting, and what that means visually.
///
/// The thresholds mirror the web dashboard's exactly (tokens.json
/// `call.thresholdsSec`). Two surfaces showing the same ward must not disagree
/// about whether a call is urgent: a nurse glancing at the station screen and
/// then at her phone has to see the same thing, or she stops trusting both.
library;

/// Seconds at which a call moves into the next step. A call is in step N while
/// its age is at or past `thresholdsSec[N-1]` and below `thresholdsSec[N]`.
///
/// Raised from [0, 30, 120] after screenshots of real wards showed almost every
/// call sitting at the top step within minutes — a scale where everything is red
/// tells you nothing. At [0, 120, 600] the top step means "ten minutes with no
/// answer", which is worth looking at.
const List<int> thresholdsSec = [0, 120, 600];

/// 1, 2 or 3 — never 0. A call that has just arrived is still a call.
int ageStep(Duration waited) {
  final s = waited.inSeconds;
  if (s < thresholdsSec[1]) return 1;
  if (s < thresholdsSec[2]) return 2;
  return 3;
}

/// `m:ss` until an hour, then `h:mm:ss`.
///
/// Always a clock, never a word form like "5 daqiqa oldin": a running count is
/// the thing a nurse is actually judging, and a rounded phrase hides the
/// difference between two minutes and nine.
String elapsedLabel(Duration waited) {
  final total = waited.inSeconds < 0 ? 0 : waited.inSeconds;
  final h = total ~/ 3600;
  final m = (total % 3600) ~/ 60;
  final s = total % 60;
  final ss = s.toString().padLeft(2, '0');
  if (h == 0) return '$m:$ss';
  return '$h:${m.toString().padLeft(2, '0')}:$ss';
}
