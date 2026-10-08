import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../api/client.dart';
import '../settings/settings_store.dart';

/// Must match CallChannel.ID in android/.../CallAlarm.kt, which creates the
/// same channel natively at startup. Whichever side runs first wins, so the two
/// definitions must agree.
///
/// v2 because a channel's sound is frozen at creation: the first channel used
/// the system default sound, and existing installs only get the new default
/// chime under a new id. The old channel is deleted on init.
const String callsChannelId = 'nursecall_calls_v2';
const String _legacyCallsChannelId = 'nursecall_calls';

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
  // The default: a chime, not the system alarm ringtone. The nurse picks any
  // other sound in Android's settings for this channel, and the in-app alarm
  // (CallAlarmService) plays the same choice.
  sound: RawResourceAndroidNotificationSound('nursecall_chime'),
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
///
/// [silent] is for a notification posted while the app is open: the alarm
/// service is already ringing for that call, and a second sound on top of it
/// would only be noise.
NotificationDetails _callDetails({bool silent = false}) => NotificationDetails(
  android: AndroidNotificationDetails(
    _callsChannel.id,
    _callsChannel.name,
    channelDescription: _callsChannel.description,
    importance: Importance.max,
    priority: Priority.max,
    category: AndroidNotificationCategory.alarm,
    audioAttributesUsage: AudioAttributesUsage.alarm,
    silent: silent,
    // Flag 4 = Notification.FLAG_INSISTENT: loops sound & vibration continuously like an alarm clock
    additionalFlags: silent ? null : Int32List.fromList(<int>[4]),
    // Stays until the call is dealt with rather than being swiped away in a
    // pocket. The alert should end because somebody answered, not because a
    // phone brushed against a uniform.
    ongoing: true,
    autoCancel: false,
    visibility: NotificationVisibility.public,
  ),
);

