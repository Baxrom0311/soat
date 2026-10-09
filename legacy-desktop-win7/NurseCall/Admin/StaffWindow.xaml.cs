using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using NurseCall.Core;
using NurseCall.Theme;

namespace NurseCall.Admin
{
    /// <summary>Staff accounts and floor coverage, ported from mobile-flutter/lib/admin/staff_screen.dart.</summary>
    public partial class StaffWindow : Window
    {
        private readonly ApiClient _api;
        private StackPanel _list = null!;
        private TextBox _name = null!, _email = null!, _password = null!, _floors = null!;
        private ComboBox _role = null!;
        private TextBlock _error = null!;

        public StaffWindow(ApiClient api)
        {
            InitializeComponent();
            _api = api;
            Build();
            _ = ReloadAsync();
        }

        private void Build()
        {
            var outer = new DockPanel();

            var form = new StackPanel();
            var row1 = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 10) };
            _name = new TextBox { Width = 150, Margin = new Thickness(0, 0, 10, 0) };
            _email = new TextBox { Width = 190, Margin = new Thickness(0, 0, 10, 0) };
            row1.Children.Add(Labeled("Ism", _name));
            row1.Children.Add(Labeled("Email", _email));
            form.Children.Add(row1);

            var row2 = new StackPanel { Orientation = Orientation.Horizontal };
            _password = new TextBox { Width = 150, Margin = new Thickness(0, 0, 10, 0) };
            _role = new ComboBox { Width = 110, Margin = new Thickness(0, 0, 10, 0), ItemsSource = new[] { "nurse", "admin" }, SelectedIndex = 0 };
            _floors = new TextBox { Width = 110, Margin = new Thickness(0, 0, 10, 0), ToolTip = "masalan: 1,2 (bo'sh = barcha qavatlar)" };
            row2.Children.Add(Labeled("Parol", _password));
            row2.Children.Add(Labeled("Rol", _role));
            row2.Children.Add(Labeled("Qavatlar", _floors));
            var add = new Button { Content = "Qo'shish", Style = (Style)FindResource("PrimaryButton"), VerticalAlignment = VerticalAlignment.Bottom };
            add.Click += async (s, e) => await AddAsync();
            row2.Children.Add(add);
            form.Children.Add(row2);

            _error = new TextBlock { Foreground = WpfTokens.RedBrush, Margin = new Thickness(0, 10, 0, 0), Visibility = Visibility.Collapsed, TextWrapping = TextWrapping.Wrap };
            form.Children.Add(_error);

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

            _list = new StackPanel();
            outer.Children.Add(new ScrollViewer { Content = _list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });

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
                var staff = (await _api.StaffAsync().ConfigureAwait(true)).OrderBy(s => s.Name).ToList();
                foreach (var s in staff) _list.Children.Add(Row(s));
            }
            catch
            {
                _list.Children.Add(new TextBlock { Text = "Yuklab bo'lmadi", Foreground = WpfTokens.Text3Brush });
            }
        }

        private Border Row(Staff person)
        {
            var border = UiHelpers.Card();
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var left = new StackPanel();
            left.Children.Add(new TextBlock { Text = $"{person.Name} ({person.Role})", Foreground = WpfTokens.Text1Brush, FontWeight = FontWeights.Bold });
            left.Children.Add(new TextBlock
            {
                Text = $"{person.Email} · {(person.AllFloors ? "barcha qavatlar" : string.Join(", ", person.Floors) + "-qavat")}",
                Foreground = WpfTokens.Text3Brush, FontSize = 12,
            });
            Grid.SetColumn(left, 0);
            grid.Children.Add(left);

            var floorsEdit = new TextBox { Width = 80, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(12, 0, 8, 0), Text = string.Join(",", person.Floors), ToolTip = "Qavatlar (bo'sh = barchasi)" };
            var save = UiHelpers.GhostButton(this, "Saqlash", WpfTokens.AccentBrush);
            save.Click += async (s, e) =>
            {
                var floors = ParseFloors(floorsEdit.Text);
                try { await _api.SetStaffFloorsAsync(person.Id, floors).ConfigureAwait(true); await ReloadAsync(); }
                catch { MessageBox.Show(this, "Saqlanmadi"); }
            };
            var right = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            right.Children.Add(floorsEdit);
            right.Children.Add(save);
            var del = UiHelpers.GhostButton(this, "O'chirish", WpfTokens.RedBrush);
            del.Margin = new Thickness(4, 0, 0, 0);
            del.Click += async (s, e) =>
            {
                if (MessageBox.Show(this, $"{person.Name} o'chirilsinmi?", "Tasdiqlang", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
                try { await _api.DeleteStaffAsync(person.Id).ConfigureAwait(true); await ReloadAsync(); }
                catch { MessageBox.Show(this, "O'chirib bo'lmadi"); }
            };
            right.Children.Add(del);
            Grid.SetColumn(right, 2);
            grid.Children.Add(right);

            border.Child = grid;
            return border;
        }

        private static System.Collections.Generic.List<int> ParseFloors(string text) =>
            text.Split(',').Select(s => s.Trim()).Where(s => s.Length > 0 && int.TryParse(s, out _))
                .Select(int.Parse).ToList();

        private async System.Threading.Tasks.Task AddAsync()
        {
            _error.Visibility = Visibility.Collapsed;
            if (string.IsNullOrWhiteSpace(_name.Text) || string.IsNullOrWhiteSpace(_email.Text) || string.IsNullOrWhiteSpace(_password.Text))
            {
                _error.Text = "Ism, email va parol kiriting";
                _error.Visibility = Visibility.Visible;
                return;
            }
            try
            {
                await _api.CreateStaffAsync(_name.Text, _email.Text, _password.Text, (string)_role.SelectedItem,
                    ParseFloors(_floors.Text)).ConfigureAwait(true);
                _name.Text = ""; _email.Text = ""; _password.Text = ""; _floors.Text = "";
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
