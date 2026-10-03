/// How long a call has been waiting, and what that means visually.
///
/// The thresholds come from tokens.json, generated — not copied. They used to be
/// written out here by hand under a comment claiming they mirrored the dashboard
/// exactly. They did not: the source, the watch and the dashboard used
/// [0, 30, 120] while this file used [0, 120, 600], so the same patient's call
/// sat amber on the ward watch while the nurse's own phone still showed it calm,
/// for ninety seconds. Nothing caught it, because every surface kept its own copy.
///
/// The phone's numbers were the better-reasoned ones — raised after screenshots
/// of real wards showed almost every call pinned at the top step within minutes,
/// and a scale where everything is red tells you nothing — so tokens.json was
/// moved to them and the other two surfaces now follow.
library;

import '../theme/generated_tokens.dart';

/// Seconds at which a call moves into the next step. A call is in step N while
/// its age is at or past `thresholdsSec[N-1]` and below `thresholdsSec[N]`.
const List<int> thresholdsSec = kCallThresholdsSec;

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
