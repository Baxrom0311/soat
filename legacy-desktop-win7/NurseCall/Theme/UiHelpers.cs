using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Effects;

namespace NurseCall.Theme
{
    /// <summary>
    /// Small factories shared across the admin/history windows, so a
    /// "O'chirish" button or a list row looks and behaves identically
    /// everywhere instead of each window hand-rolling its own close
    /// cousin of the same thing.
    /// </summary>
    public static class UiHelpers
    {
        /// <summary>A borderless text action -- "O'chirish", "Saqlash" -- styled from Styles.xaml's GhostButton.</summary>
        public static Button GhostButton(FrameworkElement owner, string text, SolidColorBrush color) => new Button
        {
            Content = text,
            Foreground = color,
            Style = (Style)owner.FindResource("GhostButton"),
        };

        /// <summary>A card row with a soft shadow -- the "premium" lift that a flat Border alone does not read as clickable.</summary>
        public static Border Card() => new Border
        {
            Background = WpfTokens.CardBrush,
            BorderBrush = WpfTokens.BorderBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(14, 10, 14, 10),
            Margin = new Thickness(0, 0, 0, 8),
            Effect = Elevation(),
        };

        /// <summary>A fresh instance per call -- a WPF Effect cannot be shared across more than one visual.</summary>
        public static DropShadowEffect Elevation() => new DropShadowEffect
        {
            Color = Colors.Black,
            Opacity = 0.35,
            BlurRadius = 14,
            ShadowDepth = 3,
            Direction = 270,
        };
    }
}
