import 'package:flutter/material.dart';

/// The design, transcribed from the approved Stitch screens rather than
/// approximated by eye. Every hex, radius and size here has a counterpart in
/// design-stitch/chaqiruvlar.html; where the design used a Tailwind class name,
/// the palette value it resolves to is written out below.
class T {
  const T._();

  // ------------------------------------------------------------ palette
  // Tailwind's own values, kept under their original names so a future change
  // to the design can be matched class-for-class instead of guessed at.
  static const slate100 = Color(0xFFF1F5F9);
  static const slate200 = Color(0xFFE2E8F0);
  static const slate300 = Color(0xFFCBD5E1);
  static const slate400 = Color(0xFF94A3B8);
  static const slate500 = Color(0xFF64748B);
  static const slate800 = Color(0xFF1E293B);
  static const slate900 = Color(0xFF0F172A);
  static const slate950 = Color(0xFF020617);

  static const sky200 = Color(0xFFBAE6FD);
  static const sky300 = Color(0xFF7DD3FC);
  static const sky400 = Color(0xFF38BDF8);
  static const sky500 = Color(0xFF0EA5E9);
  static const sky950 = Color(0xFF082F49);
  static const cyan400 = Color(0xFF22D3EE);
  static const cyan500 = Color(0xFF06B6D4);

  static const amber200 = Color(0xFFFDE68A);
  static const amber400 = Color(0xFFFBBF24);
  static const amber500 = Color(0xFFF59E0B);
  static const amber600 = Color(0xFFD97706);
  static const amber950 = Color(0xFF451A03);

  static const red200 = Color(0xFFFECACA);
  static const red400 = Color(0xFFF87171);
  static const red500 = Color(0xFFEF4444);
  static const red600 = Color(0xFFDC2626);
  static const red950 = Color(0xFF450A0A);
  static const rose600 = Color(0xFFE11D48);

  static const emerald400 = Color(0xFF34D399);

  // ------------------------------------------------------------ surfaces
  static const page = Color(0xFF060911);
  static const navBar = Color(0xFF070B14);
  static const text1 = slate100;
  static const text2 = slate300;
  static const text3 = slate400;

  // Semantic aliases used outside a call card. They point into the palette
  // above rather than repeating hexes, so a palette change reaches everything.
  static const card = Color(0xFF0E1526);
  static const cardSoft = slate900;
  static const border = slate800;
  static const ok = emerald400;
  static const warn = amber500;
  static const danger = red500;

  /// The accent for a waiting step, for places that need only the colour --
  /// a filter chip or a nav badge, not a whole card.
  static Color stepAccent(int n) => step(n).accent;
  static const step1 = sky400;
  static const step2 = amber400;
  static const step3 = red400;

  // ------------------------------------------------------------ type
  //
  // Two families, as the design has them: Jakarta for words, Grotesk for the
  // numbers. The split is not decoration -- Grotesk's digits are even-width and
  // tall, which is what lets a room number stay legible across a corridor and
  // keeps a running timer from shuffling sideways every second.
  static const sans = 'Jakarta';
  static const mono = 'Grotesk';

  // ------------------------------------------------------------ the ramp
  //
  // Colour on a call card means one thing: how long somebody has been waiting.
  // It is not urgency -- every EV1527 press is identical and the system has no
  // way to know which is serious, so encoding a severity the data cannot support
  // would be a lie a nurse might act on.
  static CallStepStyle step(int step) => switch (step) {
        1 => const CallStepStyle(
            accent: sky400,
            card: Color(0xFF09121A),
            border: sky500,
            borderOpacity: 0.40,
            chipBg: sky950,
            chipInk: sky200,
            glow: sky400,
            glowOpacity: 0.20,
            buttonFrom: sky500,
            buttonVia: sky400,
            buttonTo: cyan500,
            buttonInk: slate950,
            timerIcon: Icons.hourglass_top,
            ambient: sky500,
            ambientSize: 112,
            ambientAtTop: true,
          ),
        2 => const CallStepStyle(
            accent: amber400,
            card: Color(0xFF141008),
            border: amber500,
            borderOpacity: 0.55,
            chipBg: amber950,
            chipInk: amber200,
            glow: amber500,
            glowOpacity: 0.25,
            buttonFrom: amber600,
            buttonVia: amber500,
            buttonTo: amber600,
            // Dark ink, because amber is a light colour and white on it fails
            // legibility badly. A call card is the one surface where "mostly
            // readable" is not good enough.
            buttonInk: slate950,
            timerIcon: Icons.timer_outlined,
            ambient: amber500,
            ambientSize: 112,
            ambientAtTop: false,
          ),
        _ => const CallStepStyle(
            accent: red400,
            card: Color(0xFF140A0E),
            border: red500,
            borderOpacity: 0.70,
            chipBg: red950,
            chipInk: red200,
            glow: red500,
            glowOpacity: 0.55,
            buttonFrom: red600,
            buttonVia: rose600,
            buttonTo: red600,
            buttonInk: Colors.white,
            timerIcon: Icons.schedule,
            ambient: red600,
            ambientSize: 128,
            ambientAtTop: true,
          ),
      };

  static ThemeData theme() => ThemeData(
        useMaterial3: true,
        fontFamily: sans,
        colorScheme: const ColorScheme.dark(
          primary: sky400,
          surface: page,
          error: red500,
        ),
        scaffoldBackgroundColor: page,
      );
}

/// Everything one step of the waiting ramp paints, in one place.
///
/// Gathered into a value rather than spread across switch statements so a card
/// cannot end up half in one step and half in another -- which is exactly the
/// kind of mismatch nobody notices until a nurse reads the wrong urgency off it.
class CallStepStyle {
  const CallStepStyle({
    required this.accent,
    required this.card,
    required this.border,
    required this.borderOpacity,
    required this.chipBg,
    required this.chipInk,
    required this.glow,
    required this.glowOpacity,
    required this.buttonFrom,
    required this.buttonVia,
    required this.buttonTo,
    required this.buttonInk,
    required this.timerIcon,
    required this.ambient,
    required this.ambientSize,
    required this.ambientAtTop,
  });

  final Color accent;
  final Color card;
  final Color border;
  final double borderOpacity;
  final Color chipBg;
  final Color chipInk;
  final Color glow;
  final double glowOpacity;
  final Color buttonFrom;
  final Color buttonVia;
  final Color buttonTo;
  final Color buttonInk;

  /// Changes with the step, as the design does. A second, non-colour channel
  /// for the same fact: someone who cannot separate amber from red still sees
  /// the glyph escalate.
  final IconData timerIcon;

  /// A soft disc bleeding in from one corner, as the design has on every card.
  /// It is what makes the step readable from across a room before any text is:
  /// the eye catches the wash of colour well before it resolves a numeral.
  final Color ambient;
  final double ambientSize;
  final bool ambientAtTop;

  /// Matches the design's per-step opacity: red 20%, amber 15%, sky 10%.
  double get ambientOpacity => ambientSize == 128 ? 0.20 : (ambientAtTop ? 0.10 : 0.15);

  LinearGradient get buttonGradient => LinearGradient(
        colors: [buttonFrom, buttonVia, buttonTo],
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
      );
}
