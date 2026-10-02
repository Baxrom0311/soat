import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'client.dart';

/// What the server just told us happened on this clinic's ward.
///
/// Only the fact that *something* changed is carried, not the change itself. The
/// feed re-reads the authoritative list when one of these arrives, which means a
/// dropped or duplicated event cannot leave the screen disagreeing with the
/// server -- the socket makes the app fast, the HTTP read keeps it correct.
enum LiveEvent { newCall, acknowledged, other }

/// Live call events over a WebSocket, with polling still underneath.
///
/// The app polled every five seconds. That is up to five seconds between a
/// patient pressing a button and a nurse's screen showing it -- on top of
/// however long the press took to reach the server -- and it is seventeen
/// thousand requests a day per phone to say "nothing has changed".
///
/// This is deliberately an *addition* rather than a replacement. A WebSocket
/// that dies quietly is the classic way to build a screen that looks live and is
/// not: the phone sleeps, a carrier NAT drops the connection, the socket object
/// stays open and no error is ever delivered. So the feed keeps a slow poll as
/// its safety net and this only makes the common case instant.
///
/// The token travels in the `Sec-WebSocket-Protocol` header rather than the
/// query string, because a query string is written verbatim into nginx's and
/// uvicorn's access logs -- a production journal was once found holding 131 live
/// session tokens that way.
class LiveSocket {
  LiveSocket({required this.onEvent, required this.onStateChanged});

  /// Called for every event the server pushes. The feed decides what to re-read.
  final void Function(LiveEvent event) onEvent;

  /// Called when the connection comes up or goes down, so the UI can say which.
  final void Function(bool connected) onStateChanged;

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _reconnect;
  Timer? _heartbeat;
  int _attempt = 0;
  bool _wanted = false;
  bool _connected = false;

  bool get connected => _connected;

  /// Backoff for reconnecting: quick at first, then backing off to half a minute.
  ///
  /// The first retries are fast because the usual cause is a phone that just
  /// came back onto Wi-Fi and the ward is uncovered until this succeeds. The cap
  /// exists because the other usual cause is a server that is down, and a
  /// hundred phones retrying every second is not help.
  static Duration backoff(int attempt) {
    const steps = [1, 2, 5, 10, 20, 30];
    return Duration(seconds: steps[attempt.clamp(0, steps.length - 1)]);
  }

  void connect(String token) {
    _wanted = true;
    _open(token);
  }

  void _open(String token) {
    _teardown();
    if (!_wanted) return;

    final url = Uri.parse(baseUrl.isEmpty ? '/ws/calls' : '$baseUrl/ws/calls');
    final ws = url.replace(scheme: url.scheme == 'http' ? 'ws' : 'wss');

    try {
      // Two protocol values: the literal "bearer" and the token itself. The
      // server echoes "bearer" back; a browser refuses the connection outright
      // if the server answers with no subprotocol at all, which is why the
      // server side bothers to echo.
      final channel = WebSocketChannel.connect(
        ws,
        protocols: ['bearer', token],
      );
      _channel = channel;
      _sub = channel.stream.listen(
        _onMessage,
        onError: (_) => _dropped(token),
        onDone: () => _dropped(token),
        cancelOnError: true,
      );
      _setConnected(true);
      _attempt = 0;

      // Something has to travel periodically or an idle socket is indistinguishable
      // from a dead one -- to us, and to every NAT between here and the server.
      _heartbeat = Timer.periodic(const Duration(seconds: 25), (_) {
        try {
          channel.sink.add('ping');
        } catch (_) {
          _dropped(token);
        }
      });
    } catch (e) {
      debugPrint('WS ulanmadi: $e');
      _dropped(token);
    }
  }

  void _onMessage(dynamic raw) {
    _setConnected(true);
    LiveEvent event = LiveEvent.other;
    try {
      final decoded = jsonDecode(raw as String);
      if (decoded is Map && decoded['type'] is String) {
        event = switch (decoded['type'] as String) {
          'new_call' => LiveEvent.newCall,
          'ack' => LiveEvent.acknowledged,
          _ => LiveEvent.other,
        };
      }
    } catch (_) {
      // A frame we cannot parse still means the server had something to say, so
      // it is worth a re-read. Treated as `other` rather than dropped.
    }
    onEvent(event);
  }

  void _dropped(String token) {
    if (!_wanted) return;
    _setConnected(false);
    _teardown();
    final wait = backoff(_attempt++);
    _reconnect = Timer(wait, () => _open(token));
  }

  void _setConnected(bool value) {
    if (_connected == value) return;
    _connected = value;
    onStateChanged(value);
  }

  void _teardown() {
    _heartbeat?.cancel();
    _heartbeat = null;
    _reconnect?.cancel();
    _reconnect = null;
    _sub?.cancel();
    _sub = null;
    try {
      _channel?.sink.close();
    } catch (_) {}
    _channel = null;
  }

  void dispose() {
    _wanted = false;
    _setConnected(false);
    _teardown();
  }
}