/// Reject delayed notifications for a signed-out or different nurse, even offline.
Future<bool> _belongsToSession(Map<String, dynamic> data) async {
  try {
    const storage = FlutterSecureStorage();
    if (await storage.read(key: 'nursecall.push') == 'off') return false;
    final raw = await storage.read(key: 'nursecall.session');
    if (raw == null) return false;
    final session = jsonDecode(raw) as Map<String, dynamic>;
    if (data['clinic_id'] != null &&
        data['clinic_id'].toString() != session['clinic_id'].toString()) {
      return false;
    }
    final token = session['access_token'] as String;
    final claims =
        jsonDecode(
              utf8.decode(
                base64Url.decode(base64Url.normalize(token.split('.')[1])),
              ),
            )
            as Map;
    if (data['staff_id'] != null &&
        data['staff_id'].toString() != claims['sub'].toString()) {
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

/// Must match SERVICE_CHANNEL_ID in CallAlarm.kt.
const String alarmServiceChannelId = 'nursecall_alarm_service';

/// Whether CallAlarmService is ringing right now, read from the notification
/// it must show while it does.
///
/// The background isolate has no line to the activity's method channel, but it
/// can list this app's notifications, and the service's own sits there exactly
/// while it rings. With the service already ringing, an insistent push on top
/// of it made two alarms sound at once; the service picks the new call up from
/// the feed, so the push only needs to appear, not to ring.
Future<bool> alarmServiceRinging(FlutterLocalNotificationsPlugin local) async {
  try {
    final active =
        await local
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >()
            ?.getActiveNotifications() ??
        const <ActiveNotification>[];
    return active.any((n) => n.channelId == alarmServiceChannelId);
  } catch (_) {
    return false; // when unsure, ring: a duplicate sound beats a silent call
  }
}

/// Runs in its own isolate when a message arrives and the app is not in the
/// foreground. Must be a top-level function — Android looks it up by name.
@pragma('vm:entry-point')
Future<void> handleBackgroundMessage(RemoteMessage message) async {
  if (!await _belongsToSession(message.data)) return;
  final room = message.data['room_number'];
  final floor = message.data['floor'];

  final local = FlutterLocalNotificationsPlugin();
  await local.initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings('@drawable/ic_notification'),
    ),
  );
  // Created again here on purpose: this isolate does not share state with the
  // one that ran init(), and posting to a channel that does not exist gets the
  // notification silently downgraded to default importance.
  await local
      .resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin
      >()
      ?.createNotificationChannel(_callsChannel);

  if (message.data['type'] == 'ack') {
    final id = int.tryParse(message.data['call_id'] ?? '');
    if (id != null) await local.cancel(id: id);
    return;
  }
  if (room == null) return;
  await local.show(
    id:
        int.tryParse(message.data['call_id']?.toString() ?? '') ??
        room.hashCode,
    title: message.data['title'] ?? 'Xona $room chaqirdi!',
    body: message.data['body'] ?? (floor == null ? null : '$floor-qavat'),
    notificationDetails: _callDetails(silent: await alarmServiceRinging(local)),
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
  bool _wanted = false;
  int _generation = 0;
  Timer? _retry;
  Future<void>? _registration;
  Future<void>? _initializing;
  StreamSubscription<RemoteMessage>? _openedSub;

  /// True once a token has been handed to the server. Exposed so the UI can say
  /// "this phone will not ring" rather than letting a nurse assume it will.
  bool get registered => _token != null;

  Future<void> init() =>
      _initializing ??= _init().whenComplete(() => _initializing = null);

  Future<void> _init() async {
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
        android: AndroidInitializationSettings('@drawable/ic_notification'),
      ),
      onDidReceiveNotificationResponse: (r) => _handlePayload(r.payload),
    );
    final android = _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await android?.createNotificationChannel(_callsChannel);
    try {
      await android?.deleteNotificationChannel(
        channelId: _legacyCallsChannelId,
      );
    } catch (_) {}

    // Android 13+ refuses to show anything without this, and refuses silently.
    await FirebaseMessaging.instance.requestPermission();
    await _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.requestNotificationsPermission();

    FirebaseMessaging.onBackgroundMessage(handleBackgroundMessage);
    _foregroundSub = FirebaseMessaging.onMessage.listen(_showForeground);
    _openedSub = FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageTap);

    // The notification that launched a terminated app is delivered once, here,
    // and nowhere else.
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _handleMessageTap(initial);

    _ready = true;
  }

  /// Sends this phone's token to the server. Safe to call on every sign-in: the
  /// backend upserts, so a nurse signing in on a phone she has used before does
  /// not accumulate duplicate registrations.
  void setWanted(bool wanted) {
    if (_wanted == wanted) return;
    _wanted = wanted;
    ++_generation;
    _retry?.cancel();
    if (wanted) {
      _retry = Timer.periodic(const Duration(minutes: 1), (_) => _register());
      _register();
    } else {
      unregister();
    }
  }

  Future<void> register() {
    setWanted(true);
    return _register();
  }

  Future<void> _register() {
    if (!_wanted || _token != null) return Future.value();
    return _registration ??= _registerOnce().whenComplete(
      () => _registration = null,
    );
  }

  Future<void> _registerOnce() async {
    final generation = _generation;
    final credential = _api.accessToken;
    if (credential == null) return;
    try {
      await init();
      if (!_ready || !_wanted || generation != _generation) return;
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null || !_wanted || generation != _generation) return;
      await _api.registerPushToken(token);
      if (!_wanted || generation != _generation) {
        await _api.unregisterPushToken(token, accessToken: credential);
        return;
      }
      _token = token;
      await _refreshSub?.cancel();
      _refreshSub = FirebaseMessaging.instance.onTokenRefresh.listen((_) {
        _token = null;
        _register();
      });
    } catch (e) {
      debugPrint('Push ro‘yxati yangilanmadi: $e');
      // A timer retries while this session still wants notifications.
    }
  }

  Future<void> unregister() async {
    _wanted = false;
    ++_generation;
    _retry?.cancel();
    _retry = null;
    await _refreshSub?.cancel();
    _refreshSub = null;
    await _registration;
    final token = _token;
    _token = null;
    if (token != null) {
      try {
        await _api.unregisterPushToken(token);
      } catch (_) {
        // Retire the FCM address as well if the API is unavailable.
        try {
          await FirebaseMessaging.instance.deleteToken();
        } catch (_) {}
      }
    }
    try {
      await _local.cancelAll();
    } catch (_) {}
  }

  Future<void> reconcile(Set<int> activeIds) async {
    if (!_ready || !_wanted) return;
    try {
      for (final notification in await _local.getActiveNotifications()) {
        final id = notification.id;
        if (id != null && !activeIds.contains(id)) await _local.cancel(id: id);
      }
    } catch (_) {}
  }

  /// Android does not display FCM notifications while the app is in the
  /// foreground, so it is posted by hand. Without this, a nurse looking at
  /// another screen in this same app would get nothing at all.
  Future<void> _showForeground(RemoteMessage m) async {
    if (!_wanted || !await _belongsToSession(m.data)) return;
    if (m.data['type'] == 'ack') {
      final id = int.tryParse(m.data['call_id'] ?? '');
      if (id != null) await clearCall(id);
      return;
    }
    final room = m.data['room_number'];
    if (room == null) return;
    final floor = m.data['floor'];
    await _local.show(
      id: int.tryParse(m.data['call_id']?.toString() ?? '') ?? m.hashCode,
      title: m.data['title'] ?? 'Xona $room chaqirdi!',
      body: m.data['body'] ?? (floor == null ? null : '$floor-qavat'),
      notificationDetails: _callDetails(silent: true),
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

  static const _platform = MethodChannel('uz.boos.nursecall/settings');

  /// Asks Android what it will actually do with an alert on this handset.
  ///
  /// Not what the app configured -- what the system reports now. The channel is
  /// the user's once created, and Do Not Disturb silences even an alarm channel
  /// unless this app has been let through. A nurse who believes the phone will
  /// ring when it will not is worse off than one who knows it will not.
  Future<NotificationState> notificationState() async {
    try {
      final m = await _platform.invokeMapMethod<String, dynamic>(
        'notificationState',
      );
      return m == null
          ? NotificationState.unknown
          : NotificationState.fromMap(m);
    } catch (_) {
      return NotificationState.unknown;
    }
  }

  /// Opens the system screen where the call channel's sound and importance live.
  Future<void> openSystemSettings() async {
    try {
      await _platform.invokeMethod('openChannelSettings', {
        'channelId': callsChannelId,
      });
    } catch (_) {}
  }

  void dispose() {
    _wanted = false;
    ++_generation;
    _retry?.cancel();
    _openedSub?.cancel();
    _refreshSub?.cancel();
    _foregroundSub?.cancel();
  }
}
