/// Wire types, mirroring the backend's schemas exactly.
///
/// Deliberately narrow: these carry what the server actually knows about a call
/// — room, floor, when it started — and nothing else. Earlier design drafts
/// showed patient names, departments and urgency tiers; none of that exists in
/// the database and a screen that invents it teaches nurses to trust a fiction.
library;

class Session {
  const Session({
    required this.accessToken,
    required this.role,
    required this.name,
    this.clinicId,
  });

  final String accessToken;
  final String role;
  final String name;
  final int? clinicId;

  bool get isNurse => role == 'nurse';
  bool get isAdmin => role == 'admin';
  bool get isGuest => accessToken == 'demo_guest_token';

  factory Session.fromJson(Map<String, dynamic> j) => Session(
    accessToken: j['access_token'] as String,
    role: j['role'] as String,
    name: (j['name'] as String?) ?? '',
    clinicId: j['clinic_id'] as int?,
  );
}

class Call {
  const Call({
    required this.callId,
    required this.roomNumber,
    required this.floor,
    required this.createdAt,
    required this.status,
  });

  final int callId;
  final String roomNumber;
  final int floor;
  final DateTime createdAt;
  final String status;

  /// How long this call has been waiting, as of [now].
  ///
  /// Computed from the server's timestamp rather than tracked locally: a phone
  /// that was asleep, or that has a skewed clock, must not report a fresh call
  /// as old or an old one as fresh. `createdAt` is parsed as UTC and compared
  /// against UTC for the same reason.
  Duration waited(DateTime now) => now.toUtc().difference(createdAt.toUtc());

  factory Call.fromJson(Map<String, dynamic> j) => Call(
    callId: j['call_id'] as int,
    roomNumber: j['room_number'] as String,
    floor: j['floor'] as int,
    createdAt: DateTime.parse(j['created_at'] as String),
    status: j['status'] as String,
  );
}

/// The clinic this phone belongs to. Fetched so the header can name it, the
/// way the design does — a nurse who works across two sites should be able to
/// tell at a glance which one this handset is signed in to.
class Clinic {
  const Clinic({required this.name});
  final String name;
  factory Clinic.fromJson(Map<String, dynamic> j) =>
      Clinic(name: (j['name'] as String?) ?? '');
}

/// A past call, as the history endpoint returns it.
class HistoryCall {
  const HistoryCall({
    required this.callId,
    required this.roomNumber,
    required this.floor,
    required this.status,
    required this.createdAt,
    this.acknowledgedAt,
    this.acknowledgedBy,
  });

  final int callId;
  final String roomNumber;
  final int floor;

  /// 'active', 'acknowledged' or 'expired'. Kept as the server's own string
  /// rather than an enum: a value this client has not heard of must render as
  /// itself, not crash the list or silently become one of the others.
  final String status;

  final DateTime createdAt;
  final DateTime? acknowledgedAt;

  /// The name of whoever answered, as the server attributed it. Null for a call
  /// that was never answered.
  final String? acknowledgedBy;

  Duration? get answeredIn =>
      acknowledgedAt?.toUtc().difference(createdAt.toUtc());

  /// Closed by the clock after half a day, because nobody ever acknowledged it.
  /// Distinct from answered on purpose -- the history must never claim somebody
  /// went when nobody did.
  bool get expired => status == 'expired';

  bool get answered => acknowledgedAt != null;

  factory HistoryCall.fromJson(Map<String, dynamic> j) => HistoryCall(
    callId: j['call_id'] as int,
    roomNumber: j['room_number'] as String? ?? '',
    floor: j['floor'] as int? ?? 0,
    status: j['status'] as String? ?? 'acknowledged',
    createdAt: DateTime.parse(j['created_at'] as String),
    acknowledgedAt: j['acknowledged_at'] == null
        ? null
        : DateTime.parse(j['acknowledged_at'] as String),
    acknowledgedBy: j['acknowledged_by'] as String?,
  );
}

/// What the clinic's subscription banner says. Readable by every clinic member,
/// including nurses, and never gated — a clinic that has stopped paying still
/// has patients in it.
class BillingNotice {
  const BillingNotice({
    required this.warn,
    required this.blocked,
    this.daysLeft,
  });

  final bool warn;
  final bool blocked;
  final int? daysLeft;

  factory BillingNotice.fromJson(Map<String, dynamic> j) => BillingNotice(
    warn: j['warn'] as bool? ?? false,
    blocked: j['blocked'] as bool? ?? false,
    daysLeft: j['days_left'] as int?,
  );
}

class VersionInfo {
  const VersionInfo({required this.minMobileVersion});

  final int minMobileVersion;

  factory VersionInfo.fromJson(Map<String, dynamic> j) =>
      VersionInfo(minMobileVersion: j['min_mobile_version'] as int? ?? 1);
}

