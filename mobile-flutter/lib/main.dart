import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api/client.dart';
import 'auth/login_screen.dart';
import 'auth/session_store.dart';
import 'calls/calls_feed.dart';
import 'calls/calls_screen.dart';
import 'settings/settings_store.dart';
import 'wear/wear_service.dart';
import 'push/push_service.dart';
import 'theme/tokens.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(statusBarColor: Colors.transparent),
  );
  runApp(const NurseCallApp());
}

class NurseCallApp extends StatefulWidget {
  const NurseCallApp({super.key});

  @override
  State<NurseCallApp> createState() => _NurseCallAppState();
}

class _NurseCallAppState extends State<NurseCallApp> {
  late final ApiClient _api;
  late final SessionStore _sessions;
  late final CallsFeed _feed;
  late final PushService _push;
  late final SettingsStore _settings;
  late final WearService _wear;
  bool _pushWanted = false;

  @override
  void initState() {
    super.initState();
    _api = ApiClient();
    _sessions = SessionStore(_api);
    // Signing out on a 401 lives here rather than in the feed so there is one
    // owner of "who is signed in". The feed reports the fact; it does not decide
    // what to do about it.
    _settings = SettingsStore()..addListener(_onSession);
    _settings.load();
    _push = PushService(_api);
    _wear = WearService();
    _feed = CallsFeed(
      _api,
      onUnauthorized: _sessions.signOut,
      onAcknowledged: _push.clearCall,
    );
    _push.onCallTapped = (_) => _feed.refresh();
    _sessions.addListener(_onSession);
    _sessions.restore();
  }

  @override
  void dispose() {
    _sessions.removeListener(_onSession);
    _settings.removeListener(_onSession);
    _push.dispose();
    _feed.dispose();
    _api.close();
    super.dispose();
  }

  /// Push registration follows the session, in both directions.
  ///
  /// Registering only after sign-in is what keeps a token from being attached to
  /// the wrong clinic; dropping it on sign-out is what stops a shared ward phone
  /// ringing for the nurse who used it before. Both run without awaiting, so a
  /// slow network never delays the screen the nurse is waiting for.
  void _onSession() {
    final signedIn = _sessions.isSignedIn;
    if (signedIn && !_pushWanted) {
      _pushWanted = true;
      // Hand the session to the ward watch, if one is paired. Without awaiting:
      // a watch asleep in a drawer must never delay the screen a nurse is
      // waiting for, and a failure here is reported on the profile screen
      // rather than thrown at somebody mid-shift.
      final token = _sessions.session?.accessToken;
      if (token != null) _wear.sendToken(token);
      // Honours the nurse's own switch: a phone she has silenced for her shift
      // must not quietly re-register itself on the next sign-in.
      _push.init().then((_) {
        if (_settings.pushEnabled) _push.register();
      });
    } else if (!signedIn && _pushWanted) {
      _pushWanted = false;
      _push.unregister();
      // And sign the watch out with her. A ward watch left holding the previous
      // nurse's session keeps answering calls in her name, which is exactly how
      // one clinic's entire history ended up attributed to one account.
      _wear.signOutWatch();
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NurseCall',
      debugShowCheckedModeBanner: false,
      theme: T.theme(Brightness.light),
      darkTheme: T.theme(Brightness.dark),
      // Follows the handset rather than adding a switch. These are shared ward
      // phones; a per-app preference is one more thing two nurses can disagree
      // about, and the phone's own auto mode already turns dark at night, which
      // is exactly the behaviour wanted.
      // The nurse's choice when she has made one, the handset's otherwise.
      themeMode: _settings.themeMode,
      // The device's font scale is honoured up to a point and no further. A
      // nurse who has set her phone to the largest text should get larger text;
      // at 2x, the room number stops fitting and the card is worse than useless.
      builder: (context, child) {
        final scale = MediaQuery.textScalerOf(
          context,
        ).clamp(minScaleFactor: 0.9, maxScaleFactor: 1.3);
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: scale),
          child: child!,
        );
      },
      home: !_sessions.restored
          ? const _Splash()
          : _sessions.isSignedIn
          ? CallsScreen(
              feed: _feed,
              sessions: _sessions,
              settings: _settings,
              push: _push,
              api: _api,
              wear: _wear,
            )
          : LoginScreen(sessions: _sessions),
    );
  }
}

/// Shown only while the stored session is being read — a few frames. It exists
/// so a signed-in nurse never sees the login form flash past on a cold start,
/// which reads as "it logged me out again".
class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => const Scaffold(
    backgroundColor: T.page,
    body: Center(
      child: Icon(Icons.notifications_active, size: 52, color: T.step1),
    ),
  );
}
