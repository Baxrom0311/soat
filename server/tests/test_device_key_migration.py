"""Device keys move off bcrypt without a single receiver losing access.

bcrypt is the wrong primitive for these keys and was expensive enough to matter:
648ms per verification on the production box, 94% of everything a patient's
button press spends on the server. But the receivers in the field were registered
under it, and their plaintext keys exist only on the ESP32 -- so the fleet cannot
be re-issued, only migrated in place.

The one requirement that outranks the speed: **nothing may lose access**. Every
test below is some version of that.

NOT covered here: that the comparison is constant-time. Swapping
`hmac.compare_digest` for `==` leaves every test in this file green, because a
timing side-channel is invisible to a functional assertion -- it is a property of
how long the equal case takes relative to the unequal one, which no unit test on
a shared CI runner can measure honestly. Mutation testing found this gap rather
than hiding it; the defence is the review of that one line.
"""

import importlib

import pytest
from app.core import config, security
from app.core.security import hash_password, verify_password

SECRET = "sinov-qurilma-kaliti-uchun-maxfiy-qiymat"
KEY = "dk_ZmFrZS1kZXZpY2Uta2V5LWZvci10ZXN0cw"


@pytest.fixture
def hmac_on(monkeypatch):
    """A server with DEVICE_KEY_SECRET configured."""
    monkeypatch.setenv("DEVICE_KEY_SECRET", SECRET)
    importlib.reload(config)
    importlib.reload(security)
    yield security
    importlib.reload(config)
    importlib.reload(security)


@pytest.fixture
def hmac_off(monkeypatch):
    """A server where the secret was never set."""
    monkeypatch.setenv("DEVICE_KEY_SECRET", "")
    importlib.reload(config)
    importlib.reload(security)
    yield security
    importlib.reload(config)
    importlib.reload(security)


# ------------------------------------------------- nothing loses access


def test_a_receiver_registered_under_bcrypt_still_authenticates(hmac_on):
    """The whole fleet is in this state at the moment of deploy."""
    legacy = hash_password(KEY)
    ok, _ = hmac_on.verify_device_key(KEY, legacy)
    assert ok, "maydondagi qurilma kirishni yo'qotdi"


def test_a_bcrypt_hash_is_flagged_for_upgrade(hmac_on):
    ok, should_rehash = hmac_on.verify_device_key(KEY, hash_password(KEY))
    assert ok and should_rehash


def test_an_upgraded_hash_authenticates_the_same_key(hmac_on):
    """The actual migration step, end to end."""
    legacy = hash_password(KEY)
    ok, should_rehash = hmac_on.verify_device_key(KEY, legacy)
    assert ok and should_rehash

    upgraded = hmac_on.hash_device_key(KEY)
    ok_after, again = hmac_on.verify_device_key(KEY, upgraded)
    assert ok_after, "yangilangandan keyin qurilma kira olmay qoldi"
    assert not again, "har safar qayta yangilanaveradi"


def test_a_wrong_key_is_rejected_in_both_formats(hmac_on):
    for stored in (hash_password(KEY), hmac_on.hash_device_key(KEY)):
        ok, _ = hmac_on.verify_device_key("dk_butunlay-boshqa-kalit", stored)
        assert not ok


def test_a_missing_secret_keeps_the_old_behaviour(hmac_off):
    """A server whose DEVICE_KEY_SECRET was never set must authenticate exactly as
    it did yesterday. An unset environment variable cannot be allowed to stop a
    ward raising calls."""
    stored = hmac_off.hash_device_key(KEY)
    assert stored.startswith("$2"), "sir yo'qligida ham HMAC yozilibdi"
    ok, should_rehash = hmac_off.verify_device_key(KEY, stored)
    assert ok
    assert not should_rehash, "yangilashga joy yo'q — yangilanish sirini talab qiladi"


def test_a_legacy_hash_is_not_flagged_for_upgrade_without_a_secret(hmac_off):
    ok, should_rehash = hmac_off.verify_device_key(KEY, hash_password(KEY))
    assert ok and not should_rehash


# ------------------------------------------------------------ properties


def test_the_stored_hash_does_not_contain_the_key(hmac_on):
    stored = hmac_on.hash_device_key(KEY)
    assert KEY not in stored


def test_a_stolen_database_alone_does_not_reveal_a_key(hmac_on, monkeypatch):
    """The property bcrypt was there for, kept.

    An attacker with the hash but not DEVICE_KEY_SECRET cannot produce a matching
    one -- which is why this is HMAC under a server-held secret rather than a
    plain digest.
    """
    stored = hmac_on.hash_device_key(KEY)

    monkeypatch.setenv("DEVICE_KEY_SECRET", "o'g'rining taxmini")
    importlib.reload(config)
    importlib.reload(security)
    ok, _ = security.verify_device_key(KEY, stored)
    assert not ok


def test_hashing_is_deterministic_so_an_upgrade_settles(hmac_on):
    assert hmac_on.hash_device_key(KEY) == hmac_on.hash_device_key(KEY)


def test_passwords_still_use_bcrypt(hmac_on):
    """Device keys are 256 bits of randomness; passwords are something a person
    chose. Only the second needs guessing to be expensive, and it still is."""
    stored = hash_password("hamshira-paroli")
    assert stored.startswith("$2")
    assert verify_password("hamshira-paroli", stored)


def test_it_is_fast_enough_to_matter(hmac_on):
    """Not a benchmark -- a guard against the primitive being swapped back.

    bcrypt at cost 12 measured 648ms on the production box. Anything in that
    region here means device keys are being hashed like passwords again.
    """
    import time

    stored = hmac_on.hash_device_key(KEY)
    started = time.perf_counter()
    for _ in range(50):
        hmac_on.verify_device_key(KEY, stored)
    per_call_ms = (time.perf_counter() - started) * 1000 / 50
    assert per_call_ms < 5, f"har bir tekshiruv {per_call_ms:.1f} ms — parol primitivi qaytgan ko'rinadi"
