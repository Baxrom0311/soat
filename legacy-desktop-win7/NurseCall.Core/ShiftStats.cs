using System;
using System.Collections.Generic;
using System.Linq;

namespace NurseCall.Core
{
    /// <summary>
    /// The two numbers in the strip under the call list. Ported from
    /// mobile-flutter/lib/calls/shift_stats.dart. Computed from the history
    /// this client can already read rather than a new endpoint, which keeps
    /// it floor-scoped for a nurse the same way the history route already is.
    /// </summary>
    public readonly struct ShiftStats
    {
        public ShiftStats(TimeSpan? typicalAnswer, int answeredToday)
        {
            TypicalAnswer = typicalAnswer;
            AnsweredToday = answeredToday;
        }

        /// <summary>
        /// Null until at least one call has been answered -- better than a
        /// confident "0:00" for a shift that has not started.
        /// </summary>
        public TimeSpan? TypicalAnswer { get; }
        public int AnsweredToday { get; }

        public static readonly ShiftStats Empty = new ShiftStats(null, 0);

        /// <summary><paramref name="now"/> is passed in, not read, so "today" is testable.</summary>
        public static ShiftStats From(IEnumerable<HistoryCall> history, DateTime now)
        {
            var today = new DateTime(now.Year, now.Month, now.Day);
            var answeredTimes = new List<TimeSpan>();
            var count = 0;

            foreach (var call in history)
            {
                var took = call.AnsweredIn;
                if (took == null) continue;
                var at = call.AcknowledgedAt!.Value.ToLocalTime();
                if (at < today) continue;
                count++;
                if (took.Value >= TimeSpan.Zero) answeredTimes.Add(took.Value);
            }

            if (answeredTimes.Count == 0) return new ShiftStats(null, count);

            // The median, not the mean. One clinic's real mean answer time was
            // 435 minutes against a median of two: a handful of calls cleared
            // in a batch hours later dragged the average somewhere no nurse
            // would recognise. The median is what "typical" actually means.
            answeredTimes.Sort();
            var mid = answeredTimes.Count / 2;
            var median = answeredTimes.Count % 2 == 1
                ? answeredTimes[mid]
                : TimeSpan.FromTicks((answeredTimes[mid - 1].Ticks + answeredTimes[mid].Ticks) / 2);

            return new ShiftStats(median, count);
        }
    }

    public static class AnswerLabelFormatter
    {
        /// <summary>
        /// "48s", "1m 15s", "2 soat 5m" -- the shape the design shows. Hours
        /// are spelled out rather than abbreviated: the short Uzbek form for
        /// "soat" collides with the one for "soniya", and "1s 05m" could mean
        /// either one second or one hour.
        /// </summary>
        public static string Format(TimeSpan? d)
        {
            if (d == null) return "—";
            var secs = (long)d.Value.TotalSeconds;
            if (secs < 60) return $"{secs}s";
            var mins = secs / 60;
            var restSecs = secs % 60;
            if (mins < 60) return restSecs == 0 ? $"{mins}m" : $"{mins}m {restSecs}s";
            var hours = mins / 60;
            var restMins = mins % 60;
            return restMins == 0 ? $"{hours} soat" : $"{hours} soat {restMins}m";
        }
    }
}
