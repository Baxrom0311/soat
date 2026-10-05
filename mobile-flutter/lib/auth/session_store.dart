import 'dart:convert';
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/client.dart';
import '../api/models.dart';

/// Holds the signed-in nurse for the life of the app and across restarts.
///
/// The token goes into the platform keystore rather than plain preferences: it
/// is a bearer credential for a clinic's patient data, and these are shared
/// ward phones that get handed around and occasionally lost.
///
/// Defaults are used deliberately: flutter_secure_storage 11 encrypts with
/// AES-GCM under an RSA-wrapped KeyStore key out of the box, and resets rather
/// than throwing when a stored value can no longer be decrypted. The reset is
/// the behaviour we want -- an unreadable token means the nurse signs in again,
/// which is recoverable, where an exception on launch is not.
class SessionStore extends ChangeNotifier {
  SessionStore(this._api, {FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'nursecall.session';

  final ApiClient _api;
  final FlutterSecureStorage _storage;

  Session? _session;
  bool _restored = false;
  int _generation = 0;
  Future<void>? _signingOut;
  Future<void> _storageQueue = Future.value();
  Future<void> Function()? beforeSignOut;

  Future<void> _store(Future<void> Function() action) {
    _storageQueue = _storageQueue.catchError((_) {}).then((_) => action());
    return _storageQueue;
  }

  Session? get session => _session;
  bool get isSignedIn => _session != null;

  /// True once the stored session has been looked for, whether or not one was
  /// found. The UI waits for this before deciding which screen to show, so a
  /// signed-in nurse never sees the login form flash on a cold start.
  bool get restored => _restored;

  Future<void> restore() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw != null) {
        final s = Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
        _session = s;
        _api.setToken(s.accessToken);
      }
    } catch (_) {
      // A keystore that cannot be read (restored backup, reset device) means no
      // session, not a crash on launch. The nurse signs in again.
      _session = null;
      _api.setToken(null);
    }
    _restored = true;
    notifyListeners();
  }

  Future<Session> signIn(String email, String password) async {
    await _signingOut;
    final generation = ++_generation;
    final s = await _api.login(email, password);
    if (generation == _generation) await _persist(s, generation);
    return s;
  }

  /// Trades the current token for a fresh one, silently.
  ///
  /// Tokens last ninety days, down from a year. That is short enough to matter
  /// to somebody who leaves the app open all shift and never signs out: without
  /// this, a nurse would one morning find herself at the login screen for no
  /// reason she could see. Called when the app comes to the foreground, so a
  /// phone in daily use renews long before it ever expires.
  ///
  /// Every failure is swallowed. The existing token is still valid -- a failed
  /// renewal is a network blip, not a reason to touch a working session. The one
  /// exception is 401, which the caller's own unauthorized handling covers
  /// anyway; here it simply means the stored session is already dead.
  Future<void> renew() async {
    if (_session == null || _signingOut != null) return;
    final generation = _generation;
    try {
      final s = await _api.refresh();
      if (generation == _generation) await _persist(s, generation);
    } catch (_) {}
  }

  Future<void> _persist(Session s, int generation) async {
    if (generation != _generation) return;
    _session = s;
    _api.setToken(s.accessToken);
    await _store(
      () => _storage.write(
        key: _key,
        value: jsonEncode({
          'access_token': s.accessToken,
          'role': s.role,
          'name': s.name,
          'clinic_id': s.clinicId,
        }),
      ),
    );
    if (generation == _generation) notifyListeners();
  }

  /// Clears the session locally.
  ///
  /// Deliberately tolerant of failure: if wiping the keystore entry throws, the
  /// in-memory session is still dropped and the token still cleared from the
  /// client, because the thing that matters is that this phone stops acting as
  /// the previous nurse.
  Future<void> signOut() {
    if (_signingOut != null) return _signingOut!;
    final completion = Completer<void>();
    _signingOut = completion.future;
    ++_generation;
    () async {
      try {
        // Unregister with the current credential before clearing the HTTP client.
        await beforeSignOut?.call();
      } finally {
        _session = null;
        _api.setToken(null);
        try {
          await _store(() => _storage.delete(key: _key));
        } catch (_) {}
        _signingOut = null;
        notifyListeners();
        completion.complete();
      }
    }().catchError((_) {});
    return completion.future;
  }
}
