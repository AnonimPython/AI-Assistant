# AI Assistant

Multi-model AI assistant with voice output. Works as a web app and desktop app.

---

## Screenshots

| Themes | Settings |
|--------|----------|
| ![](source/static/repo%20images/theme_1.png) | ![](source/static/repo%20images/settings_1.png) |
| ![](source/static/repo%20images/theme_2.png) | ![](source/static/repo%20images/settings2.png) |
| ![](source/static/repo%20images/theme_3.png) | |
| ![](source/static/repo%20images/theme_4.png) | |

---

## Features

- Multiple AI models: OpenRouter + HuggingFace (13+ models)
- Voice output: 17+ voices via Fish Audio TTS
- 15 color themes
- Markdown rendering in AI responses
- Multilingual UI: English, German, French, Serbian, Russian
- Docker support
- First-launch setup wizard

---

## Quick start

### Prerequisites

- Python 3.8 or higher
- API keys: OpenRouter, Fish Audio, HuggingFace

### Run web version

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:5066 in your browser.

### Run desktop version

```bash
pip install -r requirements.txt
python main.py
```

### Run with Docker (web version)

```bash
docker build -t ai-assistant .
docker run -d -p 5066:5066 --name ai-assistant ai-assistant
```

Open http://localhost:5066.

### Run with Docker (desktop version)

The desktop version (pywebview) cannot run inside a Docker container because it requires a display. Use Docker only for the web version.

---

## Windows quick setup

Open Command Prompt (cmd) and run these commands one by one or save them as a `.bat` file:

```cmd
cd %USERPROFILE%\Desktop
git clone https://github.com/AnonimPython/AI-Assistant.git
cd AI-Assistant
pip install -r requirements.txt
python app.py
```

To create a `.bat` file for one-click launch:

1. Create a new text file `start_assistant.bat` on your Desktop
2. Paste this content:

```cmd
@echo off
cd /d "%~dp0AI-Assistant"
pip install -r requirements.txt >nul 2>&1
python app.py
pause
```

3. Run `start_assistant.bat` — it will update dependencies and start the app.

---

## How to build an executable (.exe / .app)

### Windows

Run these commands in the project folder:

```cmd
pip install pyinstaller
pyinstaller --onefile --windowed --name "AI Assistant" --add-data "source/templates;templates" --add-data "source/static;static" --icon build/icon.ico source/desktop.py
```

The `.exe` will be in the `dist/` folder.

Or use the pre-made script:

```cmd
cd build
build_windows.bat
```

### macOS

```bash
cd build
chmod +x build_macos.sh
./build_macos.sh
```

Output: `dist/AI Assistant.app` and optionally `dist/AI_Assistant.dmg`.

---

## How to add a custom voice

| Step | Screenshot |
|------|------------|
| 1 — Find a voice | ![](source/static/how_to_add_voice/step_1.png) |
| 2 — Select it | ![](source/static/how_to_add_voice/step_2.png) |
| 3 — Copy the URL | ![](source/static/how_to_add_voice/step_3.jpg) |
| 4 — Open Add voice | ![](source/static/how_to_add_voice/step_4.png) |
| 5 — Paste and save | ![](source/static/how_to_add_voice/step_5.png) |

Or in the app: Settings > Add voice > click "How to add a voice" for the same guide.

---

## API keys

On first launch the app asks for 3 API keys:

| Service | Where to get |
|---------|-------------|
| OpenRouter | https://openrouter.ai/keys |
| Fish Audio | https://fish.audio/ |
| HuggingFace | https://huggingface.co/settings/tokens |

---

## Roadmap

- Voice browser — built-in voice discovery, preview, one-click add
- More AI providers — Anthropic, Groq, Together AI
- Voice input — speech-to-text via microphone
- Conversation memory — long-term context with summarization
- Multi-session — independent chat sessions
- Plugin system — custom tools and integrations
- macOS native app — standalone .app with native UI

---

---

# AI Assistant (Русский)

