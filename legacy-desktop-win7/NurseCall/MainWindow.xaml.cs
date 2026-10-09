using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using NurseCall.Admin;
using NurseCall.Auth;
using NurseCall.Calls;
using NurseCall.Core;
using NurseCall.History;
using NurseCall.Theme;

namespace NurseCall
{
    /// <summary>
    /// The nav-rail shell -- the WPF analogue of
    /// mobile-flutter/lib/calls/calls_screen.dart's desktop branch (commit
    /// 68ce9a4 in the Flutter history this was built alongside): a side
    /// rail instead of a phone's bottom tab bar, and the calls list free to
    /// wrap into several columns instead of one narrow one.
    /// </summary>
    public partial class MainWindow : Window
    {
        private readonly ApiClient _api;
        private readonly SessionStore _sessions;
        private readonly CallsFeed _feed;
        private readonly AlarmService _alarm;
        private readonly HashSet<int> _silenced = new HashSet<int>();
        private readonly Dictionary<int, CallCardControl> _cards = new Dictionary<int, CallCardControl>();
        private int? _busyCallId;
        private int? _floorFilter;
        private int _tab;

        private Grid _shell = null!;
        private Border _navCalls = null!;
        private Border _navProfile = null!;
        private ContentControl _content = null!;
        private WrapPanel _cardsPanel = null!;
        private TextBlock _clinicLabel = null!;
        private TextBlock _bannerText = null!;
        private Border _banner = null!;
        private StackPanel _floorFilterPanel = null!;
        private TextBlock _statsText = null!;

        public MainWindow(ApiClient api, SessionStore sessions, CallsFeed feed, AlarmService alarm)
        {
            InitializeComponent();
            _api = api;
            _sessions = sessions;
            _feed = feed;
            _alarm = alarm;

            Build();

            _feed.Changed += () => Dispatcher.Invoke(RefreshCallsView);
            _alarm.PlayingChanged += playing => Dispatcher.Invoke(() => ApplyAlarmWindowState(playing));

            Closing += OnClosing;
            Deactivated += (s, e) => { if (_alarm.IsPlaying) Activate(); };

            ShowTab(0);
            _feed.Start(_sessions.Session?.AccessToken);
        }

        // --------------------------------------------------------------- shell

