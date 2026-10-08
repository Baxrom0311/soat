import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api/client.dart';
import 'auth/welcome_screen.dart';
import 'auth/session_store.dart';
import 'calls/calls_feed.dart';
import 'calls/alarm_service.dart';
import 'calls/calls_screen.dart';
import 'desktop/desktop.dart';
import 'desktop/desktop_alarm.dart';
import 'desktop/desktop_window.dart';
import 'settings/settings_store.dart';
import 'wear/wear_service.dart';
import 'push/push_service.dart';
import 'splash/video_splash_screen.dart';
import 'theme/app_icons.dart';
import 'theme/tokens.dart';

/// Lets the Windows close button show its dialog over whatever screen is open.
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (isDesktop) {
    await DesktopWindow(navigatorKey).init();
    final alarm = DesktopAlarm();
    await alarm.init();
    AlarmService.instance.backend = alarm;
    desktopAlarm = alarm;
  }
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
  String? _watchToken;
  Timer? _watchRetry;
  bool _splashDone = false;

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
      onSnapshot: _push.reconcile,
    );
    _sessions.beforeSignOut = () async {
      _watchToken = null;
      _feed.reset();
      await Future.wait([_push.unregister(), _wear.signOutWatch()]);
    };
    _watchRetry = Timer.periodic(const Duration(minutes: 1), (_) {
      if (isDesktop) return;
      final token = _sessions.session?.accessToken;
      if (token != null && !_wear.state.tokenSent) _wear.sendToken(token);
    });
    _push.onCallTapped = (_) => _feed.refresh();
    _sessions.addListener(_onSession);
    _sessions.restore().then((_) {
      if (_sessions.isSignedIn && !_feed.isRunning) {
        _feed.start(token: _sessions.session?.accessToken);
      }
    });
  }

  @override
  void dispose() {
    _sessions.removeListener(_onSession);
    _settings.removeListener(_onSession);
    _watchRetry?.cancel();
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
    final token = _sessions.session?.accessToken;
    if (token != _watchToken) {
      _watchToken = token;
      if (token != null && !isDesktop) _wear.sendToken(token);
    }
    if (token != null && !_feed.isRunning) {
      _feed.start(token: token);
    }
    // No push on Windows: the desk build hears calls over the live socket and
    // rings itself, so there is no Firebase token to register.
    _push.setWanted(
      !isDesktop && token != null && _settings.loaded && _settings.pushEnabled,
    );
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
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
      home: !_splashDone
          ? VideoSplashScreen(
              onFinished: () {
                if (mounted) setState(() => _splashDone = true);
              },
            )
          : !_sessions.restored
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
          : WelcomeScreen(sessions: _sessions),
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
    body: Center(child: AppLogo(size: 64, withGlow: true)),
  );
}
