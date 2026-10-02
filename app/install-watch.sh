#!/usr/bin/env bash
#
# Install the ward watch app over Wi-Fi, and optionally sign the watch in.
#
# Wear OS watches have no USB port, so everything goes over the network. The
# watch has to be on the same Wi-Fi as this computer, and the connection is
# forgotten whenever the watch reboots or leaves the network -- which is why
# this script reconnects rather than assuming a connection is still there.
#
#   ./app/install-watch.sh 192.168.1.42:5555
#   ./app/install-watch.sh 192.168.1.42:5555 --sign-in nurse@clinic.uz
#
# Pairing first, on Wear OS 4 and newer (once per watch, ever):
#   adb pair <ip>:<pairing-port>     # both shown on the watch
#
set -euo pipefail

ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
APK="${APK:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/build/outputs/apk/release/app-release.apk}"
HOST="${1:-}"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mXATO: %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$HOST" ] || fail "soat manzilini bering, masalan: ./app/install-watch.sh 192.168.1.42:5555"
[ -x "$ADB" ]  || fail "adb topilmadi: $ADB"
[ -f "$APK" ]  || fail "APK topilmadi: $APK  (avval ./gradlew :app:assembleRelease)"

say "Soatga ulanmoqda: $HOST"
"$ADB" connect "$HOST" | sed 's/^/  /'
# `adb connect` prints "connected" and exits 0 even when the watch refused, so
# the device list is what actually says whether this worked.
"$ADB" devices | grep -q "^$HOST[[:space:]]*device$" \
  || fail "ulanmadi. Soatda: Sozlamalar > Dasturchi > Wi-Fi orqali debug YOQILGAN bo'lsinmi? Bir xil Wi-Fi da turibdimi?"

say "O'rnatilmoqda ($(du -h "$APK" | cut -f1))"
# -r keeps the existing data, so a watch that was already signed in stays signed
# in across the upgrade. A signature mismatch fails here rather than silently.
if ! "$ADB" -s "$HOST" install -r "$APK" 2>&1 | sed 's/^/  /' | grep -q Success; then
  fail "o'rnatilmadi. Avvalgi nusxa boshqa kalit bilan imzolangan bo'lsa:
  $ADB -s $HOST uninstall uz.soat.reminder
  (diqqat: bu soatdagi kirishni ham o'chiradi)"
fi

say "O'rnatildi"
"$ADB" -s "$HOST" shell dumpsys package uz.soat.reminder \
  | grep -E "versionName|versionCode" | head -2 | sed 's/^/  /'

if [ "${2:-}" = "--sign-in" ]; then
  EMAIL="${3:-}"
  [ -n "$EMAIL" ] || fail "--sign-in uchun email kerak"
  read -rsp "  $EMAIL paroli: " PASSWORD; echo

  say "Serverdan token olinmoqda"
  TOKEN=$(curl -s -X POST https://nurcecall.boos.uz/api/v1/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')
  [ -n "$TOKEN" ] || fail "kirib bo'lmadi — email yoki parol noto'g'ri"

  # The receiver is protected by the DUMP permission, so adb can send this and
  # no other app on the watch can.
  "$ADB" -s "$HOST" shell am broadcast \
    -a uz.soat.reminder.CONFIGURE --es token "$TOKEN" >/dev/null
  say "Soat $EMAIL hisobi bilan kirdi"
  echo "  Chaqiruvni qabul qilganda tarixda shu hamshiraning ismi yoziladi."
fi

say "Tayyor"
echo "  Loglarni ko'rish:  $ADB -s $HOST logcat -s NurseCall:* AndroidRuntime:E"
echo "  Uzish:             $ADB disconnect $HOST"
