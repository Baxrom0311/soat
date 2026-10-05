import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'client.dart';

enum LiveEvent { newCall, acknowledged, other }

typedef SocketConnector =
    WebSocketChannel Function(Uri uri, Iterable<String> protocols);

/// The socket accelerates delivery; the feed keeps polling as a safety net.
class LiveSocket {
  LiveSocket({
    required this.onEvent,
    required this.onStateChanged,
    SocketConnector? connector,
  }) : _connector =
           connector ??
           ((uri, protocols) =>
               WebSocketChannel.connect(uri, protocols: protocols));
  final void Function(LiveEvent event) onEvent;
  final void Function(bool connected) onStateChanged;
  final SocketConnector _connector;
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _reconnect;
  Timer? _heartbeat;
  int _attempt = 0;
  int _generation = 0;
  bool _wanted = false;
  bool _connected = false;
  bool get connected => _connected;

  static Duration backoff(int attempt) {
    const steps = [1, 2, 5, 10, 20, 30];
    return Duration(seconds: steps[attempt.clamp(0, steps.length - 1)]);
  }

  void connect(String token) {
    _wanted = true;
    _attempt = 0;
    _open(token);
  }

  Future<void> _open(String token) async {
    _teardown();
    if (!_wanted) return;
    final generation = ++_generation;
    final url = Uri.base.resolve(
      baseUrl.isEmpty ? '/ws/calls' : '$baseUrl/ws/calls',
    );
    final uri = url.replace(scheme: url.scheme == 'http' ? 'ws' : 'wss');
    try {
      final channel = _connector(uri, ['bearer', token]);
      _channel = channel;
      _sub = channel.stream.listen(
        (raw) {
          if (_wanted && generation == _generation) _onMessage(raw);
        },
        onError: (_) => _dropped(token, generation),
        onDone: () => _dropped(token, generation),
        cancelOnError: true,
      );
      await channel.ready.timeout(const Duration(seconds: 10));
      if (!_wanted || generation != _generation) return;
      _attempt = 0;
      _setConnected(true);
      _heartbeat = Timer.periodic(const Duration(seconds: 25), (_) {
        try {
          channel.sink.add('ping');
        } catch (_) {
          _dropped(token, generation);
        }
      });
    } catch (_) {
      _dropped(token, generation);
    }
  }

  void _onMessage(dynamic raw) {
    LiveEvent event = LiveEvent.other;
    try {
      final decoded = jsonDecode(raw as String);
      if (decoded is Map) {
        event = switch (decoded['type']) {
          'new_call' => LiveEvent.newCall,
          'ack' => LiveEvent.acknowledged,
          _ => LiveEvent.other,
        };
      }
    } catch (_) {}
    onEvent(event);
  }

  void _dropped(String token, int generation) {
    if (!_wanted || generation != _generation) return;
    ++_generation; // onError, onDone, and ready may all report the same failure.
    _teardown();
    _setConnected(false);
    _reconnect = Timer(backoff(_attempt++), () => _open(token));
  }

  void _setConnected(bool value) {
    if (_connected == value) return;
    _connected = value;
    onStateChanged(value);
  }

  void _teardown() {
    _heartbeat?.cancel();
    _reconnect?.cancel();
    _heartbeat = null;
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
    ++_generation;
    _teardown();
    _setConnected(false);
  }
}
