using System;
using NurseCall.Core;
using Xunit;

namespace NurseCall.Tests
{
    /// <summary>Ported from mobile-flutter/test/age_test.dart.</summary>
    public class AgeStepTests
    {
        [Fact]
        public void ACallThatJustArrivedIsAlreadyStep1NeverZero()
        {
            Assert.Equal(1, AgeStep.Compute(TimeSpan.Zero));
        }

        [Fact]
        public void StepsChangeExactlyAtTheThresholdsNotASecondEitherSide()
        {
            Assert.Equal(1, AgeStep.Compute(TimeSpan.FromSeconds(119)));
            Assert.Equal(2, AgeStep.Compute(TimeSpan.FromSeconds(120)));
            Assert.Equal(2, AgeStep.Compute(TimeSpan.FromSeconds(599)));
            Assert.Equal(3, AgeStep.Compute(TimeSpan.FromSeconds(600)));
        }

        [Fact]
        public void NothingGoesPastStep3HoweverLongItWaits()
        {
            Assert.Equal(3, AgeStep.Compute(TimeSpan.FromHours(9)));
        }

        [Fact]
        public void ReadsAsAClockUnderAnHour()
        {
            Assert.Equal("0:00", AgeStep.ElapsedLabel(TimeSpan.Zero));
            Assert.Equal("0:09", AgeStep.ElapsedLabel(TimeSpan.FromSeconds(9)));
            Assert.Equal("1:15", AgeStep.ElapsedLabel(TimeSpan.FromSeconds(75)));
            Assert.Equal("23:08", AgeStep.ElapsedLabel(new TimeSpan(0, 23, 8)));
            Assert.Equal("59:59", AgeStep.ElapsedLabel(new TimeSpan(0, 59, 59)));
        }

        [Fact]
        public void GrowsAnHoursFieldRatherThanCountingPast59Minutes()
        {
            Assert.Equal("1:00:00", AgeStep.ElapsedLabel(TimeSpan.FromHours(1)));
            Assert.Equal("2:05:03", AgeStep.ElapsedLabel(new TimeSpan(2, 5, 3)));
        }

        [Fact]
        public void AClockSkewThatMakesACallLookFutureDatedShowsZeroNotANegative()
        {
            Assert.Equal("0:00", AgeStep.ElapsedLabel(TimeSpan.FromSeconds(-3)));
        }
    }
}
