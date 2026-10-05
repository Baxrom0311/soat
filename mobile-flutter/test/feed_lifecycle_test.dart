import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nursecall/api/client.dart';
import 'package:nursecall/api/live_socket.dart';
import 'package:nursecall/calls/calls_feed.dart';

String calls(int id) =>
    '[{"call_id":$id,"room_number":"101","floor":1,"created_at":"2026-10-01T12:00:00Z","status":"active"}]';

class ConnectedSocket extends LiveSocket {
  ConnectedSocket({required super.onEvent, required super.onStateChanged});
  @override
  void connect(String token) => onStateChanged(true);
  @override
  void dispose() => onStateChanged(false);
}

void main() {
  test('a slow earlier snapshot cannot overwrite a newer arrival', () async {
    final first = Completer<http.Response>();
    var count = 0;
    final api = ApiClient(
      httpClient: MockClient(
        (_) async => ++count == 1 ? first.future : http.Response(calls(2), 200),
      ),
    );
    final feed = CallsFeed(api, onUnauthorized: () {});
    final older = feed.refresh();
    await feed.refresh();
    first.complete(http.Response(calls(1), 200));
    await older;
    expect(feed.calls.single.callId, 2);
    feed.dispose();
  });

  test('a remote acknowledgement clears the existing notification', () async {
    var count = 0;
    final cleared = <int>[];
    final feed = CallsFeed(
      ApiClient(
        httpClient: MockClient(
          (_) async => http.Response(++count == 1 ? calls(7) : '[]', 200),
        ),
      ),
      onUnauthorized: () {},
      onAcknowledged: cleared.add,
    );
    await feed.refresh();
    await feed.refresh();
    expect(cleared, [7]);
    feed.dispose();
  });

  test('reset discards in-flight responses from the previous nurse', () async {
    final response = Completer<http.Response>();
    final feed = CallsFeed(
      ApiClient(httpClient: MockClient((_) => response.future)),
      onUnauthorized: () {},
    );
    final pending = feed.refresh();
    feed.reset();
    response.complete(http.Response(calls(9), 200));
    await pending;
    expect(feed.calls, isEmpty);
    feed.dispose();
  });

  testWidgets('stopping a connected socket cannot recreate a polling timer', (
    tester,
  ) async {
    var requests = 0;
    final feed = CallsFeed(
      ApiClient(
        httpClient: MockClient((_) async {
          requests++;
          return http.Response('[]', 200);
        }),
      ),
      onUnauthorized: () {},
      socketFactory: (event, state) =>
          ConnectedSocket(onEvent: event, onStateChanged: state),
    );
    feed.start(token: 'test');
    await tester.pump();
    feed.stop();
    final stoppedAt = requests;
    await tester.pump(const Duration(seconds: 60));
    expect(requests, stoppedAt);
    feed.dispose();
  });
}
