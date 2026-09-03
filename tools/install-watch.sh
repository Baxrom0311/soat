#!/usr/bin/env bash
# ==============================================================================
# NurseCall Smartwatch (Galaxy Watch / Wear OS) Direct Installation Script
# (Google Akkaunt va Samsung Akkauntsiz to'g'ridan-to'g'ri o'rnatish)
# ==============================================================================

set -e

echo "⌚ NurseCall Smartwatch APK o'rnatish vositasi"
echo "------------------------------------------------"

# 1. ADB mavjudligini tekshirish
if ! command -v adb &> /dev/null; then
    echo "❌ ADB topilmadi! Android SDK platform-tools o'rnatilganini tekshiring."
    exit 1
fi

# 2. APK'ni yig'ish (assembleDebug)
echo "📦 APK fayli yig'ilmoqda (assembleDebug)..."
./gradlew assembleDebug --console=plain

APK_PATH="app/build/outputs/apk/debug/app-debug.apk"

if [ ! -f "$APK_PATH" ]; then
    echo "❌ APK fayli topilmadi: $APK_PATH"
    exit 1
fi

echo "✅ APK tayyor: $APK_PATH"
echo ""

# 3. Soat IP va Portini so'rash yoki bog'langan qurilmalarni ko'rish
read -p "⌚ Soatning Wireless ADB IP va Portini kiriting (masalan: 192.168.1.15:5555): " WATCH_ADDR

if [ -n "$WATCH_ADDR" ]; then
    echo "🔌 Soatga ulaninmoqda: $WATCH_ADDR ..."
    adb connect "$WATCH_ADDR"
fi

echo ""
echo "📱 Ulangan ADB qurilmalari ro'yxati:"
adb devices
echo ""

# 4. APK'ni o'rnatish
echo "🚀 Soatga NurseCall ilovasi o'rnatilmoqda..."
adb install -r "$APK_PATH"

echo "🎉 Muvaffaqiyatli o'rnatildi!"
echo ""
echo "💡 Qo'shimcha: Agar hamshira tokenini kompyuterdan avtomatik o mezonida o'rnatmoqchi bo'lsangiz:"
echo "   adb shell am broadcast -a uz.soat.reminder.CONFIGURE --es token \"<HAMSHIRA_JWT_TOKENI>\""
