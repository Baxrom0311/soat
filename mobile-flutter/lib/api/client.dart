import 'dart:convert';
import 'package:http/http.dart' as http;

import 'models.dart';

/// Hardcoded rather than configurable. The app is installed by the vendor onto
/// clinic phones; a settings field for the server address is one more thing that
/// can be typed wrong on a device nobody will debug in person.
const String baseUrl = 'https://nurcecall.boos.uz';

/// Short on purpose. This app's job is to tell a nurse that somebody is waiting;
/// a request still hanging after ten seconds has already failed at that, and the
/// caller needs to fall back rather than sit on it.
const Duration _timeout = Duration(seconds: 10);

class ApiClient {
  ApiClient({http.Client? httpClient}) : _http = httpClient ?? http.Client();

  final http.Client _http;
  String? _token;

  /// Called by the session store on login, restore and logout (with null).
  void setToken(String? token) => _token = token;

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Map<String, String> _headers({bool auth = true, bool json = false}) => {
    if (json) 'Content-Type': 'application/json',
    'Accept': 'application/json',
    if (auth && _token != null) 'Authorization': 'Bearer $_token',
  };

  /// Maps the backend's `{"detail": "..."}` error shape onto [ApiException].
  /// Anything that is not 2xx throws, so no caller can accidentally treat an
  /// error body as data.
  dynamic _decode(http.Response r) {
    final body = r.body.isEmpty ? null : jsonDecode(utf8.decode(r.bodyBytes));
    if (r.statusCode >= 200 && r.statusCode < 300) return body;
    final detail = body is Map && body['detail'] is String
        ? body['detail'] as String
        : 'Server xatosi (${r.statusCode})';
    throw ApiException(r.statusCode, detail);
  }

  Future<Session> login(String email, String password) async {
    final r = await _http
        .post(
          _uri('/api/v1/auth/login'),
          headers: _headers(auth: false, json: true),
          body: jsonEncode({
            // Trimmed and lowercased here rather than trusting the keyboard: a
            // capitalised first letter is what an Android keyboard does by
            // default, and it would otherwise read as a wrong password.
            'email': email.trim().toLowerCase(),
            'password': password,
          }),
        )
        .timeout(_timeout);
    return Session.fromJson(_decode(r) as Map<String, dynamic>);
  }

  Future<Session> refresh() async {
    final r = await _http
        .post(_uri('/api/v1/auth/refresh'), headers: _headers())
        .timeout(_timeout);
    return Session.fromJson(_decode(r) as Map<String, dynamic>);
  }

  Future<List<Call>> activeCalls() async {
    final r = await _http
        .get(_uri('/api/v1/calls/active'), headers: _headers())
        .timeout(_timeout);
    final list = _decode(r) as List<dynamic>;
    return list
        .map((e) => Call.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
  }

  /// Acknowledge a call.
  ///
  /// Sends no `acknowledged_by`: the server falls back to the authenticated
  /// user's own name, which is the one attribution a client cannot get wrong or
  /// fake. The old app sent its stored email, which is why history rows read
  /// `hamshira1@profmedmax.uz` instead of a person's name.
  ///
  /// A 409 means another nurse answered first. That is a normal race on a ward,
  /// not a failure, and the caller treats it as success.
  Future<void> acknowledge(int callId) async {
    final r = await _http
        .post(
          _uri('/api/v1/calls/$callId/ack'),
          headers: _headers(json: true),
          body: jsonEncode(const <String, dynamic>{}),
        )
        .timeout(_timeout);
    try {
      _decode(r);
    } on ApiException catch (e) {
      if (e.isAlreadyAcknowledged) return;
      rethrow;
    }
  }

  /// Recent calls on the floors this nurse covers. Billing-gated, so a blocked
  /// clinic simply loses the statistics strip -- which is management data, and
  /// exactly the sort of thing that should stop before an alert ever does.
  Future<List<HistoryCall>> history({int limit = 200}) async {
    final r = await _http
        .get(_uri('/api/v1/calls/history?limit=$limit'), headers: _headers())
        .timeout(_timeout);
    final list = _decode(r) as List<dynamic>;
    return list
        .map((e) => HistoryCall.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
  }

  /// Ungated, like the billing notice: a blocked clinic still has a name and
  /// still has patients in it.
  Future<Clinic> clinic() async {
    final r = await _http
        .get(_uri('/api/v1/clinic/me'), headers: _headers())
        .timeout(_timeout);
    return Clinic.fromJson(_decode(r) as Map<String, dynamic>);
  }

  Future<BillingNotice> billingNotice() async {
    final r = await _http
        .get(_uri('/api/v1/clinic/billing-notice'), headers: _headers())
        .timeout(_timeout);
    return BillingNotice.fromJson(_decode(r) as Map<String, dynamic>);
  }

  Future<VersionInfo> versionInfo() async {
    final r = await _http
        .get(_uri('/api/v1/meta/version'), headers: _headers(auth: false))
        .timeout(_timeout);
    return VersionInfo.fromJson(_decode(r) as Map<String, dynamic>);
  }

  /// The field is still called `expo_push_token` on the wire. The backend tells
  /// an Expo token from an FCM one by its shape, so both app generations can be
  /// served while clinics migrate; renaming the field would break the app that
  /// is in production today.
  Future<void> registerPushToken(String token) async {
    final r = await _http
        .post(
          _uri('/api/v1/push-tokens'),
          headers: _headers(json: true),
          body: jsonEncode({'expo_push_token': token}),
        )
        .timeout(_timeout);
    _decode(r);
  }

  Future<void> unregisterPushToken(String token) async {
    final r = await _http
        .delete(
          _uri('/api/v1/push-tokens'),
          headers: _headers(json: true),
          body: jsonEncode({'expo_push_token': token}),
        )
        .timeout(_timeout);
    _decode(r);
  }

  void close() => _http.close();
}
