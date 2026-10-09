using System;
using System.Collections.Generic;
using System.Linq;

namespace NurseCall.Core
{
    /// <summary>
    /// Which calls the alarm should be ringing for -- ported from
    /// mobile-flutter/lib/calls/alarm_service.dart's <c>ringingIds</c> /
    /// <c>shouldRing</c>. Pure on purpose: the actual sound/window behaviour
    /// (the WPF project's AlarmService) is a thin, untestable shell around
    /// this.
    /// </summary>
    public static class AlarmLogic
    {
        /// <summary>
        /// Calls older than this no longer start the alarm. Matches the
        /// server's RENOTIFY_MAX_HOURS: past two hours the server stops
        /// re-sending pushes, because a call still open by then is almost
        /// always one a nurse dealt with and never closed. The app must not
        /// undo that by ringing on every launch until the twelve-hour expiry
        /// finally closes the call.
        /// </summary>
        public static readonly TimeSpan AlarmMaxAge = TimeSpan.FromHours(2);

        public static HashSet<int> RingingIds(IEnumerable<Call> calls, ISet<int> silenced, DateTime now)
        {
            var result = new HashSet<int>();
            foreach (var c in calls)
            {
                if (c.Status == "active" && !silenced.Contains(c.CallId) && c.Waited(now) < AlarmMaxAge)
                {
                    result.Add(c.CallId);
                }
            }
            return result;
        }

        public static bool ShouldRing(IEnumerable<Call> calls, ISet<int> silenced, DateTime now) =>
            RingingIds(calls, silenced, now).Count > 0;
    }
}
