using System;
using System.Collections.Generic;
using NurseCall.Core;
using Xunit;

namespace NurseCall.Tests
{
    /// <summary>Ported from mobile-flutter/test/shift_stats_test.dart.</summary>
    public class ShiftStatsTests
    {
        // DateTimeKind.Local, not Utc: ShiftStats.From calls .ToLocalTime() on
        // the acknowledged timestamp the way the Dart original calls
        // .toLocal() (Dart's DateTime(...) literals are local by default, so
        // that call is a no-op there). .NET's ToLocalTime() is only a true
        // no-op when the source Kind is already Local -- Unspecified is
        // treated as UTC and would silently shift by the host's offset,
        // making this test's "today" boundary flaky depending on timezone.
        private static readonly DateTime Now = new DateTime(2026, 10, 1, 15, 0, 0, DateTimeKind.Local);
        private static int _nextId = 1;

        private static HistoryCall H(int agoMinutes, int? answeredAfterSeconds = null)
        {
            var created = Now.AddMinutes(-agoMinutes);
            var id = _nextId++;
            return new HistoryCall
            {
                CallId = id,
                RoomNumber = $"10{id}",
                Floor = 1,
                Status = answeredAfterSeconds == null ? "active" : "acknowledged",
                CreatedAt = created,
                AcknowledgedAt = answeredAfterSeconds == null
                    ? (DateTime?)null
                    : created.AddSeconds(answeredAfterSeconds.Value),
            };
        }

        [Fact]
        public void AnEmptyHistoryReportsNothingRatherThanAConfidentZero()
        {
            var s = ShiftStats.From(Array.Empty<HistoryCall>(), Now);
            Assert.Null(s.TypicalAnswer);
            Assert.Equal(0, s.AnsweredToday);
            Assert.Equal("—", AnswerLabelFormatter.Format(s.TypicalAnswer));
        }

        [Fact]
        public void CallsStillWaitingAreNotCountedAsAnswered()
        {
            var s = ShiftStats.From(new[] { H(10) }, Now);
            Assert.Equal(0, s.AnsweredToday);
            Assert.Null(s.TypicalAnswer);
        }

        [Fact]
        public void YesterdayDoesNotCountTowardsToday()
        {
            var s = ShiftStats.From(new[] { H(60 * 20, 30) }, Now);
            Assert.Equal(0, s.AnsweredToday);
        }

        [Fact]
        public void AFewSlowOutliersDoNotDragTheFigureSomewhereUnrecognisable()
        {
            // The whole reason it is a median: one clinic's mean was 435
            // minutes against a median of two.
            var s = ShiftStats.From(new[]
            {
                H(30, 40), H(29, 50), H(28, 60), H(27, 70), H(26, 26000),
            }, Now);
            Assert.Equal(5, s.AnsweredToday);
            Assert.Equal(TimeSpan.FromSeconds(60), s.TypicalAnswer);
        }

        [Fact]
        public void AnEvenNumberOfCallsTakesTheMidpointOfTheTwoMiddleOnes()
        {
            var s = ShiftStats.From(new[]
            {
                H(30, 10), H(29, 20), H(28, 40), H(27, 60),
            }, Now);
            Assert.Equal(TimeSpan.FromSeconds(30), s.TypicalAnswer);
        }

        [Fact]
        public void UnderAMinuteIsSeconds()
        {
            Assert.Equal("48s", AnswerLabelFormatter.Format(TimeSpan.FromSeconds(48)));
        }

        [Fact]
        public void MinutesAndSecondsAsTheDesignShows()
        {
            Assert.Equal("1m 15s", AnswerLabelFormatter.Format(new TimeSpan(0, 1, 15)));
        }

        [Fact]
        public void AWholeNumberOfMinutesDropsTheSeconds()
        {
            Assert.Equal("4m", AnswerLabelFormatter.Format(TimeSpan.FromMinutes(4)));
        }

        [Fact]
        public void HoursAreSpelledOutSoNothingReadsAsSeconds()
        {
            // "1s 05m" could mean one second or one hour -- must not be possible.
            Assert.Equal("2 soat 5m", AnswerLabelFormatter.Format(new TimeSpan(2, 5, 0)));
            Assert.Equal("1 soat", AnswerLabelFormatter.Format(TimeSpan.FromHours(1)));
        }
    }
}
