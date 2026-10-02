// Reconnect pacing for the live call socket.
//
// The socket is the thing that makes a patient's call appear instantly, so when
// it drops the retry schedule is a patient-safety decision rather than a style
// one: too slow and a ward is uncovered while the phone sits there looking fine,
// too fast and a hundred handsets hammer a server that is already struggling.

import 'package:flutter_test/flutter_test.dart';
import 'package:nursecall/api/live_socket.dart';

void main() {
  group('LiveSocket.backoff', () {
    test('the first retry is immediate enough to matter', () {
      // The usual cause of a drop is a phone that just rejoined Wi-Fi, and the
      // ward is uncovered until this succeeds.
      expect(LiveSocket.backoff(0), const Duration(seconds: 1));
    });

    test('it backs off instead of hammering', () {
      final waits = [
        for (var i = 0; i < 6; i++) LiveSocket.backoff(i).inSeconds,
      ];
      for (var i = 1; i < waits.length; i++) {
        expect(
          waits[i],
          greaterThanOrEqualTo(waits[i - 1]),
          reason: 'kutish vaqti kamayib ketdi: $waits',
        );
      }
    });

    test('it stops growing, so a long outage still reconnects promptly', () {
      // Unbounded exponential backoff is the trap here: a server down for an
      // hour would leave phones waiting hours after it came back.
      expect(LiveSocket.backoff(50), const Duration(seconds: 30));
      expect(LiveSocket.backoff(5000), const Duration(seconds: 30));
    });

    test('a nonsensical attempt count does not throw', () {
      // Nothing should ever pass a negative, but an index error here would take
      // out the reconnect loop entirely and leave the socket down for good.
      expect(LiveSocket.backoff(-1), const Duration(seconds: 1));
    });
  });
}
