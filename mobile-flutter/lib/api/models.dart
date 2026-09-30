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

/// A past call, as the history endpoint returns it. Only the two timestamps are
/// used here, to work out how long the ward took to answer.
class HistoryCall {
  const HistoryCall({
    required this.createdAt,
    this.acknowledgedAt,
  });

  final DateTime createdAt;
  final DateTime? acknowledgedAt;

  Duration? get answeredIn =>
      acknowledgedAt?.toUtc().difference(createdAt.toUtc());

  factory HistoryCall.fromJson(Map<String, dynamic> j) => HistoryCall(
        createdAt: DateTime.parse(j['created_at'] as String),
        acknowledgedAt: j['acknowledged_at'] == null
            ? null
            : DateTime.parse(j['acknowledged_at'] as String),
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

  factory VersionInfo.fromJson(Map<String, dynamic> j) => VersionInfo(
        minMobileVersion: j['min_mobile_version'] as int? ?? 1,
      );
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
