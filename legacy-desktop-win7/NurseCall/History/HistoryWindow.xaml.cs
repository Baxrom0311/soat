using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using NurseCall.Core;
using NurseCall.Theme;

namespace NurseCall.History
{
    /// <summary>
    /// Past calls -- answered, expired, or still waiting -- ported from
    /// mobile-flutter/lib/calls/history_screen.dart's three-way distinction
    /// (test/history_test.dart is explicit that collapsing "expired" into
    /// either of the other two would put a false reassurance on the one
    /// screen a clinic uses to check whether its patients were reached).
    /// </summary>
    public partial class HistoryWindow : Window
    {
        private readonly ApiClient _api;

        public HistoryWindow(ApiClient api)
        {
            InitializeComponent();
            _api = api;
            Loaded += async (s, e) => await LoadAsync();
        }

        private async System.Threading.Tasks.Task LoadAsync()
        {
            var status = new TextBlock { Text = "Yuklanmoqda...", Foreground = WpfTokens.Text3Brush };
            Root.Children.Add(status);
            try
            {
                var history = await _api.HistoryAsync().ConfigureAwait(true);
                Root.Children.Remove(status);
                Build(history.OrderByDescending(h => h.CreatedAt).ToList());
            }
            catch
            {
                status.Text = "Yuklab bo'lmadi — qayta urinib ko'ring";
            }
        }

        private void Build(System.Collections.Generic.List<HistoryCall> rows)
        {
            var list = new ListView { BorderThickness = new Thickness(0), Background = WpfTokens.PageBrush };
            var view = new GridView();
            view.Columns.Add(new GridViewColumn { Header = "Xona", DisplayMemberBinding = new System.Windows.Data.Binding("RoomNumber"), Width = 90 });
            view.Columns.Add(new GridViewColumn { Header = "Qavat", DisplayMemberBinding = new System.Windows.Data.Binding("Floor"), Width = 60 });
            view.Columns.Add(new GridViewColumn { Header = "Holat", DisplayMemberBinding = new System.Windows.Data.Binding("StatusLabel"), Width = 140 });
            view.Columns.Add(new GridViewColumn { Header = "Kim javob berdi", DisplayMemberBinding = new System.Windows.Data.Binding("AcknowledgedBy"), Width = 160 });
            view.Columns.Add(new GridViewColumn { Header = "Qancha kutildi", DisplayMemberBinding = new System.Windows.Data.Binding("AnsweredInLabel"), Width = 120 });
            list.View = view;
            list.ItemsSource = rows.Select(r => new HistoryRow(r)).ToList();
            Root.Children.Add(list);
        }

        /// <summary>Flattens HistoryCall into display strings a plain GridView binding can read.</summary>
        private class HistoryRow
        {
            public HistoryRow(HistoryCall c)
            {
                RoomNumber = c.RoomNumber;
                Floor = c.Floor;
                AcknowledgedBy = c.AcknowledgedBy ?? "";
                StatusLabel = c.Expired ? "Javobsiz qolgan (muddati tugadi)"
                    : c.Answered ? "Javob berildi"
                    : "Hali kutilmoqda";
                AnsweredInLabel = c.AnsweredIn == null ? "—" : AnswerLabelFormatter.Format(c.AnsweredIn);
            }

            public string RoomNumber { get; }
            public int Floor { get; }
            public string AcknowledgedBy { get; }
            public string StatusLabel { get; }
            public string AnsweredInLabel { get; }
        }
    }
}
