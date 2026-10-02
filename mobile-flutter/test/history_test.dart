// How a past call is read off the wire.
//
// The history screen's whole value is telling three outcomes apart: somebody
// answered, somebody is still waiting, and nobody ever came. The last of those
// is new -- calls now close themselves as `expired` after twelve hours -- and
// collapsing it into either of the others would put a false reassurance on the
// one screen a clinic would use to check whether its patients were reached.

import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/api/models.dart';

Map<String, dynamic> _row({
  String status = 'acknowledged',
  String? acknowledgedAt = '2026-10-01T10:01:15Z',
  String? acknowledgedBy = 'Nigora Saidova',
}) => {
  'call_id': 7,
  'room_number': '304',
  'floor': 3,
  'status': status,
  'device_id': 'esp32-a',
  'created_at': '2026-10-01T10:00:00Z',
  'acknowledged_at': acknowledgedAt,
  'acknowledged_by': acknowledgedBy,
};

void main() {
  group('HistoryCall', () {
    test('an answered call carries who went and how long it took', () {
      final c = HistoryCall.fromJson(_row());
      expect(c.roomNumber, '304');
      expect(c.answered, isTrue);
      expect(c.expired, isFalse);
      expect(c.acknowledgedBy, 'Nigora Saidova');
      expect(c.answeredIn, const Duration(seconds: 75));
    });

    test('an expired call is never reported as answered', () {
      final c = HistoryCall.fromJson(
        _row(status: 'expired', acknowledgedAt: null, acknowledgedBy: null),
      );
      expect(c.expired, isTrue);
      expect(c.answered, isFalse, reason: 'hech kim javob bermagan');
      expect(c.answeredIn, isNull);
    });

    test('a call still waiting is neither answered nor expired', () {
      final c = HistoryCall.fromJson(
        _row(status: 'active', acknowledgedAt: null, acknowledgedBy: null),
      );
      expect(c.answered, isFalse);
      expect(c.expired, isFalse);
    });

    test('an unknown status is kept, not guessed at', () {
      // A server that grows a fourth status must not have it silently read as
      // one of the three this build knows about.
      final c = HistoryCall.fromJson(_row(status: 'cancelled_by_staff'));
      expect(c.status, 'cancelled_by_staff');
      expect(c.expired, isFalse);
    });

    test('answered is decided by the timestamp, not by the status word', () {
      // The timestamp is what every answer-time figure is computed from, so it
      // is the one that has to be authoritative.
      final c = HistoryCall.fromJson(_row(status: 'expired'));
      expect(c.answered, isTrue);
    });

    test('a row missing optional fields still parses', () {
      // An older server, or a call whose receiver was deleted, must not crash
      // the list -- a history screen that throws is worse than a sparse one.
      final c = HistoryCall.fromJson({
        'call_id': 1,
        'created_at': '2026-10-01T10:00:00Z',
        'acknowledged_at': null,
        'acknowledged_by': null,
      });
      expect(c.roomNumber, '');
      expect(c.floor, 0);
      expect(c.answered, isFalse);
    });
  });
}