        private void Build()
        {
            _shell = new Grid();
            _shell.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(184) });
            _shell.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1), });
            _shell.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var nav = new StackPanel { Background = WpfTokens.CardBrush };
            Grid.SetColumn(nav, 0);

            var brand = new TextBlock
            {
                Text = "NurseCall",
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = WpfTokens.Text1Brush,
                Margin = new Thickness(20, 20, 20, 24),
            };
            nav.Children.Add(brand);

            _navCalls = NavItem("Chaqiruvlar", () => ShowTab(0));
            _navProfile = NavItem("Profil", () => ShowTab(1));
            nav.Children.Add(_navCalls);
            nav.Children.Add(_navProfile);
            _shell.Children.Add(nav);

            var divider = new Border { Background = WpfTokens.BorderBrush, Width = 1 };
            Grid.SetColumn(divider, 1);
            _shell.Children.Add(divider);

            _content = new ContentControl();
            Grid.SetColumn(_content, 2);
            _shell.Children.Add(_content);

            Root.Children.Add(_shell);
        }

        /// <summary>
        /// A side-rail row: a 3px accent strip (shown only when selected) +
        /// the label button. The strip is a separate element from the
        /// button's own background so "which tab is active" reads instantly
        /// at a glance, the way a real desktop app's rail does -- a plain
        /// NavButton with no selection feedback at all was one of the
        /// "doesn't feel finished" gaps in the first pass.
        /// </summary>
        private Border NavItem(string label, Action onClick)
        {
            var button = new Button { Content = label, Style = (Style)FindResource("NavButton") };
            button.Click += (s, e) => onClick();

            var row = new Grid();
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(3) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            var strip = new Border { Background = WpfTokens.AccentBrush, Visibility = Visibility.Collapsed, Tag = "strip" };
            Grid.SetColumn(strip, 0);
            row.Children.Add(strip);
            Grid.SetColumn(button, 1);
            row.Children.Add(button);

            return new Border { Child = row, Tag = button };
        }

        private void SetSelected(Border navItem, bool selected)
        {
            var row = (Grid)navItem.Child;
            var strip = (Border)row.Children[0];
            var button = (Button)navItem.Tag;
            strip.Visibility = selected ? Visibility.Visible : Visibility.Collapsed;
            navItem.Background = selected ? WpfTokens.Brush(Tokens.Sky950) : Brushes.Transparent;
            button.Foreground = selected ? WpfTokens.AccentBrush : WpfTokens.Text3Brush;
            button.FontWeight = selected ? FontWeights.Bold : FontWeights.Normal;
        }

        private void ShowTab(int tab)
        {
            _tab = tab;
            SetSelected(_navCalls, tab == 0);
            SetSelected(_navProfile, tab == 1);
            _content.Content = tab == 0 ? BuildCallsTab() : BuildProfileTab();
        }

        // --------------------------------------------------------------- calls

        private UIElement BuildCallsTab()
        {
            var column = new DockPanel();

            var header = new StackPanel
            {
                Background = WpfTokens.CardBrush,
                Margin = new Thickness(0),
            };
            var headerInner = new StackPanel { Margin = new Thickness(20, 16, 20, 14) };

            var titleRow = new StackPanel { Orientation = Orientation.Horizontal };
            titleRow.Children.Add(new TextBlock
            {
                Text = "NurseCall",
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = WpfTokens.Text1Brush,
            });
            headerInner.Children.Add(titleRow);

            _clinicLabel = new TextBlock
            {
                Foreground = WpfTokens.Text3Brush,
                FontSize = 12,
                Margin = new Thickness(0, 2, 0, 10),
            };
            headerInner.Children.Add(_clinicLabel);

            _banner = new Border
            {
                Background = WpfTokens.Brush(Tokens.Amber950),
                BorderBrush = WpfTokens.Brush(Tokens.Amber500),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(12, 8, 12, 8),
                Margin = new Thickness(0, 0, 0, 10),
                Visibility = Visibility.Collapsed,
            };
            _bannerText = new TextBlock { Foreground = WpfTokens.Text1Brush, TextWrapping = TextWrapping.Wrap };
            _banner.Child = _bannerText;
            headerInner.Children.Add(_banner);

            _floorFilterPanel = new StackPanel { Orientation = Orientation.Horizontal };
            headerInner.Children.Add(_floorFilterPanel);

            header.Children.Add(headerInner);
            DockPanel.SetDock(header, Dock.Top);
            column.Children.Add(header);

            _statsText = new TextBlock
            {
                Foreground = WpfTokens.Text3Brush,
                FontSize = 12,
                Margin = new Thickness(20, 0, 20, 12),
            };
            DockPanel.SetDock(_statsText, Dock.Bottom);
            column.Children.Add(_statsText);

            var scroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
            _cardsPanel = new WrapPanel { Margin = new Thickness(20, 8, 20, 8) };
            scroll.Content = _cardsPanel;
            // Window resize changes how many columns fit; SizeChanged is
            // what makes that actually responsive instead of the first
            // version's flat 400px per card, which just clipped at the
            // window's own 640px minimum width.
            scroll.SizeChanged += (s, e) => ResizeCards();
            column.Children.Add(scroll);

            RefreshCallsView();
            return column;
        }

        /// <summary>
        /// One column at the window's minimum width, more as it widens --
        /// each card targets ~380px but never drops below 300 (where the
        /// room number and timer start crowding) or grows past 480 (where a
        /// lone card on an ultra-wide monitor would look stretched rather
        /// than merely large).
        /// </summary>
        private void ResizeCards()
        {
            if (_cardsPanel == null || _cards.Count == 0) return;
            var available = _cardsPanel.ActualWidth;
            if (available <= 0) return;
            const double target = 380, spacing = 16, min = 300, max = 480;
            var columns = Math.Max(1, (int)((available + spacing) / (target + spacing)));
            var width = Math.Min(max, Math.Max(min, (available - (columns - 1) * spacing) / columns));
            foreach (var card in _cards.Values) card.Width = width;
        }

        /// <summary>Calls only still-visible cards -- a floor filter hides the rest without discarding the feed's own list.</summary>
        private IEnumerable<Call> Visible() =>
            _floorFilter == null ? _feed.Calls : _feed.Calls.Where(c => c.Floor == _floorFilter);

        private void RefreshCallsView()
        {
            if (_clinicLabel != null)
            {
                _clinicLabel.Text = string.IsNullOrEmpty(_feed.ClinicName) ? "Navbatchilik rejimi" : _feed.ClinicName;
            }

            if (_banner != null)
            {
                if (!_feed.Reachable)
                {
                    _banner.Visibility = Visibility.Visible;
                    _bannerText.Text = "Serverga ulanib bo'lmadi — ro'yxat eskirgan bo'lishi mumkin";
                }
                else if (_feed.Notice is BillingNotice n && (n.Warn || n.Blocked))
                {
                    _banner.Visibility = Visibility.Visible;
                    _bannerText.Text = n.Blocked
                        ? "Obuna to'lanmagan. Chaqiruvlar ishlashda davom etadi."
                        : n.DaysLeft != null
                            ? $"Obuna: {n.DaysLeft} kun qoldi"
                            : "Obuna muddati tugayapti";
                }
                else
                {
                    _banner.Visibility = Visibility.Collapsed;
                }
            }

            RebuildFloorFilter();

            if (_cardsPanel != null)
            {
                var visible = Visible().ToList();
                var visibleIds = new HashSet<int>(visible.Select(c => c.CallId));
                foreach (var staleId in _cards.Keys.Where(id => !visibleIds.Contains(id)).ToList())
                {
                    _cardsPanel.Children.Remove(_cards[staleId]);
                    _cards.Remove(staleId);
                }
                foreach (var call in visible)
                {
                    if (!_cards.TryGetValue(call.CallId, out var card))
                    {
                        card = new CallCardControl(call, _feed.Now);
                        card.Acknowledge += () => _ = AcknowledgeAsync(call.CallId);
                        _cards[call.CallId] = card;
                        _cardsPanel.Children.Add(card);
                    }
                    card.Tick(_feed.Now);
                    card.SetBusy(_busyCallId == call.CallId);
                }
                // Deferred: ActualWidth right after adding children to the
                // panel still reflects the layout pass before this one.
                Dispatcher.BeginInvoke(new Action(ResizeCards), DispatcherPriority.Loaded);
            }

            if (_statsText != null)
            {
                var typical = NurseCall.Core.AnswerLabelFormatter.Format(_feed.Stats.TypicalAnswer);
                _statsText.Text = $"Bugun javob berilgan: {_feed.Stats.AnsweredToday}    O'rtacha javob vaqti: {typical}";
            }

            SyncAlarm();
        }

        private void RebuildFloorFilter()
        {
            _floorFilterPanel.Children.Clear();
            var floors = _feed.Calls.Select(c => c.Floor).Distinct().OrderBy(f => f).ToList();
            if (floors.Count <= 1) return;

            _floorFilterPanel.Children.Add(FloorChip("Barchasi", null));
            foreach (var f in floors) _floorFilterPanel.Children.Add(FloorChip($"{f}-qavat", f));
        }

        private Button FloorChip(string label, int? floor)
        {
            var b = new Button
            {
                Content = label,
                Margin = new Thickness(0, 0, 8, 0),
                Style = (Style)FindResource("Chip"),
                Background = _floorFilter == floor ? WpfTokens.AccentBrush : WpfTokens.CardBrush,
                Foreground = _floorFilter == floor ? Brushes.White : WpfTokens.Text3Brush,
                BorderBrush = _floorFilter == floor ? WpfTokens.AccentBrush : WpfTokens.BorderBrush,
            };
            b.Click += (s, e) => { _floorFilter = floor; RefreshCallsView(); };
            return b;
        }

        private void SyncAlarm()
        {
            var ringing = AlarmLogic.RingingIds(_feed.Calls, _silenced, DateTime.UtcNow);
            _alarm.Sync(ringing);
        }

        private async System.Threading.Tasks.Task AcknowledgeAsync(int callId)
        {
            _busyCallId = callId;
            RefreshCallsView();
            try
            {
                await _feed.AcknowledgeAsync(callId).ConfigureAwait(true);
            }
            catch
            {
                MessageBox.Show(this, "Qabul qilinmadi — qayta urinib ko'ring", "NurseCall",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
            }
            finally
            {
                _busyCallId = null;
                RefreshCallsView();
            }
        }

        // ------------------------------------------------------------- profile

        private UIElement BuildProfileTab()
        {
            var panel = new StackPanel { Margin = new Thickness(32) };
            var session = _sessions.Session;

            panel.Children.Add(new TextBlock
            {
                Text = session?.Name ?? "",
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = WpfTokens.Text1Brush,
            });
            panel.Children.Add(new TextBlock
            {
                Text = _feed.ClinicName ?? "",
                Foreground = WpfTokens.Text3Brush,
                Margin = new Thickness(0, 2, 0, 24),
            });

            panel.Children.Add(SectionTitle("Signal"));
            panel.Children.Add(ProfileRow("Bu kompyuter chaqiruvda signal beradi",
                "Oyna kichraytirilgan bo'lsa ham — faqat dasturni yopmang", null));
            panel.Children.Add(ProfileRow("Signal ovozini sinash",
                "Eshitilmasa, kompyuter ovozi va karnayni tekshiring", () => _alarm.Test()));

            panel.Children.Add(SectionTitle("Smena"));
            panel.Children.Add(ProfileRow("Chaqiruvlar tarixi", "Kim javob bergan, qancha kutilgan",
                () => new HistoryWindow(_api) { Owner = this }.ShowDialog()));

            if (session?.IsAdmin == true)
            {
                panel.Children.Add(SectionTitle("Klinika"));
                panel.Children.Add(ProfileRow("Qabul qilgichlar", "Qurilmalar ro'yxati va holati",
                    () => new DevicesWindow(_api) { Owner = this }.ShowDialog()));
                panel.Children.Add(ProfileRow("Xonalar", "Xonalarni qo'shish va o'chirish",
                    () => new RoomsWindow(_api) { Owner = this }.ShowDialog()));
                panel.Children.Add(ProfileRow("Tugmalar", "SOS tugmalarni xonaga biriktirish",
                    () => new ButtonsWindow(_api) { Owner = this }.ShowDialog()));
                panel.Children.Add(ProfileRow("Hamshiralar", "Xodimlar va ularning qavatlari",
                    () => new StaffWindow(_api) { Owner = this }.ShowDialog()));
            }

            var signOut = new Button
            {
                Content = "Chiqish",
                Margin = new Thickness(0, 24, 0, 0),
                Style = (Style)FindResource("OutlineButton"),
                Foreground = WpfTokens.RedBrush,
                HorizontalAlignment = HorizontalAlignment.Left,
            };
            signOut.Click += (s, e) =>
            {
                _alarm.Stop();
                _feed.Reset();
                _sessions.SignOut();
                Close();
            };
            panel.Children.Add(signOut);

            return new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        }

        private static TextBlock SectionTitle(string text) => new TextBlock
        {
            Text = text,
            FontSize = 13,
            FontWeight = FontWeights.Bold,
            Foreground = WpfTokens.Text3Brush,
            Margin = new Thickness(0, 16, 0, 8),
        };

        private Border ProfileRow(string label, string sub, Action? onClick)
        {
            var border = UiHelpers.Card();
            border.Cursor = onClick == null ? System.Windows.Input.Cursors.Arrow : System.Windows.Input.Cursors.Hand;
            if (onClick != null) border.Style = (Style)FindResource("RowHover");

            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var stack = new StackPanel();
            stack.Children.Add(new TextBlock { Text = label, Foreground = WpfTokens.Text1Brush, FontWeight = FontWeights.SemiBold });
            stack.Children.Add(new TextBlock { Text = sub, Foreground = WpfTokens.Text3Brush, FontSize = 12, Margin = new Thickness(0, 2, 0, 0) });
            grid.Children.Add(stack);

            if (onClick != null)
            {
                var chevron = new TextBlock { Text = "›", Foreground = WpfTokens.Text3Brush, FontSize = 18, VerticalAlignment = VerticalAlignment.Center };
                Grid.SetColumn(chevron, 1);
                grid.Children.Add(chevron);
            }

            border.Child = grid;
            if (onClick != null) border.MouseLeftButtonUp += (s, e) => onClick();
            return border;
        }

        // ------------------------------------------------------------- window

        /// <summary>
        /// This process *is* the ward's alarm, so closing asks first and
        /// offers to minimise instead -- ported from
        /// mobile-flutter/lib/desktop/desktop_window.dart's onWindowClose.
        /// </summary>
        private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
        {
            if (!_sessions.IsSignedIn) return; // sign-out already asked for this close
            var result = MessageBox.Show(this,
                "Yopilsa, bu kompyuter chaqiruvlarda signal bermaydi. Oyna kichraytirilsa, signal ishlashda davom etadi.",
                "Dasturni yopasizmi?", MessageBoxButton.YesNoCancel, MessageBoxImage.Warning);
            if (result == MessageBoxResult.Yes) return; // let it close
            e.Cancel = true;
            if (result == MessageBoxResult.No) WindowState = WindowState.Minimized;
        }

        /// <summary>
        /// setAlwaysOnTop keeps the window visually frontmost once a call
        /// starts ringing, but a click on any other app still silently
        /// takes real input focus away -- the window stays on top, not
        /// focused, so the next click on Acknowledge would otherwise only
        /// reactivate the window. Re-asserting focus on every Deactivated
        /// while the alarm plays (see the constructor) is the fix shipped
        /// for the Flutter build in commit a7c2aca; this is its WPF twin.
        /// </summary>
        private void ApplyAlarmWindowState(bool playing)
        {
            Topmost = playing;
            if (playing)
            {
                if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
                Show();
                Activate();
            }
        }
    }
}
