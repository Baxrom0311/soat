using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace NurseCall.Core
{
    public enum LiveEvent
    {
        NewCall,
        Acknowledged,
        Other
    }

    /// <summary>
    /// The live WS accelerator -- ported from mobile-flutter/lib/api/live_socket.dart.
    /// The REST poll in <see cref="CallsFeed"/> is the safety net; this is
    /// what makes a new call appear immediately instead of on the next poll.
    /// Authenticates the way server/app/routers/ws.py expects: the bearer
    /// token goes in the WebSocket subprotocol list
    /// (<c>Sec-WebSocket-Protocol: bearer, &lt;token&gt;</c>), never a query
    /// string -- a query string lands verbatim in nginx's access log.
    /// </summary>
    public sealed class LiveSocket : IDisposable
    {
        private readonly Action<LiveEvent> _onEvent;
        private readonly Action<bool> _onStateChanged;
        private readonly string _wsUri;

        private ClientWebSocket? _socket;
        private CancellationTokenSource? _receiveLoopCts;
        private Timer? _reconnectTimer;
        private Timer? _heartbeatTimer;
        private int _attempt;
        private long _generation;
        private bool _wanted;
        private bool _connected;

        /// <param name="wsUri">e.g. <c>wss://nurcecall.boos.uz/ws/calls</c>.</param>
        public LiveSocket(string wsUri, Action<LiveEvent> onEvent, Action<bool> onStateChanged)
        {
            _wsUri = wsUri;
            _onEvent = onEvent;
            _onStateChanged = onStateChanged;
        }

        public bool Connected => _connected;

        /// <summary>
        /// Reconnect delay by attempt number: immediate-ish on the first
        /// retry (the usual cause is a phone/PC that just rejoined Wi-Fi, and
        /// the ward is uncovered until this succeeds), capped at 30s so a
        /// server down for an hour does not leave a PC waiting hours after it
        /// comes back. A negative attempt is treated as 0 rather than
        /// indexing out of range -- an index error here would take out the
        /// reconnect loop for good.
        /// </summary>
        public static TimeSpan Backoff(int attempt)
        {
            int[] steps = { 1, 2, 5, 10, 20, 30 };
            var i = attempt < 0 ? 0 : attempt >= steps.Length ? steps.Length - 1 : attempt;
            return TimeSpan.FromSeconds(steps[i]);
        }

        public void Connect(string token)
        {
            _wanted = true;
            _attempt = 0;
            _ = OpenAsync(token);
        }

        private async Task OpenAsync(string token)
        {
            Teardown();
            if (!_wanted) return;
            var generation = Interlocked.Increment(ref _generation);

            var socket = new ClientWebSocket();
            socket.Options.AddSubProtocol("bearer");
            socket.Options.AddSubProtocol(token);
            _socket = socket;

            try
            {
                using var connectCts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                await socket.ConnectAsync(new Uri(_wsUri), connectCts.Token).ConfigureAwait(false);
                if (!_wanted || generation != _generation) return;

                _attempt = 0;
                SetConnected(true);

                _receiveLoopCts = new CancellationTokenSource();
                _ = ReceiveLoopAsync(socket, generation, _receiveLoopCts.Token);

                // A ping every 25s: cheap, and a dead socket that never sends
                // or receives otherwise looks alive to this process for a
                // long time (TCP keepalive on some networks is much slower
                // than that to notice).
                _heartbeatTimer = new Timer(_ => SendPing(socket, token, generation), null,
                    TimeSpan.FromSeconds(25), TimeSpan.FromSeconds(25));
            }
            catch
            {
                Dropped(token, generation);
            }
        }

        private async void SendPing(ClientWebSocket socket, string token, long generation)
        {
            try
            {
                var bytes = Encoding.UTF8.GetBytes("ping");
                await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None)
                    .ConfigureAwait(false);
            }
            catch
            {
                Dropped(token, generation);
            }
        }

        private async Task ReceiveLoopAsync(ClientWebSocket socket, long generation, CancellationToken ct)
        {
            var buffer = new byte[8192];
            try
            {
                while (!ct.IsCancellationRequested && socket.State == WebSocketState.Open)
                {
                    using var ms = new System.IO.MemoryStream();
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false);
                        if (result.MessageType == WebSocketMessageType.Close) throw new WebSocketException("closed");
                        ms.Write(buffer, 0, result.Count);
                    } while (!result.EndOfMessage);

                    if (!_wanted || generation != _generation) return;
                    OnMessage(Encoding.UTF8.GetString(ms.ToArray()));
                }
            }
            catch
            {
                // Falls through to Dropped below; the loop's only job past
                // this point is to stop, not to report -- SendAsync/ConnectAsync
                // failures already call Dropped themselves.
            }
        }

        private void OnMessage(string raw)
        {
            var e = LiveEvent.Other;
            try
            {
                var decoded = JObject.Parse(raw);
                var type = decoded["type"]?.ToString();
                e = type switch
                {
                    "new_call" => LiveEvent.NewCall,
                    "ack" => LiveEvent.Acknowledged,
                    _ => LiveEvent.Other,
                };
            }
            catch
            {
                // Not JSON, or not an object -- reported as Other rather than
                // dropping the connection over one malformed frame.
            }
            _onEvent(e);
        }

        private void Dropped(string token, long generation)
        {
            if (!_wanted || generation != _generation) return;
            Interlocked.Increment(ref _generation); // a late send/receive/connect failure must not re-trigger this.
            Teardown();
            SetConnected(false);
            var delay = Backoff(_attempt++);
            _reconnectTimer = new Timer(_ => { _ = OpenAsync(token); }, null, delay, Timeout.InfiniteTimeSpan);
        }

        private void SetConnected(bool value)
        {
            if (_connected == value) return;
            _connected = value;
            _onStateChanged(value);
        }

        private void Teardown()
        {
            _heartbeatTimer?.Dispose();
            _heartbeatTimer = null;
            _reconnectTimer?.Dispose();
            _reconnectTimer = null;
            _receiveLoopCts?.Cancel();
            _receiveLoopCts?.Dispose();
            _receiveLoopCts = null;
            try
            {
                _socket?.Abort();
                _socket?.Dispose();
            }
            catch
            {
                // Best-effort close; we are tearing down regardless.
            }
            _socket = null;
        }

        public void Dispose()
        {
            _wanted = false;
            Interlocked.Increment(ref _generation);
            Teardown();
            SetConnected(false);
        }
    }
}
