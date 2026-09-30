import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nursecall/api/client.dart';
import 'package:nursecall/calls/calls_feed.dart';

/// Builds a feed whose server answers exactly what each test needs.
///
/// `handler` sees every request, so a test can assert on what was sent as well
/// as control what comes back.
({
  CallsFeed feed,
  List<http.Request> sent,
  List<String> events,
  List<int> cleared,
}) _feed({
  required Future<http.Response> Function(http.Request) handler,
}) {
  final sent = <http.Request>[];
  final events = <String>[];
  final cleared = <int>[];
  final api = ApiClient(
    httpClient: MockClient((req) {
      sent.add(req);
      return handler(req);
    }),
  );
  api.setToken('test-token');
  final feed = CallsFeed(
    api,
    onUnauthorized: () => events.add('signed-out'),
    onAcknowledged: cleared.add,
  );
  return (feed: feed, sent: sent, events: events, cleared: cleared);
}

String _calls(List<({int id, String room, int floor, String at})> rows) =>
    jsonEncode([
      for (final r in rows)
        {
          'call_id': r.id,
          'room_number': r.room,
          'floor': r.floor,
          'created_at': r.at,
          'status': 'active',
        }
    ]);

void main() {
  group('refresh', () {
    test('puts the longest-waiting call first, whatever order it arrives in',
        () async {
      // The nurse must not have to scan for the person who has been waiting
      // longest, and an arrival-ordered list buries them exactly when the ward
      // gets busy.
      final h = _feed(
        handler: (_) async => http.Response(
          _calls([
            (id: 1, room: '101', floor: 1, at: '2026-10-01T12:00:00Z'),
            (id: 2, room: '202', floor: 2, at: '2026-10-01T11:00:00Z'),
            (id: 3, room: '303', floor: 3, at: '2026-10-01T11:30:00Z'),
          ]),
          200,
        ),
      );
      await h.feed.refresh();
      expect(h.feed.calls.map((c) => c.roomNumber), ['202', '303', '101']);
    });

    test('a network failure is reported, not shown as an empty ward', () async {
      // An unreachable server and a quiet ward produce the same empty list.
      // Only this flag tells them apart.
      final h = _feed(handler: (_) async => throw http.ClientException('no net'));
      await h.feed.refresh();
      expect(h.feed.reachable, isFalse);
      expect(h.feed.loading, isFalse);
    });

    test('recovering from a failure clears the warning', () async {
      var fail = true;
      final h = _feed(
        handler: (_) async {
          if (fail) throw http.ClientException('no net');
          return http.Response(_calls([]), 200);
        },
      );
      await h.feed.refresh();
      expect(h.feed.reachable, isFalse);
      fail = false;
      await h.feed.refresh();
      expect(h.feed.reachable, isTrue);
    });

    test('a rejected session signs the nurse out rather than going quiet',
        () async {
      // A board that has silently stopped updating looks like a calm ward.
      final h = _feed(
        handler: (_) async => http.Response('{"detail":"Not authenticated"}', 401),
      );
      await h.feed.refresh();
      expect(h.events, contains('signed-out'));
    });
  });

  group('acknowledging', () {
    test('the card goes immediately, without waiting for the next poll', () async {
      // Five seconds of an answered call still on screen invites a second nurse
      // to walk to the same room.
      final h = _feed(
        handler: (req) async => req.method == 'POST'
            ? http.Response('{"call_id":1,"status":"acknowledged","acknowledged_at":"2026-10-01T12:00:00Z"}', 200)
            : http.Response(
                _calls([
                  (id: 1, room: '101', floor: 1, at: '2026-10-01T12:00:00Z'),
                  (id: 2, room: '202', floor: 2, at: '2026-10-01T12:01:00Z'),
                ]),
                200,
              ),
      );
      await h.feed.refresh();
      expect(h.feed.calls.length, 2);
      await h.feed.acknowledge(1);
      expect(h.feed.calls.map((c) => c.callId), [2]);
    });

    test('sends no acknowledged_by, so the server attributes it', () async {
      // A client-supplied name can be wrong or faked; the token cannot.
      final h = _feed(
        handler: (req) async => req.method == 'POST'
            ? http.Response('{"call_id":1,"status":"acknowledged","acknowledged_at":"2026-10-01T12:00:00Z"}', 200)
            : http.Response(_calls([(id: 1, room: '101', floor: 1, at: '2026-10-01T12:00:00Z')]), 200),
      );
      await h.feed.refresh();
      await h.feed.acknowledge(1);
      final post = h.sent.firstWhere((r) => r.method == 'POST');
      expect(jsonDecode(post.body), isEmpty);
    });

    test('another nurse getting there first counts as answered, not as an error',
        () async {
      // 409 is the normal outcome of two people reacting to the same call.
      final h = _feed(
        handler: (req) async => req.method == 'POST'
            ? http.Response('{"detail":"Call already acknowledged"}', 409)
            : http.Response(_calls([(id: 1, room: '101', floor: 1, at: '2026-10-01T12:00:00Z')]), 200),
      );
      await h.feed.refresh();
      await h.feed.acknowledge(1);
      expect(h.feed.calls, isEmpty);
    });

    test('a failure puts the call back, because a hidden call is the worse error',
        () async {
      // Showing a call that was in fact answered costs a wasted walk. Hiding one
      // that was not costs a patient waiting with nobody coming.
      final h = _feed(
        handler: (req) async => req.method == 'POST'
            ? http.Response('{"detail":"boom"}', 500)
            : http.Response(_calls([(id: 1, room: '101', floor: 1, at: '2026-10-01T12:00:00Z')]), 200),
      );
      await h.feed.refresh();
      await expectLater(h.feed.acknowledge(1), throwsA(anything));
      expect(h.feed.calls.map((c) => c.callId), [1]);
    });

    test('answering clears the lock-screen alert for that call', () async {
      // The alert is posted `ongoing` so a pocket cannot swipe it away, which
      // means something has to take it down deliberately. Left up, it sits there
      // for a room somebody has already been to and the next call is easy to
      // mistake for it.
      final h = _feed(
        handler: (req) async => req.method == 'POST'
            ? http.Response('{"call_id":7,"status":"acknowledged","acknowledged_at":"2026-10-01T12:00:00Z"}', 200)
            : http.Response(_calls([(id: 7, room: '101', floor: 1, at: '2026-10-01T12:00:00Z')]), 200),
      );
      await h.feed.refresh();
      await h.feed.acknowledge(7);
      expect(h.cleared, [7]);
    });

    test('a failed answer leaves the alert up, because the call is still waiting',
        () async {
      final h = _feed(
        handler: (req) async => req.method == 'POST'
            ? http.Response('{"detail":"boom"}', 500)
            : http.Response(_calls([(id: 7, room: '101', floor: 1, at: '2026-10-01T12:00:00Z')]), 200),
      );
      await h.feed.refresh();
      await expectLater(h.feed.acknowledge(7), throwsA(anything));
      expect(h.cleared, isEmpty);
    });

    test('a rejected session during ack signs out and does not restore the card',
        () async {
      final h = _feed(
        handler: (req) async => req.method == 'POST'
            ? http.Response('{"detail":"Not authenticated"}', 401)
            : http.Response(_calls([(id: 1, room: '101', floor: 1, at: '2026-10-01T12:00:00Z')]), 200),
      );
      await h.feed.refresh();
      await h.feed.acknowledge(1);
      expect(h.events, contains('signed-out'));
    });
  });
}