/// Raised for any non-2xx response. [status] is kept so callers can tell the
/// cases apart that actually need different handling: 401 means the session is
/// gone and the nurse has to sign in again, 409 means somebody else answered
/// this call first, which is a normal outcome rather than an error.
class ApiException implements Exception {
  const ApiException(this.status, this.message);

  final int status;
  final String message;

  bool get isUnauthorized => status == 401;
  bool get isAlreadyAcknowledged => status == 409;

  @override
  String toString() => 'ApiException($status): $message';
}

// ---------------------------------------------------------------- management
//
// Everything below is for the clinic admin's half of the app. A nurse never
// sees any of it: the routes are admin-only on the server, and the screens that
// use these are only reachable when the signed-in session says so.

/// A 433MHz receiver — the box on the wall that hears the buttons.
class Device {
  const Device({
    required this.id,
    required this.deviceId,
    required this.floor,
    required this.online,
    this.lastSeenAt,
  });

  final int id;

  /// The name the receiver identifies itself by, as configured on the ESP32.
  final String deviceId;

  final int floor;

  /// The server's own judgement, not something computed here: it knows the
  /// heartbeat window and this app must not disagree with the alert that is
  /// already being sent when a receiver goes quiet.
  final bool online;

  final DateTime? lastSeenAt;

  /// Registered but never heard from once — a setup mistake, not an outage, and
  /// worth saying differently.
  bool get neverSeen => lastSeenAt == null;

  factory Device.fromJson(Map<String, dynamic> j) => Device(
    id: j['id'] as int,
    deviceId: j['device_id'] as String,
    floor: j['floor'] as int,
    online: j['online'] as bool? ?? false,
    lastSeenAt: j['last_seen_at'] == null
        ? null
        : DateTime.parse(j['last_seen_at'] as String),
  );
}

class Room {
  const Room({required this.id, required this.roomNumber, required this.floor});

  final int id;
  final String roomNumber;
  final int floor;

  factory Room.fromJson(Map<String, dynamic> j) => Room(
    id: j['id'] as int,
    roomNumber: j['room_number'] as String,
    floor: j['floor'] as int,
  );
}

class Staff {
  const Staff({
    required this.id,
    required this.email,
    required this.role,
    required this.name,
    required this.floors,
  });

  final int id;
  final String email;
  final String role;
  final String name;

  /// Empty means every floor. That is the server's safe default: a nurse who
  /// has not been assigned anywhere must keep receiving everything, never
  /// nothing.
  final List<int> floors;

  bool get isAdmin => role == 'admin';
  bool get allFloors => floors.isEmpty;

  factory Staff.fromJson(Map<String, dynamic> j) => Staff(
    id: j['id'] as int,
    email: j['email'] as String,
    role: j['role'] as String,
    name: (j['name'] as String?) ?? '',
    floors: ((j['floors'] as List<dynamic>?) ?? const [])
        .map((e) => e as int)
        .toList(growable: false),
  );
}

/// A button already paired to a room.
class ButtonPairing {
  const ButtonPairing({
    required this.id,
    required this.roomId,
    required this.roomNumber,
    required this.floor,
    required this.code,
  });

  final int id;
  final int roomId;
  final String roomNumber;
  final int floor;
  final int code;

  factory ButtonPairing.fromJson(Map<String, dynamic> j) => ButtonPairing(
    id: j['id'] as int,
    roomId: j['room_id'] as int,
    roomNumber: j['room_number'] as String,
    floor: j['floor'] as int,
    code: j['ev1527_code'] as int,
  );
}

/// A button press from a transmitter nobody has paired to a room yet.
///
/// This is the installation workflow, seen from the server's side: press a new
/// button, and the code it sent turns up here. Pairing it to a room is what
/// turns it into a working call button.
class UnassignedSignal {
  const UnassignedSignal({
    required this.id,
    required this.deviceId,
    required this.code,
    required this.seenCount,
    required this.lastSeenAt,
  });

  final int id;

  /// Which receiver heard it — which is also roughly where in the building it
  /// was pressed, and the only locating information available during setup.
  final String deviceId;

  final int code;

  /// How many times this code has been heard. A single sighting is often
  /// interference from a neighbouring building; a button somebody is standing
  /// there pressing climbs fast.
  final int seenCount;

  final DateTime lastSeenAt;

  factory UnassignedSignal.fromJson(Map<String, dynamic> j) => UnassignedSignal(
    id: j['id'] as int,
    deviceId: j['device_id'] as String,
    code: j['ev1527_code'] as int,
    seenCount: j['seen_count'] as int? ?? 1,
    lastSeenAt: DateTime.parse(j['last_seen_at'] as String),
  );
}
