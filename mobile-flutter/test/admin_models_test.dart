// The management types, where a wrong reading is a wrong decision.
//
// Two of these carry a meaning that is the opposite of how the raw value looks,
// and both would be easy to get backwards:
//
//   - a staff member with no floors receives *every* floor, not none;
//   - a receiver with no last_seen_at was never connected, which is a setup
//     mistake rather than an outage, and must not be reported as one.

import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/api/models.dart';

void main() {
  group('Device', () {
    test('a working receiver reads as online', () {
      final d = Device.fromJson({
        'id': 1,
        'device_id': 'esp32-a',
        'floor': 3,
        'online': true,
        'last_seen_at': '2026-10-02T12:00:00Z',
      });
      expect(d.online, isTrue);
      expect(d.neverSeen, isFalse);
      expect(d.floor, 3);
    });

    test('never connected is told apart from gone quiet', () {
      // Both are offline, and the difference decides whether somebody walks to
      // the ward or finishes configuring a box that was never plugged in.
      final never = Device.fromJson({
        'id': 2,
        'device_id': 'esp32-b',
        'floor': 1,
        'online': false,
        'last_seen_at': null,
      });
      final silent = Device.fromJson({
        'id': 3,
        'device_id': 'esp32-c',
        'floor': 1,
        'online': false,
        'last_seen_at': '2026-09-28T09:00:00Z',
      });
      expect(never.neverSeen, isTrue);
      expect(silent.neverSeen, isFalse);
      expect(never.online, isFalse);
      expect(silent.online, isFalse);
    });

    test('online comes from the server, never from the timestamp', () {
      // The heartbeat window lives on the server, which also sends the offline
      // alerts. Recomputing it here would eventually disagree with the alert.
      final d = Device.fromJson({
        'id': 4,
        'device_id': 'esp32-d',
        'floor': 2,
        'online': true,
        'last_seen_at': '2020-01-01T00:00:00Z',
      });
      expect(d.online, isTrue);
    });

    test('a response without the online field is read as offline', () {
      // The safe direction: claiming a silent receiver is fine would hide the
      // one failure this screen exists to show.
      final d = Device.fromJson({
        'id': 5,
        'device_id': 'esp32-e',
        'floor': 1,
        'last_seen_at': null,
      });
      expect(d.online, isFalse);
    });
  });

  group('Staff', () {
    test('no floors means every floor', () {
      final s = Staff.fromJson({
        'id': 1,
        'email': 'a@b.uz',
        'role': 'nurse',
        'name': 'Nigora',
        'floors': <int>[],
      });
      expect(s.allFloors, isTrue, reason: 'bo‘sh ro‘yxat = barcha qavatlar');
      expect(s.isAdmin, isFalse);
    });

    test('assigned floors are exactly those floors', () {
      final s = Staff.fromJson({
        'id': 2,
        'email': 'b@b.uz',
        'role': 'nurse',
        'name': 'Asila',
        'floors': [2, 3],
      });
      expect(s.allFloors, isFalse);
      expect(s.floors, [2, 3]);
    });

    test('a missing floors field is read as unrestricted, not as none', () {
      final s = Staff.fromJson({
        'id': 3,
        'email': 'c@b.uz',
        'role': 'admin',
        'name': 'Dilnoza',
      });
      expect(s.allFloors, isTrue);
      expect(s.isAdmin, isTrue);
    });
  });

  group('UnassignedSignal', () {
    test('it carries the count that tells a button from interference', () {
      final s = UnassignedSignal.fromJson({
        'id': 1,
        'device_id': 'esp32-a',
        'ev1527_code': 7654321,
        'first_seen_at': '2026-10-02T17:50:00Z',
        'last_seen_at': '2026-10-02T17:52:00Z',
        'seen_count': 3,
      });
      expect(s.code, 7654321);
      expect(s.seenCount, 3);
      expect(s.deviceId, 'esp32-a');
    });

    test('a missing count is read as one, the cautious reading', () {
      final s = UnassignedSignal.fromJson({
        'id': 2,
        'device_id': 'esp32-a',
        'ev1527_code': 11,
        'first_seen_at': '2026-10-02T17:50:00Z',
        'last_seen_at': '2026-10-02T17:50:00Z',
      });
      expect(s.seenCount, 1);
    });
  });

  group('ButtonPairing', () {
    test('a pairing names the room it will raise a call for', () {
      final b = ButtonPairing.fromJson({
        'id': 9,
        'room_id': 4,
        'room_number': '502',
        'floor': 5,
        'ev1527_code': 7654321,
      });
      expect(b.roomNumber, '502');
      expect(b.floor, 5);
      expect(b.code, 7654321);
    });
  });
}
