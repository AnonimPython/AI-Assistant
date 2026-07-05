#!/bin/bash
set -e

# ============================================
#  Build AI Assistant for macOS
#  Сборка AI Assistant для macOS
# ============================================
#
#  Generates:
#    1. AI Assistant.app — standalone macOS app (PyInstaller)
#    2. AI_Assistant.dmg — DMG with drag-to-install
#
#  Результат:
#    1. AI Assistant.app — самостоятельное macOS приложение (PyInstaller)
#    2. AI_Assistant.dmg — DMG с перетаскиванием в Applications
# ============================================

echo "============================================"
echo "  Building AI Assistant for macOS"
echo "============================================"
echo ""

# Проверка Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python3 not found"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Установка зависимостей
echo "[*] Installing dependencies..."
pip3 install -r ../requirements.txt
pip3 install pyinstaller

# Сборка Desktop версии с иконкой
echo "[*] Building Desktop app..."
if [ -f "icon.icns" ]; then
    ICON_ARG="--icon icon.icns"
else
    ICON_ARG=""
    echo "[!] icon.icns not found, building without custom icon"
fi

pyinstaller --onefile --windowed --name "AI Assistant" \
    --add-data "../source/templates:templates" \
    --add-data "../source/static:static" \
    $ICON_ARG \
    ../source/desktop.py 2>/dev/null || \
pyinstaller --onefile --windowed --name "AI Assistant" \
    --add-data "../source/templates:templates" \
    --add-data "../source/static:static" \
    $ICON_ARG \
    ../source/desktop.py

# Веб-версия
echo "[*] Building Web version..."
pyinstaller --onefile --name "ai-web" \
    --add-data "../source/templates:templates" \
    --add-data "../source/static:static" \
    ../source/app.py

# Создание DMG (опционально)
if command -v create-dmg &> /dev/null; then
    echo "[*] Creating DMG..."
    mkdir -p ../dist/dmg
    cp -r "../dist/AI Assistant.app" ../dist/dmg/
    create-dmg \
        --volname "AI Assistant" \
        --volicon "icon.icns" \
        --window-pos 200 120 \
        --window-size 600 300 \
        --icon-size 100 \
        --icon "AI Assistant.app" 175 120 \
        --hide-extension "AI Assistant.app" \
        --app-drop-link 425 120 \
        "../dist/AI_Assistant.dmg" \
        "../dist/dmg/"
    rm -rf ../dist/dmg/
    echo "[OK] DMG created: dist/AI_Assistant.dmg"
else
    echo "[!] create-dmg not found. Install with: brew install create-dmg"
    echo "[!] You can use the .app directly from dist/"
fi

echo ""
echo "============================================"
echo "  Done! Binaries in dist/"
echo "============================================"
