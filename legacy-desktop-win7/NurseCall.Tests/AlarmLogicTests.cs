using System;
using System.Collections.Generic;
using NurseCall.Core;
using Xunit;

namespace NurseCall.Tests
{
    /// <summary>Ported from mobile-flutter/test/alarm_test.dart.</summary>
    public class AlarmLogicTests
    {
        private static readonly DateTime Now = new DateTime(2026, 10, 8, 12, 0, 0, DateTimeKind.Utc);

        private static Call MakeCall(int id, TimeSpan age, string status = "active") => new Call
        {
            CallId = id,
            RoomNumber = $"10{id}",
            Floor = 1,
            CreatedAt = Now - age,
            Status = status,
        };

        [Fact]
        public void AFreshActiveCallRings()
        {
            Assert.True(AlarmLogic.ShouldRing(new[] { MakeCall(1, TimeSpan.FromMinutes(1)) },
                new HashSet<int>(), Now));
        }

        [Fact]
        public void ACallOlderThanTheRenotifyLimitDoesNotRing()
        {
            Assert.False(AlarmLogic.ShouldRing(new[] { MakeCall(1, TimeSpan.FromHours(3)) },
                new HashSet<int>(), Now));
        }

        [Fact]
        public void ASilencedCallDoesNotRingANewerOneDoes()
        {
            var calls = new List<Call> { MakeCall(1, TimeSpan.FromMinutes(5)) };
            Assert.False(AlarmLogic.ShouldRing(calls, new HashSet<int> { 1 }, Now));

            var withNewArrival = new List<Call>(calls) { MakeCall(2, TimeSpan.FromSeconds(3)) };
            Assert.True(AlarmLogic.ShouldRing(withNewArrival, new HashSet<int> { 1 }, Now));
        }

        [Fact]
        public void AcknowledgedCallsNeverRing()
        {
            Assert.False(AlarmLogic.ShouldRing(new[] { MakeCall(1, TimeSpan.Zero, "acknowledged") },
                new HashSet<int>(), Now));
        }

        [Fact]
        public void TheAlarmIsToldExactlyWhichCallsItRingsFor()
        {
            var calls = new[]
            {
                MakeCall(1, TimeSpan.FromMinutes(1)),
                MakeCall(2, TimeSpan.FromHours(3)),
                MakeCall(3, TimeSpan.FromSeconds(10)),
                MakeCall(4, TimeSpan.Zero, "acknowledged"),
            };
            var result = AlarmLogic.RingingIds(calls, new HashSet<int> { 3 }, Now);
            Assert.Equal(new HashSet<int> { 1 }, result);
        }
    }
}
