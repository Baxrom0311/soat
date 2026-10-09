using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using NurseCall.Core;
using NurseCall.Theme;

namespace NurseCall.Auth
{
    /// <summary>
    /// Sign-in, ported from mobile-flutter/lib/auth/login_screen.dart's
    /// shape (email + password, "wrong email or password" rather than
    /// echoing the server's own wording, which would leak whether the
    /// email exists).
    /// </summary>
    public partial class LoginWindow : Window
    {
        private readonly ApiClient _api;
        private readonly SessionStore _sessions;
        private TextBox _email = null!;
        private PasswordBox _password = null!;
        private TextBlock _error = null!;
        private Button _submit = null!;

        public LoginWindow(ApiClient api, SessionStore sessions)
        {
            InitializeComponent();
            _api = api;
            _sessions = sessions;
            Build();
        }

        private void Build()
        {
            var stack = new StackPanel
            {
                Margin = new Thickness(40, 0, 40, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };

            stack.Children.Add(new TextBlock
            {
                Text = "NurseCall",
                FontSize = 28,
                FontWeight = FontWeights.Bold,
                Foreground = WpfTokens.Text1Brush,
                Margin = new Thickness(0, 0, 0, 4),
            });
            stack.Children.Add(new TextBlock
            {
                Text = "Klinika tizimiga kirish",
                FontSize = 13,
                Foreground = WpfTokens.Text3Brush,
                Margin = new Thickness(0, 0, 0, 28),
            });

            stack.Children.Add(Label("Elektron pochta"));
            _email = MakeTextBox();
            stack.Children.Add(_email);

            stack.Children.Add(Label("Maxfiy parol"));
            _password = new PasswordBox
            {
                Padding = new Thickness(10, 8, 10, 8),
                Margin = new Thickness(0, 0, 0, 8),
                Background = WpfTokens.CardBrush,
                Foreground = WpfTokens.Text1Brush,
                BorderBrush = WpfTokens.BorderBrush,
            };
            _password.KeyDown += (s, e) => { if (e.Key == System.Windows.Input.Key.Enter) _ = SubmitAsync(); };
            stack.Children.Add(_password);

            _error = new TextBlock
            {
                Foreground = WpfTokens.RedBrush,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 4, 0, 8),
                Visibility = Visibility.Collapsed,
            };
            stack.Children.Add(_error);

            _submit = new Button
            {
                Content = "Kirish",
                Style = (Style)FindResource("PrimaryButton"),
                Margin = new Thickness(0, 12, 0, 0),
            };
            _submit.Click += (s, e) => _ = SubmitAsync();
            stack.Children.Add(_submit);

            Root.Children.Add(stack);
        }

        private static TextBlock Label(string text) => new TextBlock
        {
            Text = text,
            FontSize = 12,
            Foreground = WpfTokens.Text3Brush,
            Margin = new Thickness(0, 0, 0, 4),
        };

        private static TextBox MakeTextBox() => new TextBox
        {
            Padding = new Thickness(10, 8, 10, 8),
            Margin = new Thickness(0, 0, 0, 16),
            Background = WpfTokens.CardBrush,
            Foreground = WpfTokens.Text1Brush,
            BorderBrush = WpfTokens.BorderBrush,
        };

        private async System.Threading.Tasks.Task SubmitAsync()
        {
            _error.Visibility = Visibility.Collapsed;
            _submit.IsEnabled = false;
            _submit.Content = "Kirilmoqda...";
            try
            {
                var session = await _api.LoginAsync(_email.Text, _password.Password).ConfigureAwait(true);
                _sessions.SignIn(session);
                DialogResult = true;
                Close();
            }
            catch (ApiException)
            {
                _error.Text = "Email yoki parol noto'g'ri";
                _error.Visibility = Visibility.Visible;
            }
            catch (Exception)
            {
                _error.Text = "Serverga ulanib bo'lmadi — internetni tekshiring";
                _error.Visibility = Visibility.Visible;
            }
            finally
            {
                _submit.IsEnabled = true;
                _submit.Content = "Kirish";
            }
        }
    }
}
