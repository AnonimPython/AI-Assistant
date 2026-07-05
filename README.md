# AI Assistant

[Russian documentation / Русская документация](README_RU.md)

---

Multi-model AI assistant with voice output. Works as a **web app** and **desktop app**.

## Features

- **Multiple AI models**: OpenRouter + HuggingFace (13+ models)
- **Voice output**: 17+ voices via Fish Audio TTS
- **Markdown rendering** -- AI responses rendered with full markdown support
- **Docker** -- ready container
- **Auto-setup** -- prompts for API keys on first launch

## Screenshots

| Themes | Settings |
|--------|----------|
| ![](source/static/repo%20images/theme_1.png) | ![](source/static/repo%20images/settings_1.png) |
| ![](source/static/repo%20images/theme_2.png) | ![](source/static/repo%20images/settings2.png) |
| ![](source/static/repo%20images/theme_3.png) | |
| ![](source/static/repo%20images/theme_4.png) | |

## Quick start

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Launch

```bash
# Web version (open http://localhost:5066)
python app.py

# Desktop version
python desktop.py
```

### 3. First launch

On first launch the app asks for 3 API keys:

| Service     | Where to get                           |
| ----------- | -------------------------------------- |
| OpenRouter  | https://openrouter.ai/keys             |
| Fish Audio  | https://fish.audio/                    |
| HuggingFace | https://huggingface.co/settings/tokens |

---

For full documentation see [README_EN.md](README_EN.md).

---

*Russian docs: [README_RU.md](README_RU.md)*
