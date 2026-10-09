using System;
using NurseCall.Core;
using Xunit;

namespace NurseCall.Tests
{
    /// <summary>
    /// Ported 1:1 from mobile-flutter/test/live_socket_test.dart -- same
    /// cases, same expected values, so the two clients' reconnect pacing
    /// cannot quietly drift apart.
    /// </summary>
    public class LiveSocketBackoffTests
    {
        [Fact]
        public void TheFirstRetryIsImmediateEnoughToMatter()
        {
            Assert.Equal(TimeSpan.FromSeconds(1), LiveSocket.Backoff(0));
        }

        [Fact]
        public void ItBacksOffInsteadOfHammering()
        {
            var waits = new int[6];
            for (var i = 0; i < 6; i++) waits[i] = (int)LiveSocket.Backoff(i).TotalSeconds;
            for (var i = 1; i < waits.Length; i++)
            {
                Assert.True(waits[i] >= waits[i - 1], $"kutish vaqti kamayib ketdi: [{string.Join(",", waits)}]");
            }
        }

        [Fact]
        public void ItStopsGrowingSoALongOutageStillReconnectsPromptly()
        {
            Assert.Equal(TimeSpan.FromSeconds(30), LiveSocket.Backoff(50));
            Assert.Equal(TimeSpan.FromSeconds(30), LiveSocket.Backoff(5000));
        }

        [Fact]
        public void ANonsensicalAttemptCountDoesNotThrow()
        {
            Assert.Equal(TimeSpan.FromSeconds(1), LiveSocket.Backoff(-1));
        }
    }
}
