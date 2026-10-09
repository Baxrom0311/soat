using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace NurseCall.Core
{
    /// <summary>
    /// HTTP client for the FastAPI backend, ported from
    /// mobile-flutter/lib/api/client.dart. Same base URL, same routes, same
    /// error shape -- a server/client pair that drifted here would be the
    /// one place a bug could hide from both this session's own server test
    /// suite and the Flutter client's.
    ///
    /// Push-token registration is intentionally not ported: this is a desk
    /// PC, which has no mobile push to register (the Flutter desktop build
    /// skips it the same way, gated on `isDesktop`).
    /// </summary>
    public class ApiClient
    {
        /// <summary>
        /// Fixed, not configurable from a settings screen -- same reasoning
        /// as the Flutter client: a typed-wrong server address on a ward PC
        /// nobody will debug in person is worse than no setting at all.
        /// </summary>
        public const string BaseUrl = "https://nurcecall.boos.uz";

        private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

        private readonly HttpClient _http;
        public string? AccessToken { get; private set; }

        public ApiClient(HttpClient? httpClient = null)
        {
            _http = httpClient ?? new HttpClient();
            _http.Timeout = Timeout;
        }

        public void SetToken(string? token) => AccessToken = token;

        private HttpRequestMessage NewRequest(HttpMethod method, string path, bool auth = true, object? jsonBody = null)
        {
            var req = new HttpRequestMessage(method, BaseUrl + path);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            if (auth && AccessToken != null)
            {
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", AccessToken);
            }
            if (jsonBody != null)
            {
                var json = JsonConvert.SerializeObject(jsonBody);
                req.Content = new StringContent(json, Encoding.UTF8, "application/json");
            }
            return req;
        }

        /// <summary>
        /// Maps the backend's <c>{"detail": "..."}</c> error shape onto
        /// <see cref="ApiException"/>. Anything not 2xx throws, so no caller
        /// can accidentally treat an error body as data.
        /// </summary>
        private static async Task<JToken?> DecodeAsync(HttpResponseMessage r)
        {
            var text = await r.Content.ReadAsStringAsync().ConfigureAwait(false);
            JToken? body = string.IsNullOrEmpty(text) ? null : JToken.Parse(text);
            if ((int)r.StatusCode >= 200 && (int)r.StatusCode < 300) return body;
            var detail = body is JObject obj && obj["detail"]?.Type == JTokenType.String
                ? obj["detail"]!.Value<string>()!
                : $"Server xatosi ({(int)r.StatusCode})";
            throw new ApiException((int)r.StatusCode, detail);
        }

        private async Task<JToken?> SendAsync(HttpRequestMessage req)
        {
            using var response = await _http.SendAsync(req).ConfigureAwait(false);
            return await DecodeAsync(response).ConfigureAwait(false);
        }

        private static List<T> ToList<T>(JToken? body) where T : new() =>
            (body as JArray)?.ToObject<List<T>>() ?? new List<T>();

        // ------------------------------------------------------------------ auth

        public async Task<Session> LoginAsync(string email, string password)
        {
            var req = NewRequest(HttpMethod.Post, "/api/v1/auth/login", auth: false, jsonBody: new
            {
                // Trimmed/lowercased here rather than trusted from the field:
                // a capitalised first letter is what on-screen keyboards do
                // by default and would otherwise read as a wrong password.
                email = email.Trim().ToLowerInvariant(),
                password
            });
            var body = await SendAsync(req).ConfigureAwait(false);
            return body!.ToObject<Session>()!;
        }

        public async Task<Session> RefreshAsync()
        {
            var body = await SendAsync(NewRequest(HttpMethod.Post, "/api/v1/auth/refresh")).ConfigureAwait(false);
            return body!.ToObject<Session>()!;
        }

        public async Task ChangePasswordAsync(string current, string next)
        {
            var req = NewRequest(HttpMethod.Post, "/api/v1/auth/change-password", jsonBody: new
            {
                current_password = current,
                new_password = next
            });
            await SendAsync(req).ConfigureAwait(false);
        }

        // ----------------------------------------------------------------- calls

        public async Task<List<Call>> ActiveCallsAsync()
        {
            var body = await SendAsync(NewRequest(HttpMethod.Get, "/api/v1/calls/active")).ConfigureAwait(false);
            return ToList<Call>(body);
        }

        /// <summary>
        /// Sends no <c>acknowledged_by</c>: the server attributes the
        /// authenticated user's own name, the one attribution a client
        /// cannot get wrong or fake. A 409 (another nurse answered first) is
        /// a normal race on a ward, not a failure, and is swallowed here.
        /// </summary>
        public async Task AcknowledgeAsync(int callId)
        {
            var req = NewRequest(HttpMethod.Post, $"/api/v1/calls/{callId}/ack", jsonBody: new { });
            try
            {
                await SendAsync(req).ConfigureAwait(false);
            }
            catch (ApiException e) when (e.IsAlreadyAcknowledged)
            {
            }
        }

        /// <summary>Billing-gated: a blocked clinic loses this, same as the Flutter client.</summary>
        public async Task<List<HistoryCall>> HistoryAsync(int limit = 200)
        {
            var body = await SendAsync(NewRequest(HttpMethod.Get, $"/api/v1/calls/history?limit={limit}"))
                .ConfigureAwait(false);
            return ToList<HistoryCall>(body);
        }

        // ---------------------------------------------------------------- clinic

        /// <summary>Ungated: a blocked clinic still has a name and still has patients in it.</summary>
        public async Task<Clinic> ClinicAsync()
        {
            var body = await SendAsync(NewRequest(HttpMethod.Get, "/api/v1/clinic/me")).ConfigureAwait(false);
            return body!.ToObject<Clinic>()!;
        }

        public async Task<BillingNotice> BillingNoticeAsync()
        {
            var body = await SendAsync(NewRequest(HttpMethod.Get, "/api/v1/clinic/billing-notice")).ConfigureAwait(false);
            return body!.ToObject<BillingNotice>()!;
        }

        public async Task<VersionInfo> VersionInfoAsync()
        {
            var body = await SendAsync(NewRequest(HttpMethod.Get, "/api/v1/meta/version", auth: false))
                .ConfigureAwait(false);
            return body!.ToObject<VersionInfo>()!;
        }

        // ------------------------------------------------------------- management
        //
        // Admin-only on the server (Phase 4 screens use these).

        public async Task<List<Device>> DevicesAsync()
        {
            var body = await SendAsync(NewRequest(HttpMethod.Get, "/api/v1/devices")).ConfigureAwait(false);
            return ToList<Device>(body);
        }

        public async Task<List<Room>> RoomsAsync()
        {
            var body = await SendAsync(NewRequest(HttpMethod.Get, "/api/v1/rooms")).ConfigureAwait(false);
            return ToList<Room>(body);
        }

        public async Task<Room> CreateRoomAsync(string number, int floor)
        {
            var req = NewRequest(HttpMethod.Post, "/api/v1/rooms", jsonBody: new { room_number = number, floor });
            var body = await SendAsync(req).ConfigureAwait(false);
            return body!.ToObject<Room>()!;
        }

        public Task DeleteRoomAsync(int roomId) =>
            SendAsync(NewRequest(HttpMethod.Delete, $"/api/v1/rooms/{roomId}"));

        public async Task<List<Staff>> StaffAsync()
        {
            var body = await SendAsync(NewRequest(HttpMethod.Get, "/api/v1/staff")).ConfigureAwait(false);
            return ToList<Staff>(body);
        }

        public async Task<Staff> CreateStaffAsync(string name, string email, string password, string role,
            IEnumerable<int>? floors = null)
        {
            var req = NewRequest(HttpMethod.Post, "/api/v1/staff", jsonBody: new
            {
                name = name.Trim(),
                email = email.Trim().ToLowerInvariant(),
                password,
                role,
                floors = floors ?? new int[0]
            });
            var body = await SendAsync(req).ConfigureAwait(false);
            return body!.ToObject<Staff>()!;
        }

        /// <summary>
        /// Floors only -- floor coverage is the one thing that changes
        /// between shifts, which is why it has its own narrow call rather
        /// than a general staff-edit one.
        /// </summary>
        public async Task<Staff> SetStaffFloorsAsync(int staffId, IEnumerable<int> floors)
        {
            // .NET Framework's HttpMethod has no built-in Patch (added later,
            // .NET Core only) -- construct it by name.
            var req = NewRequest(new HttpMethod("PATCH"), $"/api/v1/staff/{staffId}", jsonBody: new { floors });
            var body = await SendAsync(req).ConfigureAwait(false);
            return body!.ToObject<Staff>()!;
        }

        public Task DeleteStaffAsync(int staffId) =>
            SendAsync(NewRequest(HttpMethod.Delete, $"/api/v1/staff/{staffId}"));

        public async Task<List<ButtonPairing>> ButtonsAsync()
        {
            var body = await SendAsync(NewRequest(HttpMethod.Get, "/api/v1/buttons")).ConfigureAwait(false);
            return ToList<ButtonPairing>(body);
        }

        /// <summary>Pairs a transmitter to a room -- the last step of installing a button.</summary>
        public async Task<ButtonPairing> PairButtonAsync(int code, int roomId)
        {
            var req = NewRequest(HttpMethod.Post, "/api/v1/buttons", jsonBody: new { ev1527_code = code, room_id = roomId });
            var body = await SendAsync(req).ConfigureAwait(false);
            return body!.ToObject<ButtonPairing>()!;
        }

        public Task DeleteButtonAsync(int buttonId) =>
            SendAsync(NewRequest(HttpMethod.Delete, $"/api/v1/buttons/{buttonId}"));

        public async Task<List<UnassignedSignal>> UnassignedSignalsAsync()
        {
            var body = await SendAsync(NewRequest(HttpMethod.Get, "/api/v1/unassigned-signals")).ConfigureAwait(false);
            return ToList<UnassignedSignal>(body);
        }

        public Task DismissSignalAsync(int signalId) =>
            SendAsync(NewRequest(HttpMethod.Delete, $"/api/v1/unassigned-signals/{signalId}"));
    }
}
