using System.Windows.Media;
using NurseCall.Core;

namespace NurseCall.Theme
{
    /// <summary>
    /// Converts <see cref="Tokens"/>' platform-neutral <c>System.Drawing.Color</c>
    /// values into WPF's <see cref="Brush"/>/<see cref="Color"/> types, once,
    /// at static-init time -- so the hex values themselves live in exactly
    /// one place (NurseCall.Core/Tokens.cs) instead of being retyped into
    /// XAML as a second copy that could drift from it.
    /// </summary>
    public static class WpfTokens
    {
        public static Color ToWpf(System.Drawing.Color c) => Color.FromRgb(c.R, c.G, c.B);
        public static SolidColorBrush Brush(System.Drawing.Color c) => new SolidColorBrush(ToWpf(c));

        public static readonly SolidColorBrush PageBrush = Brush(Tokens.Page);
        public static readonly SolidColorBrush CardBrush = Brush(Tokens.Card);
        public static readonly SolidColorBrush BorderBrush = Brush(Tokens.Border);
        public static readonly SolidColorBrush Text1Brush = Brush(Tokens.Text1);
        public static readonly SolidColorBrush Text3Brush = Brush(Tokens.Text3);
        public static readonly SolidColorBrush AccentBrush = Brush(Tokens.Sky400);
        public static readonly SolidColorBrush RedBrush = Brush(Tokens.Red600);

        public readonly struct CallStepBrushes
        {
            public CallStepBrushes(SolidColorBrush card, SolidColorBrush border, SolidColorBrush accent,
                SolidColorBrush buttonFrom, SolidColorBrush buttonTo, SolidColorBrush buttonInk)
            {
                Card = card;
                Border = border;
                Accent = accent;
                ButtonFrom = buttonFrom;
                ButtonTo = buttonTo;
                ButtonInk = buttonInk;
            }

            public SolidColorBrush Card { get; }
            public SolidColorBrush Border { get; }
            public SolidColorBrush Accent { get; }
            public SolidColorBrush ButtonFrom { get; }
            public SolidColorBrush ButtonTo { get; }
            public SolidColorBrush ButtonInk { get; }
        }

        /// <summary>Step 1/2/3 brushes, built on demand from <see cref="Tokens.Step"/> rather than cached per-step.</summary>
        public static CallStepBrushes StepBrushes(int step)
        {
            var s = Tokens.Step(step);
            return new CallStepBrushes(
                Brush(s.Card), Brush(s.Border), Brush(s.Accent),
                Brush(s.ButtonFrom), Brush(s.ButtonTo), Brush(s.ButtonInk));
        }
    }
}
