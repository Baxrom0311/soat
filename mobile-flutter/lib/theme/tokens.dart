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
  static const slate50 = Color(0xFFF8FAFC);
  static const slate100 = Color(0xFFF1F5F9);
  static const slate600 = Color(0xFF475569);
  static const slate700 = Color(0xFF334155);
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
  static const sky50 = Color(0xFFF0F9FF);
  static const sky100 = Color(0xFFE0F2FE);
  static const sky600 = Color(0xFF0284C7);
  static const sky800 = Color(0xFF075985);
  static const sky950 = Color(0xFF082F49);
  static const cyan400 = Color(0xFF22D3EE);
  static const cyan500 = Color(0xFF06B6D4);

  static const amber200 = Color(0xFFFDE68A);
  static const amber400 = Color(0xFFFBBF24);
  static const amber500 = Color(0xFFF59E0B);
  static const amber600 = Color(0xFFD97706);
  static const amber100 = Color(0xFFFEF3C7);
  static const amber700 = Color(0xFFB45309);
  static const amber800 = Color(0xFF92400E);
  static const amber950 = Color(0xFF451A03);

  static const red200 = Color(0xFFFECACA);
  static const red400 = Color(0xFFF87171);
  static const red500 = Color(0xFFEF4444);
  static const red600 = Color(0xFFDC2626);
  static const red100 = Color(0xFFFEE2E2);
  static const red800 = Color(0xFF991B1B);
  static const red950 = Color(0xFF450A0A);
  static const rose600 = Color(0xFFE11D48);

  static const emerald400 = Color(0xFF34D399);
  static const emerald600 = Color(0xFF059669);

  // ------------------------------------------------------------ surfaces
  //
  // Dark is the ground state: a nurse reads this at 3am in a corridor with the
  // lights down. Light exists because the same nurse reads it at noon in a ward
  // with the blinds open, and it follows the handset's own setting rather than
  // adding a switch to a shared phone nobody will agree on.
  static const page = Color(0xFF060911);
  static const navBar = Color(0xFF070B14);
  static const text1 = slate100;
  static const text2 = slate300;
  static const text3 = slate400;

  static const pageLight = Color(0xFFEDF4FC);
  static const cardLight = Color(0xFFFFFFFF);
  static const inkLight = Color(0xFF0D2238);

  /// Surfaces and ink for one brightness.
  static Palette palette(Brightness b) => b == Brightness.light
      ? const Palette(
          page: pageLight,
          card: cardLight,
          navBar: cardLight,
          text1: inkLight,
          text2: slate600,
          text3: slate500,
          border: Color(0xFFCBD6E5),
          // White on a near-white page separates by only 1.11, which is not
          // enough on its own -- the shadow is what actually makes a card read
          // as a card, so it is part of the palette rather than decoration.
          cardShadow: true,
        )
      : const Palette(
          page: page,
          card: Color(0xFF0E1526),
          navBar: navBar,
          text1: text1,
          text2: text2,
          text3: text3,
          border: slate800,
          cardShadow: false,
        );

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
  /// Every value below was chosen by measuring contrast, not by eye. The light
  /// ramp in particular: amber-500 as a border scores 1.94 against the light
  /// page and would have been nearly invisible, which is exactly the kind of
  /// thing that looks fine on a designer's screen and vanishes in a sunlit ward.
  static CallStepStyle step(int step, [Brightness b = Brightness.dark]) =>
      b == Brightness.light ? _lightStep(step) : _darkStep(step);

  static CallStepStyle _lightStep(int step) => switch (step) {
    1 => const CallStepStyle(
      accent: sky600,
      card: cardLight,
      border: sky600,
      borderOpacity: 0.55,
      chipBg: sky100,
      chipInk: sky800,
      glow: sky600,
      glowOpacity: 0.10,
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
      accent: amber700,
      card: cardLight,
      border: amber700,
      borderOpacity: 0.60,
      chipBg: amber100,
      chipInk: amber800,
      glow: amber600,
      glowOpacity: 0.12,
      buttonFrom: amber600,
      buttonVia: amber500,
      buttonTo: amber600,
      buttonInk: slate950,
      timerIcon: Icons.timer_outlined,
      ambient: amber500,
      ambientSize: 112,
      ambientAtTop: false,
    ),
    _ => const CallStepStyle(
      accent: red600,
      card: cardLight,
      border: red600,
      borderOpacity: 0.70,
      chipBg: red100,
      chipInk: red800,
      glow: red500,
      glowOpacity: 0.14,
      buttonFrom: red600,
      buttonVia: rose600,
      buttonTo: red600,
      buttonInk: Colors.white,
      timerIcon: Icons.schedule,
      ambient: red500,
      ambientSize: 128,
      ambientAtTop: true,
    ),
  };

  static CallStepStyle _darkStep(int step) => switch (step) {
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

  static ThemeData theme([Brightness b = Brightness.dark]) {
    final p = palette(b);
    return ThemeData(
      useMaterial3: true,
      fontFamily: sans,
      brightness: b,
      colorScheme: ColorScheme(
        brightness: b,
        primary: b == Brightness.light ? sky600 : sky400,
        onPrimary: b == Brightness.light ? Colors.white : slate950,
        secondary: emerald400,
        onSecondary: slate950,
        error: b == Brightness.light ? red600 : red500,
        onError: Colors.white,
        surface: p.card,
        onSurface: p.text1,
      ),
      scaffoldBackgroundColor: p.page,
      extensions: [p],
    );
  }
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

  /// The room number's ink. White on the dark card; near-black on the light one,
  /// where white would score 1.1 against the card and be unreadable.
  Color get numberInk => card == T.cardLight ? T.inkLight : Colors.white;

  /// A soft disc bleeding in from one corner, as the design has on every card.
  /// It is what makes the step readable from across a room before any text is:
  /// the eye catches the wash of colour well before it resolves a numeral.
  final Color ambient;
  final double ambientSize;
  final bool ambientAtTop;

  /// Matches the design's per-step opacity: red 20%, amber 15%, sky 10%.
  double get ambientOpacity =>
      ambientSize == 128 ? 0.20 : (ambientAtTop ? 0.10 : 0.15);

  LinearGradient get buttonGradient => LinearGradient(
    colors: [buttonFrom, buttonVia, buttonTo],
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
  );
}

