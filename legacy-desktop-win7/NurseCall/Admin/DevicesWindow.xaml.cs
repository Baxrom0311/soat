using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using NurseCall.Core;
using NurseCall.Theme;

namespace NurseCall.Admin
{
    /// <summary>
    /// Which receivers are hearing buttons, and which have gone quiet --
    /// read-only, ported from mobile-flutter/lib/admin/devices_screen.dart.
    /// Registration itself happens through the zero-touch announce/claim
    /// flow on the server, never a manual "add device" form here -- that
    /// matches the phone screen, which has none either.
    /// </summary>
    public partial class DevicesWindow : Window
    {
        private readonly ApiClient _api;

        public DevicesWindow(ApiClient api)
        {
            InitializeComponent();
            _api = api;
            Loaded += async (s, e) => await LoadAsync();
        }

        private async System.Threading.Tasks.Task LoadAsync()
        {
            Root.Children.Clear();
            var status = new TextBlock { Text = "Yuklanmoqda...", Foreground = WpfTokens.Text3Brush };
            Root.Children.Add(status);
            try
            {
                var devices = (await _api.DevicesAsync().ConfigureAwait(true))
                    .OrderBy(d => d.Online) // offline first -- the row that needs attention, not buried mid-list
                    .ThenBy(d => d.Floor)
                    .ToList();
                Root.Children.Clear();
                Build(devices);
            }
            catch
            {
                status.Text = "Yuklab bo'lmadi — qayta urinib ko'ring";
            }
        }

        private void Build(System.Collections.Generic.List<Device> devices)
        {
            var panel = new StackPanel();

            if (devices.Count == 0)
            {
                panel.Children.Add(new TextBlock
                {
                    Text = "Qabul qilgich ro'yxatdan o'tkazilmagan.\nYangi qurilma ulanganda o'zi paydo bo'ladi.",
                    Foreground = WpfTokens.Text3Brush,
                    TextWrapping = TextWrapping.Wrap,
                });
                Root.Children.Add(panel);
                return;
            }

            var offline = devices.Count(d => !d.Online);
            var banner = new Border
            {
                Background = offline == 0 ? WpfTokens.Brush(Tokens.Sky950) : WpfTokens.Brush(Tokens.Red950),
                BorderBrush = offline == 0 ? WpfTokens.AccentBrush : WpfTokens.RedBrush,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(12),
                Margin = new Thickness(0, 0, 0, 12),
            };
            var allDown = offline == devices.Count;
            banner.Child = new TextBlock
            {
                Text = offline == 0
                    ? $"{devices.Count} ta qabul qilgich ishlayapti"
                    : allDown
                        ? "Hech bir qabul qilgich ishlamayapti — klinika qoplanmagan"
                        : $"{offline} ta qabul qilgich jim — o'sha qavatda tugma bosilsa hech narsa bo'lmaydi",
                Foreground = WpfTokens.Text1Brush,
                TextWrapping = TextWrapping.Wrap,
            };
            panel.Children.Add(banner);

            foreach (var d in devices) panel.Children.Add(Row(d));

            Root.Children.Add(new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        }

        private Border Row(Device d)
        {
            var tint = d.Online ? WpfTokens.AccentBrush : d.NeverSeen ? WpfTokens.Brush(Tokens.Amber400) : WpfTokens.RedBrush;
            var border = new Border
            {
                Background = WpfTokens.CardBrush,
                BorderBrush = WpfTokens.BorderBrush,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(14, 10, 14, 10),
                Margin = new Thickness(0, 0, 0, 8),
                Effect = UiHelpers.Elevation(),
            };
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var left = new StackPanel();
            left.Children.Add(new TextBlock { Text = d.DeviceId, Foreground = WpfTokens.Text1Brush, FontWeight = System.Windows.FontWeights.Bold });
            left.Children.Add(new TextBlock { Text = $"{d.Floor}-qavat · {Ago(d.LastSeenAt)}", Foreground = WpfTokens.Text3Brush, FontSize = 12 });
            Grid.SetColumn(left, 0);
            grid.Children.Add(left);

            var state = new TextBlock
            {
                Text = d.Online ? "ishlayapti" : d.NeverSeen ? "sozlanmagan" : "jim",
                Foreground = tint,
                FontWeight = System.Windows.FontWeights.Bold,
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(state, 1);
            grid.Children.Add(state);

            border.Child = grid;
            return border;
        }

        /// <summary>Exact units matter: "2 daqiqa" is mid-heartbeat, "3 kun" is a box somebody has to walk to.</summary>
        private static string Ago(DateTime? t)
        {
            if (t == null) return "hech qachon ulanmagan";
            var d = DateTime.UtcNow - t.Value.ToUniversalTime();
            if (d.TotalMinutes < 1) return "hozirgina";
            if (d.TotalMinutes < 60) return $"{(int)d.TotalMinutes} daqiqa oldin";
            if (d.TotalHours < 24) return $"{(int)d.TotalHours} soat oldin";
            return $"{(int)d.TotalDays} kun oldin";
        }
    }
}
