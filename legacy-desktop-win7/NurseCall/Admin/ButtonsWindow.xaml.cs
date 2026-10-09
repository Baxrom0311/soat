using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using NurseCall.Core;
using NurseCall.Theme;

namespace NurseCall.Admin
{
    /// <summary>
    /// Pairing a transmitter to a room -- ported from
    /// mobile-flutter/lib/admin/buttons_screen.dart, minus its live
    /// "stand in the room and press it" learn-mode polling UX. That flow
    /// exists on the phone because the installer is standing in the room
    /// holding it; a desk PC is not, so this lists whatever the server has
    /// already seen (GET /api/v1/unassigned-signals) and lets the admin
    /// pair from the code, rather than watching for a press live.
    /// </summary>
    public partial class ButtonsWindow : Window
    {
        private readonly ApiClient _api;
        private System.Collections.Generic.List<Room> _rooms = new System.Collections.Generic.List<Room>();
        private StackPanel _unassignedList = null!;
        private StackPanel _pairedList = null!;

        public ButtonsWindow(ApiClient api)
        {
            InitializeComponent();
            _api = api;
            Build();
            _ = ReloadAsync();
        }

        private void Build()
        {
            var panel = new StackPanel();

            panel.Children.Add(SectionTitle("Kutilayotgan signallar"));
            panel.Children.Add(new TextBlock
            {
                Text = "Hali biror xonaga biriktirilmagan tugma bosishlari.",
                Foreground = WpfTokens.Text3Brush, FontSize = 12, Margin = new Thickness(0, 0, 0, 8), TextWrapping = TextWrapping.Wrap,
            });
            _unassignedList = new StackPanel();
            panel.Children.Add(_unassignedList);

            panel.Children.Add(SectionTitle("Biriktirilgan tugmalar"));
            _pairedList = new StackPanel();
            panel.Children.Add(_pairedList);

            Root.Children.Add(new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        }

        private static TextBlock SectionTitle(string text) => new TextBlock
        {
            Text = text, FontWeight = FontWeights.Bold, Foreground = WpfTokens.Text1Brush, Margin = new Thickness(0, 12, 0, 6),
        };

        private async System.Threading.Tasks.Task ReloadAsync()
        {
            _unassignedList.Children.Clear();
            _pairedList.Children.Clear();
            try
            {
                _rooms = await _api.RoomsAsync().ConfigureAwait(true);
                var unassigned = await _api.UnassignedSignalsAsync().ConfigureAwait(true);
                var paired = await _api.ButtonsAsync().ConfigureAwait(true);

                if (unassigned.Count == 0)
                {
                    _unassignedList.Children.Add(new TextBlock { Text = "Yo'q", Foreground = WpfTokens.Text3Brush, FontSize = 12 });
                }
                foreach (var s in unassigned) _unassignedList.Children.Add(UnassignedRow(s));

                if (paired.Count == 0)
                {
                    _pairedList.Children.Add(new TextBlock { Text = "Yo'q", Foreground = WpfTokens.Text3Brush, FontSize = 12 });
                }
                foreach (var b in paired) _pairedList.Children.Add(PairedRow(b));
            }
            catch
            {
                _unassignedList.Children.Add(new TextBlock { Text = "Yuklab bo'lmadi", Foreground = WpfTokens.Text3Brush });
            }
        }

        private Border UnassignedRow(UnassignedSignal s)
        {
            var border = Card();
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var left = new StackPanel();
            left.Children.Add(new TextBlock { Text = $"Kod: {s.Code}", Foreground = WpfTokens.Text1Brush, FontWeight = FontWeights.Bold });
            left.Children.Add(new TextBlock { Text = $"{s.DeviceId} · {s.SeenCount} marta ko'rildi", Foreground = WpfTokens.Text3Brush, FontSize = 12 });
            Grid.SetColumn(left, 0);
            grid.Children.Add(left);

            var roomPicker = new ComboBox { Width = 140, Margin = new Thickness(8, 0, 8, 0), ItemsSource = _rooms, DisplayMemberPath = "RoomNumber" };
            if (_rooms.Count > 0) roomPicker.SelectedIndex = 0;
            Grid.SetColumn(roomPicker, 1);
            grid.Children.Add(roomPicker);

            var pair = new Button { Content = "Biriktirish", Style = (Style)FindResource("PrimaryButton") };
            pair.Click += async (sender, e) =>
            {
                if (roomPicker.SelectedItem is not Room room) return;
                try { await _api.PairButtonAsync(s.Code, room.Id).ConfigureAwait(true); await ReloadAsync(); }
                catch (ApiException ex) { MessageBox.Show(this, ex.Message); }
            };
            Grid.SetColumn(pair, 2);
            grid.Children.Add(pair);

            border.Child = grid;
            return border;
        }

        private Border PairedRow(ButtonPairing b)
        {
            var border = Card();
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.Children.Add(new TextBlock
            {
                Text = $"Kod {b.Code} → {b.RoomNumber} ({b.Floor}-qavat)",
                Foreground = WpfTokens.Text1Brush, VerticalAlignment = VerticalAlignment.Center,
            });
            var del = new Button { Content = "O'chirish", Foreground = WpfTokens.RedBrush, Background = System.Windows.Media.Brushes.Transparent, BorderThickness = new Thickness(0), Cursor = System.Windows.Input.Cursors.Hand };
            del.Click += async (s, e) =>
            {
                if (MessageBox.Show(this, "Bu biriktiruv o'chirilsinmi?", "Tasdiqlang", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
                try { await _api.DeleteButtonAsync(b.Id).ConfigureAwait(true); await ReloadAsync(); }
                catch { MessageBox.Show(this, "O'chirib bo'lmadi"); }
            };
            Grid.SetColumn(del, 1);
            grid.Children.Add(del);
            border.Child = grid;
            return border;
        }

        private static Border Card() => new Border
        {
            Background = WpfTokens.CardBrush, BorderBrush = WpfTokens.BorderBrush, BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8), Padding = new Thickness(12, 8, 12, 8), Margin = new Thickness(0, 0, 0, 6),
        };
    }
}
