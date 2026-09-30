import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../api/client.dart';

/// Must match `android.notification.channel_id` in the backend's FCM payload.
///
/// If the two ever drift, Android does not fail: it quietly applies default
/// importance, and the alert arrives without sound or heads-up. Silent delivery
/// is the failure mode this product cannot afford, so the constant is named on
/// both sides and this comment is the pointer between them
/// (server/app/services/fcm_service.py).
const String callsChannelId = 'nursecall_calls';

/// Android channel importance is fixed at creation. Changing it later has no
/// effect on phones where the channel already exists — the only way to raise it
/// is a new channel id. Starting at max leaves nowhere to have to go.
const AndroidNotificationChannel _callsChannel = AndroidNotificationChannel(
  callsChannelId,
  'Bemor chaqiruvlari',
  description: 'Palatadan kelgan chaqiruvlar',
  importance: Importance.max,
  playSound: true,
  enableVibration: true,
);

/// Registers this phone for call notifications and keeps the server's copy of
/// its token current.
class PushService {
  PushService(this._api);

  final ApiClient _api;
  final _local = FlutterLocalNotificationsPlugin();

  String? _token;
  StreamSubscription<String>? _refreshSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;

  /// Called when the nurse taps a notification, with the call id it carried, so
  /// the app can open on that call rather than wherever it was left.
  void Function(int callId)? onCallTapped;

  bool _ready = false;

  /// True once a token has been handed to the server. Exposed so the UI can say
  /// "this phone will not ring" rather than letting a nurse assume it will.
  bool get registered => _token != null;

  Future<void> init() async {
    if (_ready) return;
    try {
      await Firebase.initializeApp();
    } catch (e) {
      // A missing or wrong google-services.json is a build-time mistake, not
      // something to crash a running ward over. The app still shows calls when
      // it is open; it just will not wake up.
      debugPrint('Firebase ishga tushmadi: $e');
      return;
    }

    await _local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
      onDidReceiveNotificationResponse: (r) => _handlePayload(r.payload),
    );
    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_callsChannel);

    // Android 13+ refuses to show anything without this, and refuses silently.
    await FirebaseMessaging.instance.requestPermission();
    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();

    _foregroundSub = FirebaseMessaging.onMessage.listen(_showForeground);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageTap);

    // The notification that launched a terminated app is delivered once, here,
    // and nowhere else.
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _handleMessageTap(initial);

    _ready = true;
  }

  /// Sends this phone's token to the server. Safe to call on every sign-in: the
  /// backend upserts, so a nurse signing in on a phone she has used before does
  /// not accumulate duplicate registrations.
  Future<void> register() async {
    if (!_ready) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await _api.registerPushToken(token);
      _token = token;

      // FCM rotates tokens on its own schedule. A rotation that is not reported
      // means this phone stops ringing, with nothing on screen to say so.
      _refreshSub?.cancel();
      _refreshSub = FirebaseMessaging.instance.onTokenRefresh.listen((t) async {
        try {
          await _api.registerPushToken(t);
          _token = t;
        } catch (_) {}
      });
    } catch (e) {
      debugPrint('Push tokenini ro\'yxatdan o\'tkazib bo\'lmadi: $e');
    }
  }

  /// Removes this phone's registration on sign-out.
  ///
  /// Matters more here than in most apps: these are shared ward phones, and a
  /// token left behind means the next nurse's calls keep waking the previous
  /// one's session — or the phone rings for a clinic it no longer belongs to.
  Future<void> unregister() async {
    final token = _token;
    _refreshSub?.cancel();
    _refreshSub = null;
    _token = null;
    if (token == null) return;
    try {
      await _api.unregisterPushToken(token);
    } catch (_) {}
  }

  /// Android does not display FCM notifications while the app is in the
  /// foreground, so it is posted by hand. Without this, a nurse looking at
  /// another screen in this same app would get nothing at all.
  Future<void> _showForeground(RemoteMessage m) async {
    final n = m.notification;
    if (n == null) return;
    await _local.show(
      id: m.hashCode,
      title: n.title,
      body: n.body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _callsChannel.id,
          _callsChannel.name,
          channelDescription: _callsChannel.description,
          importance: Importance.max,
          priority: Priority.high,
          category: AndroidNotificationCategory.call,
        ),
      ),
      payload: m.data['call_id']?.toString(),
    );
  }

  void _handleMessageTap(RemoteMessage m) =>
      _handlePayload(m.data['call_id']?.toString());

  void _handlePayload(String? raw) {
    final id = int.tryParse(raw ?? '');
    if (id != null) onCallTapped?.call(id);
  }

  void dispose() {
    _refreshSub?.cancel();
    _foregroundSub?.cancel();
  }
}
