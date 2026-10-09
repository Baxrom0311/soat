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

            var form = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 12) };
            _numberInput = new TextBox { Width = 120, Margin = new Thickness(0, 0, 8, 0), ToolTip = "Xona raqami" };
            _floorInput = new TextBox { Width = 70, Margin = new Thickness(0, 0, 8, 0), ToolTip = "Qavat" };
            var add = new Button { Content = "Qo'shish", Style = (Style)FindResource("PrimaryButton") };
            add.Click += async (s, e) => await AddAsync();
            form.Children.Add(new TextBlock { Text = "Xona:", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 6, 0), Foreground = WpfTokens.Text3Brush });
            form.Children.Add(_numberInput);
            form.Children.Add(new TextBlock { Text = "Qavat:", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 6, 0), Foreground = WpfTokens.Text3Brush });
            form.Children.Add(_floorInput);
            form.Children.Add(add);
            DockPanel.SetDock(form, Dock.Top);
            outer.Children.Add(form);

            _error = new TextBlock { Foreground = WpfTokens.RedBrush, Margin = new Thickness(0, 0, 0, 8), Visibility = Visibility.Collapsed };
            DockPanel.SetDock(_error, Dock.Top);
            outer.Children.Add(_error);

            _list = new StackPanel();
            var scroll = new ScrollViewer { Content = _list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
            outer.Children.Add(scroll);

            Root.Children.Add(outer);
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
            var border = new Border
            {
                Background = WpfTokens.CardBrush, BorderBrush = WpfTokens.BorderBrush, BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8), Padding = new Thickness(12, 8, 12, 8), Margin = new Thickness(0, 0, 0, 6),
            };
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.Children.Add(new TextBlock { Text = $"{r.RoomNumber} — {r.Floor}-qavat", Foreground = WpfTokens.Text1Brush, VerticalAlignment = VerticalAlignment.Center });
            var del = new Button { Content = "O'chirish", Foreground = WpfTokens.RedBrush, Background = System.Windows.Media.Brushes.Transparent, BorderThickness = new Thickness(0), Cursor = System.Windows.Input.Cursors.Hand };
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
