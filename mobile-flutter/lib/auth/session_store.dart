import 'dart:convert';

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
    final s = await _api.login(email, password);
    await _persist(s);
    return s;
  }

  Future<void> _persist(Session s) async {
    _session = s;
    _api.setToken(s.accessToken);
    await _storage.write(
      key: _key,
      value: jsonEncode({
        'access_token': s.accessToken,
        'role': s.role,
        'name': s.name,
        'clinic_id': s.clinicId,
      }),
    );
    notifyListeners();
  }

  /// Clears the session locally.
  ///
  /// Deliberately tolerant of failure: if wiping the keystore entry throws, the
  /// in-memory session is still dropped and the token still cleared from the
  /// client, because the thing that matters is that this phone stops acting as
  /// the previous nurse.
  Future<void> signOut() async {
    _session = null;
    _api.setToken(null);
    notifyListeners();
    try {
      await _storage.delete(key: _key);
    } catch (_) {}
  }
}