Мульти-модельный AI ассистент с голосовым выводом. Работает как веб-приложение и десктоп-приложение.

## Скриншоты

| Темы | Настройки |
|------|-----------|
| ![](source/static/repo%20images/theme_1.png) | ![](source/static/repo%20images/settings_1.png) |
| ![](source/static/repo%20images/theme_2.png) | ![](source/static/repo%20images/settings2.png) |
| ![](source/static/repo%20images/theme_3.png) | |
| ![](source/static/repo%20images/theme_4.png) | |

## Возможности

- Множество AI моделей: OpenRouter + HuggingFace (13+ моделей)
- Озвучка ответов: 17+ голосов через Fish Audio TTS
- 15 цветовых тем
- Поддержка Markdown в ответах
- Мультиязычный интерфейс: английский, немецкий, французский, сербский, русский
- Docker поддержка
- Мастер настройки при первом запуске

## Быстрый старт

### Запуск веб-версии

```bash
pip install -r requirements.txt
python app.py
```

Открой http://localhost:5066 в браузере.

### Запуск десктоп-версии

```bash
pip install -r requirements.txt
python main.py
```

### Запуск через Docker (веб-версия)

```bash
docker build -t ai-assistant .
docker run -d -p 5066:5066 --name ai-assistant ai-assistant
```

Десктоп-версия не работает в Docker — используйте Docker только для веб-версии.

## Быстрый старт на Windows

Открой Командную строку (cmd) и выполни:

```cmd
cd %USERPROFILE%\Desktop
git clone https://github.com/AnonimPython/AI-Assistant.git
cd AI-Assistant
pip install -r requirements.txt
python app.py
```

### Как создать .bat файл для быстрого запуска

1. Создай файл `start_assistant.bat` на Рабочем столе
2. Вставь туда:

```cmd
@echo off
cd /d "%~dp0AI-Assistant"
pip install -r requirements.txt >nul 2>&1
python app.py
pause
```

3. Запускай `start_assistant.bat` — он обновит зависимости и откроет приложение.

## Как собрать .exe / .app

### Windows

```cmd
pip install pyinstaller
pyinstaller --onefile --windowed --name "AI Assistant" --add-data "source/templates;templates" --add-data "source/static;static" --icon build/icon.ico source/desktop.py
```

Готовый `.exe` будет в папке `dist/`.

Или используй готовый скрипт:

```cmd
cd build
build_windows.bat
```

### macOS

```bash
cd build
chmod +x build_macos.sh
./build_macos.sh
```

Результат: `dist/AI Assistant.app` и опционально `dist/AI_Assistant.dmg`.

## Как добавить свой голос

| Шаг | Скриншот |
|-----|----------|
| 1 — Найди голос | ![](source/static/how_to_add_voice/step_1.png) |
| 2 — Выбери его | ![](source/static/how_to_add_voice/step_2.png) |
| 3 — Скопируй URL | ![](source/static/how_to_add_voice/step_3.jpg) |
| 4 — Открой Добавить голос | ![](source/static/how_to_add_voice/step_4.png) |
| 5 — Вставь и сохрани | ![](source/static/how_to_add_voice/step_5.png) |

Или в приложении: Настройки > Добавить голос > нажми «Как добавить голос».

## API ключи

При первом запуске приложение запросит 3 API ключа:

| Сервис | Где получить |
|--------|-------------|
| OpenRouter | https://openrouter.ai/keys |
| Fish Audio | https://fish.audio/ |
| HuggingFace | https://huggingface.co/settings/tokens |

## План развития

- Браузер голосов — встроенный каталог голосов с превью и добавлением в один клик
- Больше AI провайдеров — Anthropic, Groq, Together AI
- Голосовой ввод — распознавание речи с микрофона
- Память диалогов — долгосрочный контекст с саммари
- Мульти-сессии — несколько независимых чатов
- Система плагинов — пользовательские инструменты
- Нативное macOS приложение — standalone .app
