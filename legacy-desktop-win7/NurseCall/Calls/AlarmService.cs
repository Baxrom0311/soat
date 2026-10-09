using System;
using System.Collections.Generic;
using System.IO;
using System.Media;
using NurseCall.Core;

namespace NurseCall.Calls
{
    /// <summary>
    /// Drives the chime and the window's always-on-top/focus behaviour.
    /// The ringing SET itself is decided by <see cref="AlarmLogic"/> (pure,
    /// tested); this class is the thin, untestable platform shell around it
    /// -- the WPF analogue of mobile-flutter/lib/desktop/desktop_alarm.dart.
    /// </summary>
    public class AlarmService
    {
        private readonly SoundPlayer _player;
        private HashSet<int> _ids = new HashSet<int>();

        public bool IsPlaying => _ids.Count > 0;

        /// <summary>
        /// Raised when ringing starts or stops, so the window can set
        /// Topmost and (via MainWindow's Deactivated handler) re-focus
        /// itself while a call is still waiting.
        /// </summary>
        public event Action<bool>? PlayingChanged;

        public AlarmService()
        {
            var path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Assets", "nursecall_chime.wav");
            _player = new SoundPlayer(path);
            try
            {
                _player.LoadAsync();
            }
            catch
            {
                // A PC with no sound device at all must not crash startup --
                // the window still rings visually (always-on-top + focus).
            }
        }

        /// <summary>
        /// Rings for exactly <paramref name="ids"/>; an empty set stops it.
        /// Cheap to call on every feed update -- the sound is only told
        /// when the set actually changes, same as the Flutter
        /// AlarmService.sync.
        /// </summary>
        public void Sync(HashSet<int> ids)
        {
            if (ids.Count == 0)
            {
                Stop();
                return;
            }
            if (SetsEqual(ids, _ids)) return;
            var wasPlaying = IsPlaying;
            _ids = ids;
            if (!wasPlaying)
            {
                try
                {
                    _player.PlayLooping();
                }
                catch
                {
                }
                PlayingChanged?.Invoke(true);
            }
        }

        public void Stop()
        {
            if (_ids.Count == 0) return;
            _ids = new HashSet<int>();
            try
            {
                _player.Stop();
            }
            catch
            {
            }
            PlayingChanged?.Invoke(false);
        }

        /// <summary>Plays the chime once, for a settings "test the sound" row.</summary>
        public void Test()
        {
            try
            {
                _player.Play();
            }
            catch
            {
            }
        }

        private static bool SetsEqual(HashSet<int> a, HashSet<int> b) => a.SetEquals(b);
    }
}
