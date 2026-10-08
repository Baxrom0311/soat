import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/api/models.dart';
import 'package:nursecall/calls/alarm_service.dart';

Call call(int id, Duration age, {String status = 'active'}) => Call(
  callId: id,
  roomNumber: '10$id',
  floor: 1,
  createdAt: now.subtract(age),
  status: status,
);

final now = DateTime.utc(2026, 10, 8, 12);

void main() {
  test('a fresh active call rings', () {
    expect(shouldRing([call(1, const Duration(minutes: 1))], {}, now), isTrue);
  });

  test('a call older than the renotify limit does not ring', () {
    expect(shouldRing([call(1, const Duration(hours: 3))], {}, now), isFalse);
  });

  test('a silenced call does not ring, a newer one does', () {
    final calls = [call(1, const Duration(minutes: 5))];
    expect(shouldRing(calls, {1}, now), isFalse);
    expect(
      shouldRing([...calls, call(2, const Duration(seconds: 3))], {1}, now),
      isTrue,
    );
  });

  test('acknowledged calls never ring', () {
    expect(
      shouldRing([call(1, Duration.zero, status: 'acknowledged')], {}, now),
      isFalse,
    );
  });
}
