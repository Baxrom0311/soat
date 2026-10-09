using System;

namespace NurseCall.Core
{
    /// <summary>
    /// How long a call has been waiting, and what that means visually.
    ///
    /// Ported from <c>mobile-flutter/lib/core/age.dart</c>. That file's own
    /// history is the reason this is worth reading before touching it: the
    /// thresholds used to be hand-copied per client and drifted --
    /// [0, 30, 120] on the watch and dashboard against [0, 120, 600] on the
    /// phone -- so the same call read calm on one screen and urgent on
    /// another. All clients now take the phone's numbers
    /// (<see cref="Tokens.ThresholdsSec"/>, itself a hand-copy of
    /// tokens.json's <c>call.thresholdsSec</c> -- see the note on
    /// <see cref="Tokens"/>). Don't reintroduce a third copy here.
    /// </summary>
    public static class AgeStep
    {
        /// <summary>1, 2 or 3 -- never 0. A call that has just arrived is still a call.</summary>
        public static int Compute(TimeSpan waited)
        {
            var s = (long)waited.TotalSeconds;
            if (s < Tokens.ThresholdsSec[1]) return 1;
            if (s < Tokens.ThresholdsSec[2]) return 2;
            return 3;
        }

        /// <summary>
        /// <c>m:ss</c> until an hour, then <c>h:mm:ss</c>. Always a running
        /// clock, never a rounded phrase like "5 minutes ago" -- the exact
        /// count is what a nurse is judging, and a phrase hides the
        /// difference between two minutes and nine.
        ///
        /// A negative duration (the phone's clock briefly ahead of the
        /// server's) reads as 0:00 rather than a confusing negative number.
        /// </summary>
        public static string ElapsedLabel(TimeSpan waited)
        {
            var total = (long)waited.TotalSeconds;
            if (total < 0) total = 0;
            var h = total / 3600;
            var m = (total % 3600) / 60;
            var s = total % 60;
            var ss = s.ToString("D2");
            return h == 0 ? $"{m}:{ss}" : $"{h}:{m:D2}:{ss}";
        }
    }
}
