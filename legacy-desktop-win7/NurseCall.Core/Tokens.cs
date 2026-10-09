using System.Drawing;

namespace NurseCall.Core
{
    /// <summary>
    /// The design, ported from <c>tokens.json</c> (the single source of truth
    /// shared by the web dashboard, the phone app, the watch, and now this
    /// client) and from <c>mobile-flutter/lib/theme/tokens.dart</c>'s own
    /// transcription of it, which carries values <c>tokens.json</c> does not
    /// generate a target for yet (the per-step card/border/glow colours).
    ///
    /// Only the dark ramp is ported here. The Flutter app supports light mode
    /// too, but the design's own comment is explicit that dark is the ground
    /// state ("a nurse reads this at 3am in a corridor"), and a ward PC's
    /// desktop client earns a light theme later, not in the phase that has to
    /// prove itself on the actual Windows 7 box first.
    ///
    /// Hand-copied, not generated from tokens.json at build time (the other
    /// three clients' generators -- tools/generate-tokens.mjs -- do not have a
    /// C# target yet). If tokens.json's "call.thresholdsSec" or the step
    /// colours ever change, this file has to be updated by hand along with
    /// every other client; there is no compiler error that would catch it
    /// drifting, which is exactly why it is `internal` rather than copied
    /// loosely around the codebase.
    /// </summary>
    public static class Tokens
    {
        // ---------------------------------------------------------- thresholds
        //
        // tokens.json: call.thresholdsSec = [0, 120, 600].
        // Step 1 until the first boundary, step 2 up to the second, step 3
        // from there on with no upper bound -- see AgeStep.Compute.
        public static readonly int[] ThresholdsSec = { 0, 120, 600 };

        // -------------------------------------------------------------- palette
        public static readonly Color Slate900 = FromHex("#0F172A");
        public static readonly Color Slate950 = FromHex("#020617");
        public static readonly Color Slate800 = FromHex("#1E293B");

        public static readonly Color Sky400 = FromHex("#38BDF8");
        public static readonly Color Sky500 = FromHex("#0EA5E9");
        public static readonly Color Sky950 = FromHex("#082F49");
        public static readonly Color Sky200 = FromHex("#BAE6FD");
        public static readonly Color Cyan500 = FromHex("#06B6D4");

        public static readonly Color Amber400 = FromHex("#FBBF24");
        public static readonly Color Amber500 = FromHex("#F59E0B");
        public static readonly Color Amber600 = FromHex("#D97706");
        public static readonly Color Amber950 = FromHex("#451A03");
        public static readonly Color Amber200 = FromHex("#FDE68A");

        public static readonly Color Red400 = FromHex("#F87171");
        public static readonly Color Red500 = FromHex("#EF4444");
        public static readonly Color Red600 = FromHex("#DC2626");
        public static readonly Color Red950 = FromHex("#450A0A");
        public static readonly Color Red200 = FromHex("#FECACA");
        public static readonly Color Rose600 = FromHex("#E11D48");

        // ------------------------------------------------------------ surfaces
        public static readonly Color Page = Slate950;
        public static readonly Color Card = FromHex("#0E1526");
        public static readonly Color Border = Slate800;
        public static readonly Color Text1 = FromHex("#F8FAFC");
        public static readonly Color Text3 = FromHex("#94A3B8");

        /// <summary>
        /// One waiting step's whole visual identity -- card tint, border, the
        /// glow bleeding from a corner, and the acknowledge button's gradient.
        /// Dark-mode values only (see the class comment).
        /// </summary>
        public readonly struct CallStepStyle
        {
            public CallStepStyle(Color accent, Color card, Color border, double borderOpacity,
                Color glow, double glowOpacity, Color buttonFrom, Color buttonVia, Color buttonTo,
                Color buttonInk)
            {
                Accent = accent;
                Card = card;
                Border = border;
                BorderOpacity = borderOpacity;
                Glow = glow;
                GlowOpacity = glowOpacity;
                ButtonFrom = buttonFrom;
                ButtonVia = buttonVia;
                ButtonTo = buttonTo;
                ButtonInk = buttonInk;
            }

            public Color Accent { get; }
            public Color Card { get; }
            public Color Border { get; }
            public double BorderOpacity { get; }
            public Color Glow { get; }
            public double GlowOpacity { get; }
            public Color ButtonFrom { get; }
            public Color ButtonVia { get; }
            public Color ButtonTo { get; }
            public Color ButtonInk { get; }
        }

        /// <summary>
        /// Step 1/2/3 only; anything else (including 0, which never actually
        /// happens -- see AgeStep.Compute) falls through to step 3 rather than
        /// throwing, matching the Dart `step()` switch's default case.
        /// </summary>
        public static CallStepStyle Step(int step)
        {
            switch (step)
            {
                case 1:
                    return new CallStepStyle(
                        accent: Sky400, card: FromHex("#09121A"), border: Sky500, borderOpacity: 0.40,
                        glow: Sky500, glowOpacity: 0.20,
                        buttonFrom: Sky500, buttonVia: Sky400, buttonTo: Cyan500, buttonInk: Slate950);
                case 2:
                    return new CallStepStyle(
                        accent: Amber400, card: FromHex("#141008"), border: Amber500, borderOpacity: 0.55,
                        glow: Amber500, glowOpacity: 0.25,
                        buttonFrom: Amber600, buttonVia: Amber500, buttonTo: Amber600,
                        // Dark ink: amber is a light colour, white on it fails legibility.
                        buttonInk: Slate950);
                default:
                    return new CallStepStyle(
                        accent: Red400, card: FromHex("#140A0E"), border: Red500, borderOpacity: 0.70,
                        glow: Red600, glowOpacity: 0.55,
                        buttonFrom: Red600, buttonVia: Rose600, buttonTo: Red600, buttonInk: Color.White);
            }
        }

        private static Color FromHex(string hex)
        {
            hex = hex.TrimStart('#');
            var r = System.Convert.ToInt32(hex.Substring(0, 2), 16);
            var g = System.Convert.ToInt32(hex.Substring(2, 2), 16);
            var b = System.Convert.ToInt32(hex.Substring(4, 2), 16);
            return Color.FromArgb(r, g, b);
        }
    }
}
