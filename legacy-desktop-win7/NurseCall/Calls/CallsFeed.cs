using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using NurseCall.Core;

namespace NurseCall.Calls
{
    /// <summary>
    /// The ward's unanswered calls, kept fresh while the app is running.
    /// Ported from mobile-flutter/lib/calls/calls_feed.dart. Three timers
    /// and a socket, deliberately separate -- see that file's own comment
    /// for why folding the socket and the poll together is the classic
    /// mistake (a dead socket that never errors looks exactly like a quiet
    /// ward). The socket never carries the call list itself, only the news
    /// that something changed; the list is always re-read over HTTP, so a
    /// dropped or duplicated event cannot leave the screen disagreeing with
    /// the server.
    ///
    /// Demo mode (the phone app's onboarding walkthrough) is intentionally
    /// not ported -- a ward PC's legacy client has no onboarding flow to
    /// demonstrate.
    /// </summary>
    public class CallsFeed : IDisposable
    {
        private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(30);
        private static readonly TimeSpan FallbackPollInterval = TimeSpan.FromSeconds(5);

        private readonly ApiClient _api;
        private readonly Action _onUnauthorized;
        private readonly Action<int>? _onAcknowledged;
        private readonly Action<HashSet<int>>? _onSnapshot;

        private long _generation;
        private long _refreshSequence;
        private bool _stopped = true;
        private readonly HashSet<int> _pendingAcks = new HashSet<int>();

        private Timer? _poll;
        private Timer? _tick;
        private Timer? _stats2;
        private LiveSocket? _socket;

        public bool Live { get; private set; }
        public List<Call> Calls { get; private set; } = new List<Call>();
        public DateTime Now { get; private set; } = DateTime.UtcNow;
        public bool Loading { get; private set; } = true;

        /// <summary>
        /// False once a refresh has failed. Surfaced in the UI because an
        /// unreachable PC and a quiet ward produce the same empty list --
        /// only this flag tells them apart.
        /// </summary>
        public bool Reachable { get; private set; } = true;

        public BillingNotice? Notice { get; private set; }
        public ShiftStats Stats { get; private set; } = ShiftStats.Empty;
        public string? ClinicName { get; private set; }

        /// <summary>Raised on every state change. Always on a threadpool thread -- the caller must dispatch to the UI thread itself.</summary>
        public event Action? Changed;

        public CallsFeed(ApiClient api, Action onUnauthorized, Action<int>? onAcknowledged = null,
            Action<HashSet<int>>? onSnapshot = null)
        {
            _api = api;
            _onUnauthorized = onUnauthorized;
            _onAcknowledged = onAcknowledged;
            _onSnapshot = onSnapshot;
        }

        public void Start(string? token)
        {
            Stop();
            _stopped = false;
            _tick = new Timer(_ =>
            {
                Now = DateTime.UtcNow;
                Changed?.Invoke();
            }, null, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1));

            StartPolling(FallbackPollInterval);
            if (token != null) ConnectSocket(token);
            _ = RefreshAsync();
            _ = RefreshNoticeAsync();
            _ = RefreshStatsAsync();
            if (ClinicName == null) _ = RefreshClinicAsync();

            _stats2 = new Timer(_ => { _ = RefreshStatsAsync(); }, null,
                TimeSpan.FromMinutes(2), TimeSpan.FromMinutes(2));
        }

        private void StartPolling(TimeSpan every)
        {
            _poll?.Dispose();
            _poll = new Timer(_ => { _ = RefreshAsync(); }, null, every, every);
        }

        private void ConnectSocket(string token)
        {
            var generation = _generation;
            var wsUri = ApiClient.BaseUrl.Replace("https://", "wss://").Replace("http://", "ws://") + "/ws/calls";

            void OnEvent(LiveEvent e)
            {
                if (!_stopped && generation == _generation) _ = RefreshAsync();
            }

            void OnState(bool connected)
            {
                if (_stopped || generation != _generation) return;
                Live = connected;
                StartPolling(connected ? PollInterval : FallbackPollInterval);
                if (connected) _ = RefreshAsync();
                Changed?.Invoke();
            }

            _socket = new LiveSocket(wsUri, OnEvent, OnState);
            _socket.Connect(token);
        }

        public void Stop()
        {
            _stopped = true;
            Interlocked.Increment(ref _generation);
            Interlocked.Increment(ref _refreshSequence);
            _socket?.Dispose();
            _poll?.Dispose();
            _tick?.Dispose();
            _stats2?.Dispose();
            _poll = null;
            _tick = null;
            _stats2 = null;
            _socket = null;
            Live = false;
        }

