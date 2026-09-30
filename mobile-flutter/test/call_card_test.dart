import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/api/models.dart';
import 'package:nursecall/calls/call_card.dart';
import 'package:nursecall/theme/tokens.dart';

import 'font_loader.dart';

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

/// The card's own background — the value that differs per waiting step.
Color _cardColour(WidgetTester tester) {
  final box = tester.widget<Container>(
    find.descendant(
      of: find.byType(CallCard),
      matching: find.byType(Container),
    ).first,
  );
  return ((box.decoration! as BoxDecoration).color)!;
}

void main() {
  setUpAll(loadAppFonts);

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

    testWidgets('an ordinary room number is shown in full, never abbreviated',
        (t) async {
      // The gap that let "204" render as "2...": the overflow case was tested
      // and the ordinary one was not. A truncated room number is worse than an
      // overflowing one -- it looks deliberate, and a nurse can act on it.
      await t.binding.setSurfaceSize(const Size(430, 800));
      addTearDown(() => t.binding.setSurfaceSize(null));
      for (final room in ['204', '118', '307', '6', '1012']) {
        await _pump(t, _call(room: room, waited: const Duration(minutes: 23, seconds: 8)));
        // find.text() is not enough: with `overflow: ellipsis` the widget still
        // holds the whole string and only the painting is clipped, so the naive
        // assertion passes on a card showing "2...". The laid-out paragraph is
        // where the truth is.
        final para = t.renderObject<RenderParagraph>(find.text(room));
        expect(para.didExceedMaxLines, isFalse,
            reason: 'xona $room qisqartirildi');
      }
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
      expect(_cardColour(t), T.step(1).card);
    });

    testWidgets('past two minutes it escalates', (t) async {
      await _pump(t, _call(waited: const Duration(minutes: 3)));
      expect(_cardColour(t), T.step(2).card);
    });

    testWidgets('past ten minutes it is at the top of the scale', (t) async {
      await _pump(t, _call(waited: const Duration(minutes: 11)));
      expect(_cardColour(t), T.step(3).card);
    });

    testWidgets('the middle step uses dark ink, because amber is a light colour',
        (t) async {
      // White on amber fails legibility badly, and the call card is the one
      // surface where "mostly readable" is not good enough.
      await _pump(t, _call(waited: const Duration(minutes: 3)));
      expect(T.step(2).buttonInk, isNot(Colors.white));
      expect(find.text('Qabul qilish'), findsOneWidget);
    });
  });

  group('acknowledging', () {
    testWidgets('tapping the button calls back exactly once', (t) async {
      var calls = 0;
      await _pump(t, _call(), onAck: () async => calls++);
      await t.tap(find.text('Qabul qilish'));
      await t.pump();
      expect(calls, 1);
    });

    testWidgets('a card already being acknowledged cannot be tapped again',
        (t) async {
      // Two taps would mean two requests and, on a busy ward, two nurses
      // believing they are the one who answered.
      var calls = 0;
      await _pump(t, _call(), busy: true, onAck: () async => calls++);
      // The label is replaced by a spinner while busy, so the tap goes at the
      // button's position rather than its text.
      await t.tap(find.byType(InkWell));
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
