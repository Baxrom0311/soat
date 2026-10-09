using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using NurseCall.Core;
using NurseCall.Theme;

namespace NurseCall.Admin
{
    /// <summary>Rooms CRUD, ported from mobile-flutter/lib/admin/rooms_screen.dart.</summary>
    public partial class RoomsWindow : Window
    {
        private readonly ApiClient _api;
        private StackPanel _list = null!;
        private TextBox _numberInput = null!;
        private TextBox _floorInput = null!;
        private TextBlock _error = null!;

        public RoomsWindow(ApiClient api)
        {
            InitializeComponent();
            _api = api;
            Build();
            _ = ReloadAsync();
        }

        private void Build()
        {
            var outer = new DockPanel();

            var form = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Bottom };
            _numberInput = new TextBox { Width = 130, Margin = new Thickness(0, 0, 8, 0), ToolTip = "Xona raqami" };
            _floorInput = new TextBox { Width = 70, Margin = new Thickness(0, 0, 8, 0), ToolTip = "Qavat" };
            var add = new Button { Content = "Qo'shish", Style = (Style)FindResource("PrimaryButton") };
            add.Click += async (s, e) => await AddAsync();
            form.Children.Add(Labeled("Xona", _numberInput));
            form.Children.Add(Labeled("Qavat", _floorInput));
            form.Children.Add(add);

            var formCard = new Border
            {
                Background = WpfTokens.CardBrush,
                BorderBrush = WpfTokens.BorderBrush,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(14),
                Margin = new Thickness(0, 0, 0, 16),
                Child = form,
            };
            DockPanel.SetDock(formCard, Dock.Top);
            outer.Children.Add(formCard);

            _error = new TextBlock { Foreground = WpfTokens.RedBrush, Margin = new Thickness(0, 0, 0, 8), Visibility = Visibility.Collapsed, TextWrapping = TextWrapping.Wrap };
            DockPanel.SetDock(_error, Dock.Top);
            outer.Children.Add(_error);

            _list = new StackPanel();
            var scroll = new ScrollViewer { Content = _list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
            outer.Children.Add(scroll);

            Root.Children.Add(outer);
        }

        private static StackPanel Labeled(string label, Control input)
        {
            var p = new StackPanel { Margin = new Thickness(0, 0, 10, 0) };
            p.Children.Add(new TextBlock { Text = label, FontSize = 11, Foreground = WpfTokens.Text3Brush, Margin = new Thickness(2, 0, 0, 4) });
            p.Children.Add(input);
            return p;
        }

        private async System.Threading.Tasks.Task ReloadAsync()
        {
            _list.Children.Clear();
            try
            {
                var rooms = (await _api.RoomsAsync().ConfigureAwait(true))
                    .OrderBy(r => r.Floor).ThenBy(r => r.RoomNumber).ToList();
                foreach (var r in rooms) _list.Children.Add(Row(r));
            }
            catch
            {
                _list.Children.Add(new TextBlock { Text = "Yuklab bo'lmadi", Foreground = WpfTokens.Text3Brush });
            }
        }

        private Border Row(Room r)
        {
            var border = UiHelpers.Card();
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.Children.Add(new TextBlock
            {
                Text = $"{r.RoomNumber} — {r.Floor}-qavat",
                Foreground = WpfTokens.Text1Brush, FontWeight = FontWeights.SemiBold, VerticalAlignment = VerticalAlignment.Center,
            });
            var del = UiHelpers.GhostButton(this, "O'chirish", WpfTokens.RedBrush);
            del.Click += async (s, e) =>
            {
                if (MessageBox.Show(this, $"{r.RoomNumber} xonasi o'chirilsinmi?", "Tasdiqlang", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
                try { await _api.DeleteRoomAsync(r.Id).ConfigureAwait(true); await ReloadAsync(); }
                catch { MessageBox.Show(this, "O'chirib bo'lmadi"); }
            };
            Grid.SetColumn(del, 1);
            grid.Children.Add(del);
            border.Child = grid;
            return border;
        }

        private async System.Threading.Tasks.Task AddAsync()
        {
            _error.Visibility = Visibility.Collapsed;
            if (string.IsNullOrWhiteSpace(_numberInput.Text) || !int.TryParse(_floorInput.Text, out var floor))
            {
                _error.Text = "Xona raqami va qavat (butun son) kiriting";
                _error.Visibility = Visibility.Visible;
                return;
            }
            try
            {
                await _api.CreateRoomAsync(_numberInput.Text.Trim(), floor).ConfigureAwait(true);
                _numberInput.Text = "";
                _floorInput.Text = "";
                await ReloadAsync();
            }
            catch (ApiException ex)
            {
                _error.Text = ex.Message;
                _error.Visibility = Visibility.Visible;
            }
        }
    }
}