        /// <summary>Never carries a previous nurse's cached clinic or calls into another session.</summary>
        public void Reset()
        {
            Stop();
            Calls = new List<Call>();
            _pendingAcks.Clear();
            ClinicName = null;
            Notice = null;
            Stats = ShiftStats.Empty;
            Loading = true;
            Reachable = true;
            Changed?.Invoke();
        }

        public async Task RefreshAsync()
        {
            if (_stopped) return;
            var generation = _generation;
            var sequence = Interlocked.Increment(ref _refreshSequence);
            bool Current() => !_stopped && generation == _generation && sequence == _refreshSequence;
            try
            {
                var list = await _api.ActiveCallsAsync().ConfigureAwait(false);
                if (!Current()) return;
                // Oldest first, always -- a nurse should not have to scan
                // for whoever has waited longest, which an arrival-ordered
                // list buries exactly when the ward gets busy.
                list.Sort((a, b) => a.CreatedAt.CompareTo(b.CreatedAt));
                var activeIds = new HashSet<int>(list.Select(c => c.CallId));
                foreach (var old in Calls)
                {
                    if (!activeIds.Contains(old.CallId)) _onAcknowledged?.Invoke(old.CallId);
                }
                _onSnapshot?.Invoke(activeIds);
                Calls = list.Where(c => !_pendingAcks.Contains(c.CallId)).ToList();
                Reachable = true;
                Loading = false;
                Changed?.Invoke();
            }
            catch (ApiException e) when (e.IsUnauthorized)
            {
                if (!Current()) return;
                Stop();
                _onUnauthorized();
            }
            catch
            {
                if (!Current()) return;
                Reachable = false;
                Loading = false;
                Changed?.Invoke();
            }
        }

        private async Task RefreshClinicAsync()
        {
            var generation = _generation;
            try
            {
                var clinic = await _api.ClinicAsync().ConfigureAwait(false);
                if (_stopped || generation != _generation) return;
                ClinicName = clinic.Name;
                Changed?.Invoke();
            }
            catch
            {
            }
        }

        private async Task RefreshStatsAsync()
        {
            var generation = _generation;
            try
            {
                var history = await _api.HistoryAsync().ConfigureAwait(false);
                if (_stopped || generation != _generation) return;
                Stats = ShiftStats.From(history, DateTime.Now);
                Changed?.Invoke();
            }
            catch
            {
                // Billing-gated and non-essential -- a blocked clinic loses
                // the strip, which is the right thing to lose before an
                // alert ever is.
            }
        }

        private async Task RefreshNoticeAsync()
        {
            var generation = _generation;
            try
            {
                var notice = await _api.BillingNoticeAsync().ConfigureAwait(false);
                if (_stopped || generation != _generation) return;
                Notice = notice;
                Changed?.Invoke();
            }
            catch
            {
            }
        }

        /// <summary>
        /// Acknowledges and drops the card immediately rather than waiting
        /// for the next poll: a few seconds of an already-answered card
        /// still on screen invites a second nurse to walk to the same room.
        /// </summary>
        public async Task AcknowledgeAsync(int callId)
        {
            if (_stopped || !_pendingAcks.Add(callId)) return;

            var generation = _generation;
            Interlocked.Increment(ref _refreshSequence);
            var removed = Calls.Where(c => c.CallId == callId).ToList();
            Calls = Calls.Where(c => c.CallId != callId).ToList();
            Changed?.Invoke();
            try
            {
                await _api.AcknowledgeAsync(callId).ConfigureAwait(false);
                if (_stopped || generation != _generation) return;
                Interlocked.Increment(ref _refreshSequence);
                _pendingAcks.Remove(callId);
                _onAcknowledged?.Invoke(callId);
                _ = RefreshStatsAsync();
            }
            catch (Exception e)
            {
                if (_stopped || generation != _generation) return;
                _pendingAcks.Remove(callId);
                if (e is ApiException ae && ae.IsUnauthorized)
                {
                    Stop();
                    _onUnauthorized();
                    return;
                }
                // Restore only this call, preserving unrelated arrivals.
                if (!Calls.Any(c => c.CallId == callId))
                {
                    Calls = Calls.Concat(removed).ToList();
                }
                Changed?.Invoke();
                await RefreshAsync().ConfigureAwait(false);
                throw;
            }
        }

        public void Dispose() => Stop();
    }
}
