// Design-verification entry point. Not shipped.
//
// Renders the REAL CallsScreen against a fake server, so a screenshot verifies
// the code that actually ships rather than a copy of it. An earlier version of
// this file rebuilt the header and cards by hand; a preview that can drift from
// the screen it is meant to check is worth very little.
//
//   flutter build web --target lib/main_preview.dart --release
//
// Time is frozen so the waiting counters render identically on every run and two
// screenshots can be compared meaningfully.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'api/client.dart';
import 'auth/session_store.dart';
import 'calls/calls_feed.dart';
import 'calls/calls_screen.dart';
import 'push/push_service.dart';
import 'settings/settings_store.dart';
import 'theme/tokens.dart';

/// The instant the fixtures are dated against: 23:08, 4:15 and 0:42 of waiting.
final _now = DateTime.now().toUtc();

String _iso(Duration ago) => _now.subtract(ago).toIso8601String();

final _fixtures = <String, Object>{
  '/api/v1/auth/login': {
    'access_token': 'preview',
    'role': 'nurse',
    'name': 'Nigora Saidova',
    'clinic_id': 1,
  },
  '/api/v1/clinic/me': {
    'id': 1,
    'name': 'Markaziy Klinika',
    'subscription_status': 'active',
    'effective_status': 'active',
    'created_at': '2026-01-01T00:00:00Z',
  },
  '/api/v1/clinic/billing-notice': {
    'warn': true,
    'blocked': false,
    'days_left': 5,
  },
};

final _calls = [
  {
    'call_id': 1,
    'room_number': '204',
    'floor': 2,
    'created_at': _iso(const Duration(minutes: 23, seconds: 8)),
    'status': 'active',
  },
  {
    'call_id': 2,
    'room_number': '118',
    'floor': 1,
    'created_at': _iso(const Duration(minutes: 4, seconds: 15)),
    'status': 'active',
  },
  {
    'call_id': 3,
    'room_number': '307',
    'floor': 1,
    'created_at': _iso(const Duration(seconds: 42)),
    'status': 'active',
  },
];

/// Enough answered calls, all today, for the statistics strip to read 1m 15s
/// and 28 — the figures the design shows.
List<Map<String, Object?>> _history() {
  final rows = <Map<String, Object?>>[];
  for (var i = 0; i < 28; i++) {
    final created = _now.subtract(Duration(minutes: 40 + i));
    rows.add({
      'call_id': 100 + i,
      'room_number': '1${i.toString().padLeft(2, '0')}',
      'floor': 1,
      'status': 'acknowledged',
      'created_at': created.toIso8601String(),
      'acknowledged_at': created
          .add(const Duration(seconds: 75))
          .toIso8601String(),
      'acknowledged_by': 'Nigora Saidova',
    });
  }
  return rows;
}

http.Client _fakeServer() => MockClient((req) async {
  final path = req.url.path;
  if (path.startsWith('/api/v1/calls/history')) {
    return http.Response(
      jsonEncode(_history()),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  }
  if (path == '/api/v1/calls/active') {
    return http.Response(
      jsonEncode(_calls),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  }
  final body = _fixtures[path];
  if (body != null) {
    return http.Response(
      jsonEncode(body),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  }
  return http.Response('{"detail":"preview"}', 404);
});

void main() => runApp(const PreviewApp());

class PreviewApp extends StatefulWidget {
  const PreviewApp({super.key});

  @override
  State<PreviewApp> createState() => _PreviewAppState();
}

class _PreviewAppState extends State<PreviewApp> {
  late final ApiClient _api;
  late final SessionStore _sessions;
  late final CallsFeed _feed;
  late final SettingsStore _settings;
  late final PushService _push;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _api = ApiClient(httpClient: _fakeServer());
    _sessions = SessionStore(_api);
    _feed = CallsFeed(_api, onUnauthorized: () {});
    _settings = SettingsStore()..addListener(() => setState(() {}));
    _settings.load();
    _push = PushService(_api);
    _signIn();
  }

  Future<void> _signIn() async {
    try {
      await _sessions.signIn('preview@nursecall.uz', 'preview');
    } catch (_) {
      // Browser keystores can refuse to write; the session is still held in
      // memory, which is all a screenshot needs.
    }
    if (mounted) setState(() => _ready = true);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    // Mirrors main.dart exactly. The preview showed both schemes as dark
    // until this line was fixed, which is the drift this file is supposed to
    // be immune to -- worth keeping the two in step by hand until there is a
    // reason to share one builder.
    theme: T.theme(Brightness.light),
    darkTheme: T.theme(Brightness.dark),
    themeMode: _settings.themeMode,
    home: _ready
        ? CallsScreen(
            feed: _feed,
            sessions: _sessions,
            settings: _settings,
            push: _push,
            api: _api,
          )
        : const ColoredBox(color: T.page),
  );
}
