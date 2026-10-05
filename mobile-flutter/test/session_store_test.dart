import 'dart:async';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nursecall/api/client.dart';
import 'package:nursecall/auth/session_store.dart';

const session =
    '{"access_token":"original","role":"nurse","name":"Nurse","clinic_id":1}';
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(
    () => FlutterSecureStorage.setMockInitialValues({
      'nursecall.session': session,
    }),
  );

  test(
    'logout unregisters with the current bearer before deleting it',
    () async {
      final requests = <http.Request>[];
      final api = ApiClient(
        httpClient: MockClient((r) async {
          requests.add(r);
          return http.Response('{"ok":true}', 200);
        }),
      );
      final store = SessionStore(api);
      await store.restore();
      store.beforeSignOut = () => api.unregisterPushToken('push-address');
      await store.signOut();
      expect(requests.single.headers['Authorization'], 'Bearer original');
      expect(api.accessToken, isNull);
      expect(store.isSignedIn, isFalse);
      expect(
        await const FlutterSecureStorage().read(key: 'nursecall.session'),
        isNull,
      );
    },
  );

  test(
    'a renewal completing after logout cannot resurrect the session',
    () async {
      final response = Completer<http.Response>();
      final api = ApiClient(httpClient: MockClient((_) => response.future));
      final store = SessionStore(api);
      await store.restore();
      final renewing = store.renew();
      await store.signOut();
      response.complete(
        http.Response(session.replaceFirst('original', 'renewed'), 200),
      );
      await renewing;
      expect(store.isSignedIn, isFalse);
      expect(api.accessToken, isNull);
      expect(
        await const FlutterSecureStorage().read(key: 'nursecall.session'),
        isNull,
      );
    },
  );

  test('cleanup failure still clears local credentials', () async {
    final api = ApiClient();
    final store = SessionStore(api);
    await store.restore();
    store.beforeSignOut = () async => throw StateError('offline');
    await store.signOut();
    expect(store.isSignedIn, isFalse);
    expect(api.accessToken, isNull);
    api.close();
  });
}
