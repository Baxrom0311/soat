import 'package:flutter/material.dart';

/// The app's palette, taken from the approved Stitch design.
///
/// Dark by default and not switchable. A nurse reads this at 3am in a corridor
/// with the lights down; a white screen at arm's length is the wrong instrument,
/// and an option to choose is one more thing to get wrong on a shared phone.
class T {
  const T._();

  // ---- surfaces ----
  static const Color page = Color(0xFF070B14);
  static const Color card = Color(0xFF0E1526);
  static const Color cardSoft = Color(0xFF141C30);
  static const Color border = Color(0xFF1E2A44);

  // ---- ink ----
  static const Color text1 = Color(0xFFF2F5FA);
  static const Color text2 = Color(0xFFA9B4C8);
  static const Color text3 = Color(0xFF6B7890);

  // ---- the waiting ramp ----
  //
  // Colour here means ONE thing: how long this patient has been waiting. It does
  // not mean urgency — every press of an EV1527 button is identical and the
  // system has no way to know which is serious. Encoding a severity the data
  // cannot support would be a lie a nurse might act on.
  //
  // Blue reads as calm, amber as "look at this", red as "this has gone on too
  // long", which is the order the ward actually experiences.
  static const Color step1 = Color(0xFF38BDF8); // < 2 min
  static const Color step2 = Color(0xFFF59E0B); // 2 – 10 min
  static const Color step3 = Color(0xFFEF4444); // > 10 min

  static const Color ok = Color(0xFF34D399);
  static const Color warn = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);

  /// The fill for a call at [step], 1-based.
  static Color forStep(int step) => switch (step) {
        1 => step1,
        2 => step2,
        _ => step3,
      };

  /// Ink that stays readable on [forStep].
  ///
  /// Amber is a light colour: white text on it fails legibility badly, and a
  /// call card is the one surface where "mostly readable" is not good enough.
  /// Dark ink on amber, white on the other two.
  static Color inkOnStep(int step) =>
      step == 2 ? const Color(0xFF1A1206) : Colors.white;

  static ThemeData theme() {
    const scheme = ColorScheme.dark(
      primary: step1,
      surface: page,
      error: danger,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: page,
      splashFactory: InkRipple.splashFactory,
    );
  }
}
