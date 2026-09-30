import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/api/models.dart';
import 'package:nursecall/calls/call_card.dart';
import 'package:nursecall/theme/tokens.dart';

Call _call({
  int id = 1,
  String room = '204',
  int floor = 2,
  Duration waited = Duration.zero,
}) {
  final now = DateTime.utc(2026, 10, 1, 12, 0, 0);
  return Call(
    callId: id,
    roomNumber: room,
    floor: floor,
    createdAt: now.subtract(waited),
    status: 'active',
  );
}

final _now = DateTime.utc(2026, 10, 1, 12, 0, 0);

Future<void> _pump(
  WidgetTester tester,
  Call call, {
  bool busy = false,
  Future<void> Function()? onAck,
}) =>
    tester.pumpWidget(
      MaterialApp(
        theme: T.theme(),
        home: Scaffold(
          body: CallCard(
            call: call,
            now: _now,
            busy: busy,
            onAcknowledge: onAck ?? () async {},
          ),
        ),
      ),
    );

/// The colour the card is actually painting for this call.
Color _accent(WidgetTester tester) {
  final button = tester.widget<FilledButton>(find.byType(FilledButton));
  return button.style!.backgroundColor!.resolve({})!;
}

void main() {
  group('what the card says', () {
    testWidgets('the room number is on screen', (t) async {
      await _pump(t, _call(room: '307'));
      expect(find.text('307'), findsOneWidget);
    });

    testWidgets('the floor is labelled, not just a bare number', (t) async {
      // "2" alone next to a room number reads as part of the room.
      await _pump(t, _call(floor: 2));
      expect(find.text('2-qavat'), findsOneWidget);
    });

    testWidgets('the waiting time is a running clock', (t) async {
      await _pump(t, _call(waited: const Duration(minutes: 23, seconds: 8)));
      expect(find.text('23:08'), findsOneWidget);
    });

    testWidgets('a room number too long to fit is truncated, not overflowed',
        (t) async {
      // Room numbers are free text on the server; one clinic already stores
      // "302-xona". A RenderFlex overflow here would paint a debug stripe across
      // a card a nurse is meant to read at a glance. takeException() is how the
      // test framework surfaces that -- it returns null when nothing overflowed.
      await _pump(t, _call(room: '302-xona-juda-uzun-nom-123456789'));
      expect(t.takeException(), isNull);
      expect(find.byType(CallCard), findsOneWidget);
    });
  });

  group('colour means waiting time', () {
    testWidgets('a fresh call is the calm colour', (t) async {
      await _pump(t, _call(waited: const Duration(seconds: 30)));
      expect(_accent(t), T.step1);
    });

    testWidgets('past two minutes it escalates', (t) async {
      await _pump(t, _call(waited: const Duration(minutes: 3)));
      expect(_accent(t), T.step2);
    });

    testWidgets('past ten minutes it is at the top of the scale', (t) async {
      await _pump(t, _call(waited: const Duration(minutes: 11)));
      expect(_accent(t), T.step3);
    });

    testWidgets('the middle step uses dark ink, because amber is a light colour',
        (t) async {
      // White on amber fails legibility badly, and the call card is the one
      // surface where "mostly readable" is not good enough.
      await _pump(t, _call(waited: const Duration(minutes: 3)));
      final button = t.widget<FilledButton>(find.byType(FilledButton));
      expect(button.style!.foregroundColor!.resolve({}), isNot(Colors.white));
    });
  });

  group('acknowledging', () {
    testWidgets('tapping the button calls back exactly once', (t) async {
      var calls = 0;
      await _pump(t, _call(), onAck: () async => calls++);
      await t.tap(find.byType(FilledButton));
      await t.pump();
      expect(calls, 1);
    });

    testWidgets('a card already being acknowledged cannot be tapped again',
        (t) async {
      // Two taps would mean two requests and, on a busy ward, two nurses
      // believing they are the one who answered.
      var calls = 0;
      await _pump(t, _call(), busy: true, onAck: () async => calls++);
      await t.tap(find.byType(FilledButton));
      await t.pump();
      expect(calls, 0);
    });

    testWidgets('a card being acknowledged shows it is working', (t) async {
      await _pump(t, _call(), busy: true);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Qabul qilish'), findsNothing);
    });
  });
}
