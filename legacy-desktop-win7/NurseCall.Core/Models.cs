using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace NurseCall.Core
{
    /// <summary>
    /// Wire types, mirroring the backend's schemas exactly (server/app/schemas/*)
    /// and ported from mobile-flutter/lib/api/models.dart field-for-field.
    /// Deliberately narrow: a call carries room, floor, when it started, and
    /// nothing invented on top of what the server actually knows.
    /// </summary>
    public class Session
    {
        [JsonProperty("access_token")]
        public string AccessToken { get; set; } = "";

        [JsonProperty("role")]
        public string Role { get; set; } = "";

        [JsonProperty("name")]
        public string Name { get; set; } = "";

        [JsonProperty("clinic_id")]
        public int? ClinicId { get; set; }

        [JsonIgnore]
        public bool IsNurse => Role == "nurse";

        [JsonIgnore]
        public bool IsAdmin => Role == "admin";
    }

    public class Call
    {
        [JsonProperty("call_id")]
        public int CallId { get; set; }

        [JsonProperty("room_number")]
        public string RoomNumber { get; set; } = "";

        [JsonProperty("floor")]
        public int Floor { get; set; }

        [JsonProperty("created_at")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } = "";

        /// <summary>
        /// How long this call has been waiting, as of <paramref name="now"/>.
        /// Computed from the server's timestamp, both sides forced to UTC, so
        /// a PC with a skewed clock cannot report a fresh call as old or vice
        /// versa.
        /// </summary>
        public TimeSpan Waited(DateTime now) => now.ToUniversalTime() - CreatedAt.ToUniversalTime();
    }

    /// <summary>The clinic this client belongs to -- just enough to name it in the header.</summary>
    public class Clinic
    {
        [JsonProperty("name")]
        public string Name { get; set; } = "";
    }

    /// <summary>A past call, as GET /api/v1/calls/history returns it.</summary>
    public class HistoryCall
    {
        [JsonProperty("call_id")]
        public int CallId { get; set; }

        [JsonProperty("room_number")]
        public string RoomNumber { get; set; } = "";

        [JsonProperty("floor")]
        public int Floor { get; set; }

        /// <summary>
        /// "active", "acknowledged" or "expired" -- kept as the server's own
        /// string, not an enum. A status this client has not heard of yet
        /// must render as itself, not crash the list or silently become one
        /// of the others (see test/history_test.dart's
        /// "an unknown status is kept, not guessed at").
        /// </summary>
        [JsonProperty("status")]
        public string Status { get; set; } = "acknowledged";

        [JsonProperty("created_at")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("acknowledged_at")]
        public DateTime? AcknowledgedAt { get; set; }

        [JsonProperty("acknowledged_by")]
        public string? AcknowledgedBy { get; set; }

        /// <summary>
        /// Closed by the clock after half a day because nobody ever
        /// acknowledged it. Kept distinct from Answered on purpose -- the
        /// history must never claim somebody went when nobody did.
        /// </summary>
        [JsonIgnore]
        public bool Expired => Status == "expired";

        /// <summary>
        /// Decided by the timestamp, not the status word: that is what every
        /// answer-time figure is computed from, so it has to be the
        /// authoritative one even for a row whose status later became
        /// "expired" (see history_test.dart).
        /// </summary>
        [JsonIgnore]
        public bool Answered => AcknowledgedAt != null;

        [JsonIgnore]
        public TimeSpan? AnsweredIn =>
            AcknowledgedAt == null ? (TimeSpan?)null : AcknowledgedAt.Value.ToUniversalTime() - CreatedAt.ToUniversalTime();
    }

    /// <summary>
    /// What the clinic's subscription banner says. Readable by every clinic
    /// member, including nurses, and never gated -- a clinic that has stopped
    /// paying still has patients in it (server/app/routers/clinic.py).
    /// </summary>
    public class BillingNotice
    {
        [JsonProperty("warn")]
        public bool Warn { get; set; }

        [JsonProperty("blocked")]
        public bool Blocked { get; set; }

        [JsonProperty("days_left")]
        public int? DaysLeft { get; set; }
    }

    public class VersionInfo
    {
        [JsonProperty("min_mobile_version")]
        public int MinMobileVersion { get; set; } = 1;
    }

    /// <summary>
    /// Raised for any non-2xx response. Status is kept because callers need
    /// to tell a few cases apart rather than treat every failure the same:
    /// 401 means the session is gone, 409 means somebody else already
    /// acknowledged this call, which is a normal outcome, not an error.
    /// </summary>
    public class ApiException : Exception
    {
        public ApiException(int status, string message) : base($"ApiException({status}): {message}")
        {
            Status = status;
        }

        public int Status { get; }
        public bool IsUnauthorized => Status == 401;
        public bool IsAlreadyAcknowledged => Status == 409;
    }

    // ---------------------------------------------------------------- management
    //
    // The clinic admin's half of the contract (Phase 4 screens use these; the
    // types are ported now so Phase 4 does not have to re-derive the schemas).

    /// <summary>A 433MHz receiver -- the box on the wall that hears the buttons.</summary>
    public class Device
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("device_id")]
        public string DeviceId { get; set; } = "";

        [JsonProperty("floor")]
        public int Floor { get; set; }

        /// <summary>
        /// The server's own judgement, not recomputed here: it owns the
        /// heartbeat window and already sends the offline alert, so this
        /// client must not disagree with it.
        /// </summary>
        [JsonProperty("online")]
        public bool Online { get; set; }

        [JsonProperty("last_seen_at")]
        public DateTime? LastSeenAt { get; set; }

        /// <summary>Registered but never heard from -- a setup mistake, not an outage.</summary>
        [JsonIgnore]
        public bool NeverSeen => LastSeenAt == null;
    }

    public class Room
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("room_number")]
        public string RoomNumber { get; set; } = "";

        [JsonProperty("floor")]
        public int Floor { get; set; }
    }

    public class Staff
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("email")]
        public string Email { get; set; } = "";

        [JsonProperty("role")]
        public string Role { get; set; } = "";

        [JsonProperty("name")]
        public string Name { get; set; } = "";

        /// <summary>
        /// Empty means every floor -- the server's safe default so a nurse
        /// nobody has assigned yet keeps receiving everything, never nothing.
        /// </summary>
        [JsonProperty("floors")]
        public List<int> Floors { get; set; } = new List<int>();

        [JsonIgnore]
        public bool IsAdmin => Role == "admin";

        [JsonIgnore]
        public bool AllFloors => Floors.Count == 0;
    }

    /// <summary>A button already paired to a room.</summary>
    public class ButtonPairing
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("room_id")]
        public int RoomId { get; set; }

        [JsonProperty("room_number")]
        public string RoomNumber { get; set; } = "";

        [JsonProperty("floor")]
        public int Floor { get; set; }

        [JsonProperty("ev1527_code")]
        public int Code { get; set; }
    }

    /// <summary>
    /// A button press from a transmitter nobody has paired to a room yet --
    /// the installation workflow seen from the server's side.
    /// </summary>
    public class UnassignedSignal
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("device_id")]
        public string DeviceId { get; set; } = "";

        [JsonProperty("ev1527_code")]
        public int Code { get; set; }

        /// <summary>Missing on the wire reads as 1, the cautious assumption, not 0.</summary>
        [JsonProperty("seen_count")]
        public int SeenCount { get; set; } = 1;

        [JsonProperty("last_seen_at")]
        public DateTime LastSeenAt { get; set; }
    }
}
