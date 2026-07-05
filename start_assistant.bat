@echo off
chcp 65001 >nul
title AI Assistant

echo ============================================
echo  AI Assistant - Quick Launch
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Install Python 3.8+ from https://python.org
    pause
    exit /b 1
)

:: Install/update dependencies
echo [*] Installing dependencies...
pip install -r requirements.txt >nul 2>&1

:: Launch web version
echo [*] Starting AI Assistant...
echo [*] Open http://localhost:5066 in your browser
echo.
python app.py

pause
