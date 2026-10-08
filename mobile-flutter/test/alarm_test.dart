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

  test('the alarm is told exactly which calls it rings for', () {
    final calls = [
      call(1, const Duration(minutes: 1)),
      call(2, const Duration(hours: 3)),
      call(3, const Duration(seconds: 10)),
      call(4, Duration.zero, status: 'acknowledged'),
    ];
    expect(ringingIds(calls, {3}, now), {1});
  });

  group('backend', backendTests);
}

class _FakeBackend implements AlarmBackend {
  final starts = <(Set<int>, List<int>)>[];
  int stops = 0;

  @override
  Future<void> start(Set<int> callIds, List<Call> arrived) async =>
      starts.add((callIds, [for (final c in arrived) c.callId]));

  @override
  Future<void> stop() async => stops++;
}

void backendTests() {
  late _FakeBackend backend;
  setUp(() {
    backend = _FakeBackend();
    AlarmService.instance.backend = backend;
  });
  tearDown(() => AlarmService.instance.stopAlarm());

  test('a backend hears only the calls that just arrived', () async {
    final a = call(1, const Duration(seconds: 5));
    final b = call(2, const Duration(seconds: 1));
    await AlarmService.instance.sync({1}, calls: [a]);
    await AlarmService.instance.sync({1}, calls: [a]);
    await AlarmService.instance.sync({1, 2}, calls: [a, b]);
    expect(backend.starts.map((s) => s.$2), [
      [1],
      [2],
    ]);
    expect(AlarmService.instance.isPlaying, isTrue);
  });

  test('an empty set stops the backend once', () async {
    await AlarmService.instance.sync({1}, calls: [call(1, Duration.zero)]);
    await AlarmService.instance.sync({});
    await AlarmService.instance.sync({});
    expect(backend.stops, 1);
    expect(AlarmService.instance.isPlaying, isFalse);
  });

  test('a backend that throws does not break the next sync', () async {
    AlarmService.instance.backend = _ThrowingBackend();
    await AlarmService.instance.sync({1}, calls: [call(1, Duration.zero)]);
    await AlarmService.instance.stopAlarm();
    AlarmService.instance.backend = backend;
    await AlarmService.instance.sync({2}, calls: [call(2, Duration.zero)]);
    expect(backend.starts.single.$2, [2]);
  });
}

class _ThrowingBackend implements AlarmBackend {
  @override
  Future<void> start(Set<int> callIds, List<Call> arrived) =>
      Future.error(Exception('no audio device'));

  @override
  Future<void> stop() => Future.error(Exception('no audio device'));
}
