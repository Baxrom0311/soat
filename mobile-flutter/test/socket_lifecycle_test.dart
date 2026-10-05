import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/api/live_socket.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class Channel implements WebSocketChannel {
  final readiness = Completer<void>();
  final controller = StreamController<dynamic>();
  @override
  Future<void> get ready => readiness.future;
  @override
  Stream<dynamic> get stream => controller.stream;
  @override
  WebSocketSink get sink => Sink(controller);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class Sink implements WebSocketSink {
  Sink(this.controller);
  final StreamController<dynamic> controller;
  @override
  Future<void> close([int? code, String? reason]) async {
    controller.close();
  }

  @override
  void add(dynamic data) {}
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('live waits for handshake and ignores a disposed handshake', (
    tester,
  ) async {
    final channel = Channel();
    final states = <bool>[];
    final socket = LiveSocket(
      onEvent: (_) {},
      onStateChanged: states.add,
      connector: (_, _) => channel,
    );
    socket.connect('token');
    expect(states, isEmpty);
    socket.dispose();
    channel.readiness.complete();
    await tester.pump();
    expect(states, isEmpty);
  });

  testWidgets('asynchronous failures increase the reconnect delay', (
    tester,
  ) async {
    final channels = <Channel>[];
    final states = <bool>[];
    final socket = LiveSocket(
      onEvent: (_) {},
      onStateChanged: states.add,
      connector: (_, _) {
        final c = Channel();
        channels.add(c);
        return c;
      },
    );
    socket.connect('token');
    channels[0].readiness.completeError(StateError('offline'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(channels.length, 2);
    channels[1].readiness.completeError(StateError('offline'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(channels.length, 2);
    await tester.pump(const Duration(seconds: 1));
    expect(channels.length, 3);
    expect(states, isEmpty);
    socket.dispose();
    channels[2].readiness.complete();
    await tester.pump();
  });
}
