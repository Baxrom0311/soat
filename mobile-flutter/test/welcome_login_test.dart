import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nursecall/api/client.dart';
import 'package:nursecall/auth/login_screen.dart';
import 'package:nursecall/auth/session_store.dart';
import 'package:nursecall/auth/welcome_screen.dart';
import 'package:nursecall/theme/tokens.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  ApiClient makeApi() => ApiClient(
        httpClient: MockClient(
          (r) async => http.Response('{"ok":true}', 200),
        ),
      );

  testWidgets('WelcomeScreen renders slides, beacon, and navigation buttons', (
    tester,
  ) async {
    final api = makeApi();
    final store = SessionStore(api);

    await tester.pumpWidget(
      MaterialApp(
        theme: T.theme(),
        home: WelcomeScreen(sessions: store),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    // Verify initial slide content
    expect(find.text('NurseCall'), findsWidgets);
    expect(find.text('1 Soniyada Bilakda Tebranish'), findsOneWidget);
    expect(find.text('Klinika Hisobiga Kirish'), findsOneWidget);
    expect(find.text('Boshlash (Loginsiz Sinash)'), findsOneWidget);

    // Swipe / Advance Page
    await tester.drag(find.byType(PageView), const Offset(-400, 0));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('0 Ta Yo‘qotilgan Chaqiruv'), findsOneWidget);
  });

  testWidgets('WelcomeScreen demo button enters guest demo session', (
    tester,
  ) async {
    final api = makeApi();
    final store = SessionStore(api);

    await tester.pumpWidget(
      MaterialApp(
        theme: T.theme(),
        home: WelcomeScreen(sessions: store),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    expect(store.session, isNull);

    // Tap Boshlash (Loginsiz Sinash)
    await tester.tap(find.text('Boshlash (Loginsiz Sinash)'));
    await tester.pump(const Duration(milliseconds: 200));

    expect(store.session, isNotNull);
    expect(store.session!.isGuest, isTrue);
    expect(store.session!.name, 'Hamshira (Demo)');
  });

  testWidgets('LoginScreen renders inputs and test chips', (tester) async {
    final api = makeApi();
    final store = SessionStore(api);

    await tester.pumpWidget(
      MaterialApp(
        theme: T.theme(),
        home: LoginScreen(sessions: store),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Klinika Tizimiga Kirish'), findsOneWidget);
    expect(find.text('Elektron pochta'), findsOneWidget);
    expect(find.text('Maxfiy parol'), findsOneWidget);
    expect(find.text('Hamshira'), findsOneWidget);
    expect(find.text('Admin'), findsOneWidget);

    // Tap quick chip
    await tester.tap(find.text('Hamshira'));
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('nurse@example.com'), findsOneWidget);
  });
}
