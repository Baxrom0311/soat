using System.Net;
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

            // Windows 7's .NET Framework does not negotiate TLS 1.2 on its
            // own -- ServicePointManager defaults to whatever the OS's old
            // SChannel policy allows, which on Windows 7 can exclude 1.2
            // entirely. nurcecall.boos.uz (like any current server) refuses
            // anything older, so without this line every HTTPS call AND the
            // wss:// socket both fail silently/hang -- which reads exactly
            // like "can't load data from the server," on both the REST poll
            // and the WS accelerator at once, since both are TLS underneath.
            // Must run before the first HttpClient/ClientWebSocket is built.
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

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
