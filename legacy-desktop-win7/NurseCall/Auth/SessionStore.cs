using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using NurseCall.Core;

namespace NurseCall.Auth
{
    /// <summary>
    /// Persists the signed-in session across restarts. The Windows analogue
    /// of mobile-flutter/lib/auth/session_store.dart's use of
    /// flutter_secure_storage: the token is encrypted with the Windows Data
    /// Protection API (tied to the logged-in Windows account, same as
    /// Credential Manager uses under the hood) rather than written as plain
    /// text to a config file on a PC other staff can sit down at.
    /// </summary>
    public class SessionStore
    {
        private readonly ApiClient _api;
        private readonly string _path;

        public Session? Session { get; private set; }
        public bool IsSignedIn => Session != null;

        public SessionStore(ApiClient api)
        {
            _api = api;
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NurseCall");
            Directory.CreateDirectory(dir);
            _path = Path.Combine(dir, "session.bin");
        }

        /// <summary>Loads a saved session, if any, and primes the API client with its token.</summary>
        public void Restore()
        {
            try
            {
                if (!File.Exists(_path)) return;
                var encrypted = File.ReadAllBytes(_path);
                var plain = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
                var json = Encoding.UTF8.GetString(plain);
                var session = JsonConvert.DeserializeObject<Session>(json);
                if (session == null) return;
                Session = session;
                _api.SetToken(session.AccessToken);
            }
            catch
            {
                // A corrupted or unreadable save (a Windows profile restored
                // from a different machine, say) must not crash startup --
                // it just means signing in again, same as a wiped phone.
                Session = null;
            }
        }

        public void SignIn(Session session)
        {
            Session = session;
            _api.SetToken(session.AccessToken);
            try
            {
                var json = JsonConvert.SerializeObject(session);
                var plain = Encoding.UTF8.GetBytes(json);
                var encrypted = ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser);
                File.WriteAllBytes(_path, encrypted);
            }
            catch
            {
                // The session still works for this run even if it could not
                // be saved; the nurse just signs in again after a restart.
            }
        }

        public void SignOut()
        {
            Session = null;
            _api.SetToken(null);
            try
            {
                if (File.Exists(_path)) File.Delete(_path);
            }
            catch
            {
            }
        }
    }
}