/// Surfaces and ink for one brightness.
///
/// A ThemeExtension rather than a parameter threaded through every widget: it
/// rides on ThemeData, so a widget reads the right values for whichever theme is
/// in force without anyone remembering to pass them, and the two themes cannot
/// drift apart by somebody updating one call site.
class Palette extends ThemeExtension<Palette> {
  const Palette({
    required this.page,
    required this.card,
    required this.navBar,
    required this.text1,
    required this.text2,
    required this.text3,
    required this.border,
    required this.cardShadow,
  });

  final Color page;
  final Color card;
  final Color navBar;
  final Color text1;
  final Color text2;
  final Color text3;
  final Color border;

  /// Light mode needs it: a white card separates from the near-white page by
  /// only 1.11, so the shadow is what makes it read as a card at all.
  final bool cardShadow;

  /// Accents that have to stay legible as a glyph on the card.
  ///
  /// Measured: sky-400 scores 2.14 on a white card and emerald-400 scores 1.92,
  /// both under the 3:1 a non-text mark needs. On the dark card the brighter
  /// pair is the readable one. So the shade flips with the theme rather than one
  /// value being used for both and failing in half of them.
  Color get accent => cardShadow ? T.sky600 : T.sky400;

  /// Banner inks. amber-400 scores 1.8 on a near-white card and red-500 scores
  /// 3.4 but reads washed out next to it; the darker pair is what stays legible
  /// in daylight.
  /// One notch off the surface, for chips and pills that sit on the card or the
  /// header and would otherwise vanish into it.
  Color get chipBg => cardShadow ? T.slate50 : T.slate900;

  Color get warnInk => cardShadow ? T.amber700 : T.amber400;
  Color get dangerInk => cardShadow ? T.red600 : T.red500;

  /// A banner's ground: a wash of its own ink over the surface beneath it, which
  /// keeps the tint honest in both themes instead of a dark brown at 30% opacity
  /// turning into mud on white.
  Color bannerBg(Color ink) => Color.alphaBlend(
    ink.withValues(alpha: cardShadow ? 0.10 : 0.18),
    cardShadow ? card : page,
  );
  Color get accentOk => cardShadow ? T.emerald600 : T.emerald400;

  /// Read the palette for whatever theme is in force.
  static Palette of(BuildContext context) =>
      Theme.of(context).extension<Palette>()!;

  @override
  Palette copyWith({
    Color? page,
    Color? card,
    Color? navBar,
    Color? text1,
    Color? text2,
    Color? text3,
    Color? border,
    bool? cardShadow,
  }) => Palette(
    page: page ?? this.page,
    card: card ?? this.card,
    navBar: navBar ?? this.navBar,
    text1: text1 ?? this.text1,
    text2: text2 ?? this.text2,
    text3: text3 ?? this.text3,
    border: border ?? this.border,
    cardShadow: cardShadow ?? this.cardShadow,
  );

  /// Themes are swapped whole rather than animated between, so this returns the
  /// destination outright: a half-interpolated palette would put a light card on
  /// a dark page for a few frames.
  @override
  Palette lerp(Palette? other, double t) => other ?? this;
}
