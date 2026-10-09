using System.Windows;
using NurseCall.Auth;
using NurseCall.Calls;
using NurseCall.Core;

namespace NurseCall
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            var api = new ApiClient();
            var sessions = new SessionStore(api);
            sessions.Restore();

            if (!sessions.IsSignedIn)
            {
                var login = new LoginWindow(api, sessions);
                var ok = login.ShowDialog();
                if (ok != true)
                {
                    Shutdown();
                    return;
                }
            }

            var alarmService = new AlarmService();
            CallsFeed? feed = null;
            feed = new CallsFeed(api, onUnauthorized: () =>
            {
                // The session was rejected server-side (deleted, password
                // changed elsewhere). Back to the login window rather than
                // a board that has quietly stopped updating -- a stale
                // board is worse than an empty one, it looks like a quiet
                // ward.
                Current.Dispatcher.Invoke(() =>
                {
                    sessions.SignOut();
                    var login = new LoginWindow(api, sessions);
                    if (login.ShowDialog() == true)
                    {
                        // feed is always assigned by the time this runs -- it can only fire
                        // from within CallsFeed's own onUnauthorized callback.
                        var main = new MainWindow(api, sessions, feed!, alarmService);
                        MainWindow = main;
                        main.Show();
                    }
                    else
                    {
                        Shutdown();
                    }
                });
            });

            var mainWindow = new MainWindow(api, sessions, feed, alarmService);
            MainWindow = mainWindow;
            mainWindow.Show();
        }
    }
}
