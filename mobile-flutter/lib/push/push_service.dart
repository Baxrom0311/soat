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

/// Android channel settings are fixed at creation. Changing them later has no
/// effect on phones where the channel already exists — the only way to raise
/// anything is a new channel id. So this starts where it needs to end up.
///
/// `audioAttributesUsage: alarm` is the important line. It routes the sound
/// through the alarm stream, which is the one stream Android still plays when
/// the phone is on silent or vibrate. A ward phone spends its shift in a pocket
/// on silent, and the nurse with the worst response times in production is the
/// one whose only channel was a device nobody was holding. A notification she
/// cannot hear is the same as no notification.
const AndroidNotificationChannel _callsChannel = AndroidNotificationChannel(
  callsChannelId,
  'Bemor chaqiruvlari',
  description: 'Palatadan kelgan chaqiruvlar',
  importance: Importance.max,
  playSound: true,
  enableVibration: true,
  audioAttributesUsage: AudioAttributesUsage.alarm,
);

/// Shared by the foreground and background paths so an alert looks and sounds
/// the same however it arrived.
///
/// `fullScreenIntent` is what turns a notification into something that wakes the
/// screen and shows over the lock screen, the way an incoming call does. It only
/// works for a notification this app posts itself, which is why the server sends
/// data-only messages: a `notification` payload is rendered by the system, and
/// the system does not know to do this.
NotificationDetails _callDetails() => NotificationDetails(
      android: AndroidNotificationDetails(
        _callsChannel.id,
        _callsChannel.name,
        channelDescription: _callsChannel.description,
        importance: Importance.max,
        priority: Priority.max,
        category: AndroidNotificationCategory.call,
        fullScreenIntent: true,
        audioAttributesUsage: AudioAttributesUsage.alarm,
        // Stays until the call is dealt with rather than being swiped away in a
        // pocket. The alert should end because somebody answered, not because a
        // phone brushed against a uniform.
        ongoing: true,
        autoCancel: false,
        visibility: NotificationVisibility.public,
      ),
    );

/// Runs in its own isolate when a message arrives and the app is not in the
/// foreground. Must be a top-level function — Android looks it up by name.
@pragma('vm:entry-point')
Future<void> handleBackgroundMessage(RemoteMessage message) async {
  final room = message.data['room_number'];
  final floor = message.data['floor'];
  if (room == null) return;

  final local = FlutterLocalNotificationsPlugin();
  await local.initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    ),
  );
  // Created again here on purpose: this isolate does not share state with the
  // one that ran init(), and posting to a channel that does not exist gets the
  // notification silently downgraded to default importance.
  await local
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(_callsChannel);

  await local.show(
    id: int.tryParse(message.data['call_id']?.toString() ?? '') ?? room.hashCode,
    title: 'Xona $room chaqirdi!',
    body: floor == null ? null : '$floor-qavat',
    notificationDetails: _callDetails(),
    payload: message.data['call_id']?.toString(),
  );
}

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

    FirebaseMessaging.onBackgroundMessage(handleBackgroundMessage);
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
    final room = m.data['room_number'];
    if (room == null) return;
    final floor = m.data['floor'];
    await _local.show(
      id: int.tryParse(m.data['call_id']?.toString() ?? '') ?? m.hashCode,
      title: 'Xona $room chaqirdi!',
      body: floor == null ? null : '$floor-qavat',
      notificationDetails: _callDetails(),
      payload: m.data['call_id']?.toString(),
    );
  }

  void _handleMessageTap(RemoteMessage m) =>
      _handlePayload(m.data['call_id']?.toString());

  void _handlePayload(String? raw) {
    final id = int.tryParse(raw ?? '');
    if (id != null) onCallTapped?.call(id);
  }

  /// Clears a call's notification once it has been answered. Without this an
  /// `ongoing` alert would sit on the lock screen after the nurse has already
  /// been to the room, and the next one would be easy to mistake for it.
  Future<void> clearCall(int callId) async {
    try {
      await _local.cancel(id: callId);
    } catch (_) {}
  }

  void dispose() {
    _refreshSub?.cancel();
    _foregroundSub?.cancel();
  }
}
