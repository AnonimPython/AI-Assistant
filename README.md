# AI Assistant

Multi-model AI assistant with voice output. Works as a **web app** and **desktop app**.

**App interface languages:** English, German, French, Serbian, Russian

## Quick start

```bash
git clone https://github.com/AnonimPython/AI-Assistant.git
cd AI-Assistant
```

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Launch

**Web version** (open http://localhost:5066):

```bash
python app.py
```

**Desktop version**:

```bash
python desktop.py
```

**Docker**:

```bash
docker build -t ai-assistant .
docker run -d -p 5066:5066 ai-assistant
```

### 3. First launch

On first launch the app asks for 3 API keys:

| Service     | Where to get                           |
| ----------- | -------------------------------------- |
| OpenRouter  | https://openrouter.ai/keys             |
| Fish Audio  | https://fish.audio/                    |
| HuggingFace | https://huggingface.co/settings/tokens |

## Features

- **Multiple AI models**: OpenRouter + HuggingFace (13+ models)
- **Voice output**: 17+ voices via Fish Audio TTS
- **Multilingual UI**: 5 languages (EN, DE, FR, SR, RU)
- **2 modes**:
  - Web -- launch and open in browser
  - Desktop -- native window (via pywebview)
- **Docker** -- ready container
- **Auto-setup** -- prompts for API keys on first launch
- **Markdown rendering** -- AI responses rendered with full markdown support

## Screenshots

| Themes | Settings |
|--------|----------|
| ![](source/static/repo%20images/theme_1.png) | ![](source/static/repo%20images/settings_1.png) |
| ![](source/static/repo%20images/theme_2.png) | ![](source/static/repo%20images/settings2.png) |
| ![](source/static/repo%20images/theme_3.png) | |
| ![](source/static/repo%20images/theme_4.png) | |


## How to add a custom voice

Add any voice from Fish Audio to your assistant. The screenshots below walk through the full process.

| Step | Screenshot |
|------|------------|
| 1 — Find a voice on fish.audio | ![](source/static/how_to_add_voice/step_1.png) |
| 2 — Click the voice card | ![](source/static/how_to_add_voice/step_2.png) |
| 3 — Copy the voice URL | ![](source/static/how_to_add_voice/step_3.jpg) |
| 4 — Open Add voice in app | ![](source/static/how_to_add_voice/step_4.png) |
| 5 — Paste link and save | ![](source/static/how_to_add_voice/step_5.png) |

**Alternative:** Open the app, go to Settings -> Add voice, and click "How to add a voice" for an in-app guide with the same screenshots.

---

## Build exe/dmg

### Windows

**One-liner** (run from project folder -- puts `.exe` on Desktop):

```cmd
pip install pyinstaller && pyinstaller --noconfirm --onedir --windowed --name "AI Assistant" --icon source/static/app_img/icon.ico --add-data "source/templates;templates" --add-data "source/static;static" --add-data "source/translations.py;." --add-data "source/config_manager.py;." --version-file version_info.txt main.py && xcopy /E /I "dist\AI Assistant" "%USERPROFILE%\Desktop\AI Assistant" && echo Done -- .exe is on your Desktop!
```

### macOS

```bash
cd build
chmod +x build_macos.sh
./build_macos.sh
```

### Linux

```bash
make build-exe
```

Output files appear in `dist/` folder.

---

## Test models

Check which models are working:

```bash
python test_models.py
```

Broken models are automatically commented out in config.

---

## Docker

```bash
# Build
docker build -t ai-assistant .

# Run
docker run -d -p 5066:5066 --name ai-assistant ai-assistant

# Stop
docker stop ai-assistant
```

---

## Roadmap

- **Voice browser** -- built-in voice discovery and marketplace inside the app (no more searching on fish.audio), preview voices before adding, one-click add
- **More AI providers** -- integration with additional model providers (Anthropic, Groq, Together AI, etc.)
- **Voice input** -- speech-to-text via microphone (planned)
- **Website embedding** -- embeddable widget for third-party sites
- **Conversation memory** -- long-term context and summary-based memory
- **Multi-session** -- multiple independent chat sessions
- **Plugin system** -- custom tools and integrations
- **macOS native app** -- standalone .app bundle with native UI (beyond pywebview)

---

## Antivirus

PyInstaller may cause false antivirus positives. Recommendations:

- Use Docker to avoid this issue
- For Windows: add program folder to Defender exclusions
- For macOS: `xattr -cr /path/to/app` after unpacking

---

## Project structure

```
ai_assistant/
├── app.py              # Flask web server
├── desktop.py          # Desktop wrapper (pywebview)
├── test_models.py      # Model testing
├── config_manager.py   # API key management
├── requirements.txt    # Dependencies
├── Dockerfile          # Docker container
├── Makefile            # Build commands
├── README.md           # English documentation
├── README_RU.md        # Russian documentation
├── templates/          # HTML templates
│   ├── index.html      # Chat interface
│   └── setup.html      # Setup page
├── static/             # Static files
│   ├── css/style.css
│   ├── js/app.js
│   ├── how_to_add_voice/  # Voice guide screenshots
│   └── repo images/       # App screenshots for README
└── build/              # Build scripts
    ├── build_windows.bat
    ├── build_macos.sh
    └── installer.iss
```

---

## Tech stack

- **Backend** -- Python Flask
- **Frontend** -- Vanilla JS, CSS custom properties
- **Markdown** -- marked.js (CDN)
- **TTS** -- Fish Audio API
- **Desktop** -- pywebview
- **Docker** -- multi-stage build

---

## 📖 Russian documentation

👉 [Полная документация на русском →](README_RU.md)
