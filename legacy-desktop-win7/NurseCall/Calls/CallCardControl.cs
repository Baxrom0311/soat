using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using NurseCall.Core;
using NurseCall.Theme;

namespace NurseCall.Calls
{
    /// <summary>
    /// One waiting patient -- built in code rather than XAML (this whole
    /// project cannot be compiled on the machine that wrote it; minimizing
    /// XAML keeps mistakes catchable by the C# compiler on every commit
    /// instead of only surfacing on the next windows-latest CI run).
    /// Visual structure ported from mobile-flutter/lib/calls/call_card.dart:
    /// a big room number, a floor chip, an elapsed-time chip, and an
    /// acknowledge button, tinted by the waiting step's colour.
    /// </summary>
    public class CallCardControl : Border
    {
        private readonly TextBlock _elapsedText;
        private readonly Button _ackButton;
        private readonly TextBlock _ackLabel;
        private bool _busy;

        public Call Call { get; }
        public event Action? Acknowledge;

        public CallCardControl(Call call, DateTime now)
        {
            Call = call;
            CornerRadius = new CornerRadius(16);
            Margin = new Thickness(0, 0, 0, 14);
            Padding = new Thickness(16);
            BorderThickness = new Thickness(1);

            var step = AgeStep.Compute(call.Waited(now));
            var style = WpfTokens.StepBrushes(step);
            Background = style.Card;
            BorderBrush = style.Border;

            var root = new StackPanel();

            var topRow = new Grid();
            topRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            topRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            topRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var roomAndFloor = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Bottom };
            roomAndFloor.Children.Add(new TextBlock
            {
                Text = call.RoomNumber,
                FontSize = 48,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                VerticalAlignment = VerticalAlignment.Bottom,
            });
            roomAndFloor.Children.Add(new Border
            {
                Margin = new Thickness(10, 0, 0, 6),
                Padding = new Thickness(10, 2, 10, 2),
                CornerRadius = new CornerRadius(6),
                Background = style.Card,
                BorderBrush = style.Border,
                BorderThickness = new Thickness(1),
                Child = new TextBlock
                {
                    Text = $"{call.Floor}-qavat",
                    FontSize = 12,
                    FontWeight = FontWeights.Bold,
                    Foreground = style.Accent,
                },
            });
            Grid.SetColumn(roomAndFloor, 0);
            topRow.Children.Add(roomAndFloor);

            _elapsedText = new TextBlock
            {
                Text = AgeStep.ElapsedLabel(call.Waited(now)),
                FontSize = 17,
                FontWeight = FontWeights.Bold,
                Foreground = style.Accent,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Right,
            };
            Grid.SetColumn(_elapsedText, 2);
            topRow.Children.Add(_elapsedText);

            root.Children.Add(topRow);

            _ackLabel = new TextBlock
            {
                Text = "Qabul qilish",
                FontWeight = FontWeights.Bold,
                Foreground = style.ButtonInk,
                HorizontalAlignment = HorizontalAlignment.Center,
            };
            _ackButton = new Button
            {
                Content = _ackLabel,
                Margin = new Thickness(0, 16, 0, 0),
                Height = 44,
                Background = style.ButtonFrom,
                BorderThickness = new Thickness(0),
                Cursor = System.Windows.Input.Cursors.Hand,
            };
            _ackButton.Click += (s, e) => Acknowledge?.Invoke();
            root.Children.Add(_ackButton);

            Child = root;
        }

        /// <summary>Refreshes just the running clock -- called every second by the owning panel, not a full rebuild.</summary>
        public void Tick(DateTime now) => _elapsedText.Text = AgeStep.ElapsedLabel(Call.Waited(now));

        /// <summary>Two taps while one request is in flight would mean two nurses believing they answered.</summary>
        public void SetBusy(bool busy)
        {
            _busy = busy;
            _ackButton.IsEnabled = !busy;
            _ackLabel.Text = busy ? "Yuborilmoqda..." : "Qabul qilish";
            Opacity = busy ? 0.6 : 1.0;
        }
    }
}
