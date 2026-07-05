@echo off
chcp 65001 >nul

:: ============================================
::  Build AI Assistant for Windows
::  Сборка AI Assistant для Windows
:: ============================================
::*
::* Produces:
;;*   1. AI Assistant.exe — standalone desktop exe (PyInstaller)
;;*   2. AI_Assistant_Setup.exe — installer with path selection + desktop shortcut (Inno Setup)
;;*   3. Desktop shortcut — created by installer for any user desktop path
;;*
;;*  Результат:
;;*   1. AI Assistant.exe — самостоятельный десктопный exe (PyInstaller)
;;*   2. AI_Assistant_Setup.exe — установщик с выбором пути + ярлыком на рабочем столе (Inno Setup)
;;*   3. Ярлык на рабочем столе — создаётся установщиком для любого пользователя
;;* ============================================

echo ============================================
echo  Building AI Assistant for Windows
echo ============================================
echo.

:: Проверка Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Install Python 3.8+
    pause
    exit /b 1
)

:: Установка зависимостей
echo [*] Installing dependencies...
pip install -r ..\requirements.txt
pip install pyinstaller

:: Desktop версия с иконкой
echo [*] Building Desktop version...
pyinstaller --onefile --windowed --name "AI Assistant" ^
    --add-data "..\source\templates;templates" ^
    --add-data "..\source\static;static" ^
    --icon "icon.ico" ^
    ..\source\desktop.py

:: Веб-версия
echo [*] Building Web version...
pyinstaller --onefile --name "AI Assistant Web" ^
    --add-data "..\source\templates;templates" ^
    --add-data "..\source\static;static" ^
    ..\source\app.py

:: Проверка Inno Setup
echo.
echo [*] Checking Inno Setup...

where iscc >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Inno Setup (iscc.exe) not found in PATH.
    echo [!] Inno Setup (iscc.exe) не найден в PATH.
    echo.
    echo  To build the installer:
    echo  1. Download Inno Setup: https://jrsoftware.org/isdl.php
    echo  2. Add iscc.exe to PATH or run manually:
    echo     "C:\Program Files (x86)\Inno Setup 6\iscc.exe" installer.iss
    echo.
    echo  You can also use the standalone exe from dist/ directly.
    echo  Вы также можете использовать готовый exe из папки dist/ напрямую.
) else (
    echo [*] Building installer with Inno Setup...
    iscc installer.iss
    echo [OK] Installer created: dist\AI_Assistant_Setup.exe
)

echo.
echo ============================================
echo  Done!
echo.
echo  Standalone exe: dist\AI Assistant.exe
echo  Installer:      dist\AI_Assistant_Setup.exe  (if Inno Setup was found)
echo ============================================
pause
