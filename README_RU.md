# AI Assistant

Мульти-модельный AI ассистент с голосовым выводом и современным интерфейсом **Aurora Glass**. Работает как **веб-приложение** и **десктоп-приложение**.

**Языки интерфейса:** английский, немецкий, французский, португальский, русский

## Главное

- **Aurora Glass UI** — адаптивная боковая панель, стеклянные панели, светлые и тёмные темы, мобильная верстка
- **Безопасные API-ключи** — хранение в системном keychain с локальным fallback
- **Web-поиск с цитатами** — ответы с опорой на источники через OpenRouter web plugin
- **Поиск картинок в браузере** — запрос «найди фотографию айфона» открывает реальный поиск изображений
- **Каталог голосов** — поиск, фильтры, превью и добавление голосов Fish Audio прямо в приложении
- **OpenRouter OAuth** — подключение в один клик; обязателен только ключ OpenRouter
- **Браузер бесплатных моделей** — поиск и добавление бесплатных моделей OpenRouter в один клик
- **Офлайн-ввод голоса** — локальное распознавание речи через faster-whisper
- **Команды ПК** — открытие сайтов, поиск в интернете и картинках, сворачивание окон
- **2 режима работы** — веб и нативное десктоп-окно через pywebview
- **Docker** — готовый контейнер
- **5 языков интерфейса** — EN, DE, FR, PT, RU

## Быстрый старт

```bash
git clone https://github.com/AnonimPython/AI-Assistant.git
cd AI-Assistant
```

### 1. Установка зависимостей

```bash
pip install -r requirements.txt
```

### 2. Запуск

**Веб-версия** (открой http://localhost:5066):

```bash
python app.py
```

**Десктоп-версия**:

```bash
python desktop.py
```

**Docker**:

```bash
docker build -t ai-assistant .
docker run -d -p 5066:5066 ai-assistant
```

### 3. Первый запуск

Нажми **Continue with OpenRouter** для настройки через OAuth в один клик или вставь ключ вручную.
Обязателен только OpenRouter; Fish Audio и HuggingFace опциональны.

| Сервис      | Обязателен | Где получить                           |
| ----------- | ---------- | -------------------------------------- |
| OpenRouter  | Да         | https://openrouter.ai/keys             |
| Fish Audio  | Опционально | https://fish.audio/app/developers/    |
| HuggingFace | Опционально | https://huggingface.co/settings/tokens |

## Скриншоты

### Интерфейс Aurora Glass

| Чат, цитаты и web-поиск | Настройки и безопасное хранение ключей |
| ----------------------- | -------------------------------------- |
| ![](source/static/repo%20images/aurora/aurora-main.png) | ![](source/static/repo%20images/aurora/aurora-settings-keychain.png) |

| Каталог голосов | Браузер бесплатных моделей |
| --------------- | -------------------------- |
| ![](source/static/repo%20images/aurora/aurora-voices-browser.png) | ![](source/static/repo%20images/aurora/aurora-models-browser.png) |

| OAuth-настройка OpenRouter | Мобильная версия |
| -------------------------- | ---------------- |
| ![](source/static/repo%20images/aurora/aurora-setup-oauth.png) | ![](source/static/repo%20images/aurora/aurora-mobile.png) |

### Панель web-поиска

![Переключатель web-поиска](source/static/repo%20images/aurora/aurora-web-search.png)

## Web-поиск и поиск картинок

Включи кнопку глобуса в панели ввода, чтобы получать ответы с опорой на интернет через OpenRouter web plugin. В ответ добавляются кликабельные цитаты из `url_citation`.

Если попросить фото, картинку или изображение, ассистент откроет Google Images в браузере по умолчанию с извлечённым запросом. Пример: «найди фотографию айфона» → Google Images по запросу «айфона».

Web-поиск расходует кредиты OpenRouter даже для бесплатных моделей. Подробнее: [цены OpenRouter web search](https://openrouter.ai/docs/features/web-search).

## Безопасное хранение API-ключей

API-ключи сохраняются в системном keychain через `keyring`:

- macOS — Keychain
- Windows — Credential Locker
- Linux — Secret Service / KWallet, если доступен

При первом запуске после обновления старые ключи из `~/AI Assistant/config.json` переносятся в keychain и удаляются из JSON. В headless/Docker-окружениях без keychain приложение откатывается на локальный JSON и показывает предупреждение в настройках.

## Возможности

- **Множество AI моделей** — OpenRouter + HuggingFace
- **Браузер бесплатных моделей** — добавление любой бесплатной модели OpenRouter в один клик
- **Голосовой вывод** — 40+ встроенных голосов через Fish Audio TTS
- **Каталог голосов** — поиск и превью голосов перед добавлением
- **Мультиязычный интерфейс** — 5 языков (EN, DE, FR, PT, RU)
- **Поддержка Markdown** — ответы ИИ отображаются с полным форматированием
- **Автонастройка** — OpenRouter OAuth или ручной ввод ключей

---

## Сборка exe/dmg

### Windows

```cmd
pip install pyinstaller && pyinstaller --noconfirm --onedir --windowed --name "AI Assistant" --icon source/static/app_img/icon.ico --add-data "source/templates;templates" --add-data "source/static;static" --add-data "source/translations.py;." --add-data "source/config_manager.py;." --version-file version_info.txt main.py && xcopy /E /I "dist\AI Assistant" "%USERPROFILE%\Desktop\AI Assistant" && echo Done
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

---

## Docker

```bash
# Сборка
docker build -t ai-assistant .

# Запуск
docker run -d -p 5066:5066 --name ai-assistant ai-assistant

# Остановка
docker stop ai-assistant
```

---

## План развития

- **Больше AI провайдеров** — Anthropic, Groq, Together AI и др.
- **Встраивание на сайты** — виджет для сторонних сайтов
- **Память диалогов** — долгосрочный контекст на основе саммари
- **Мульти-сессии** — несколько независимых чат-сессий
- **Система плагинов** — пользовательские инструменты и интеграции
- **Нативное macOS приложение** — standalone .app с нативным UI (за пределами pywebview)
- **Computer Use** — понимание экрана, управление мышью/клавиатурой и браузером

---

## Структура проекта

```
ai_assistant/
├── app.py              # Flask веб-сервер
├── desktop.py          # Десктоп-обёртка (pywebview)
├── test_models.py      # Тестирование моделей
├── config_manager.py   # Управление API ключами и keychain
├── requirements.txt    # Зависимости
├── Dockerfile          # Docker контейнер
├── Makefile            # Команды сборки
├── README.md           # Документация на английском
├── README_RU.md        # Документация на русском
├── templates/          # HTML шаблоны
│   ├── index.html      # Интерфейс чата
│   └── setup.html      # Страница настройки / OAuth
├── static/             # Статические файлы
│   ├── css/style.css
│   ├── js/app.js
│   ├── how_to_add_voice/  # Скриншоты инструкции
│   └── repo images/       # Скриншоты для README
└── build/              # Скрипты сборки
    ├── build_windows.bat
    ├── build_macos.sh
    └── installer.iss
```

---

## Технологии

- **Бэкенд** — Python Flask
- **Фронтенд** — Vanilla JS, CSS custom properties, дизайн-система Aurora Glass
- **Markdown** — marked.js (CDN)
- **TTS** — Fish Audio API
- **STT** — faster-whisper (локально)
- **Безопасность** — системный keychain через `keyring`
- **Web-поиск** — OpenRouter web plugin
- **Десктоп** — pywebview
- **Docker** — multi-stage build

---

## Roadmap / Планы

- [x] **Каталог голосов** — встроенный каталог Fish Audio, превью и добавление в один клик
- [x] **Web-поиск с цитатами** — OpenRouter web plugin и источники в ответе
- [x] **Безопасное хранение ключей** — системный keychain с миграцией из JSON
- [ ] **Computer Use / Управление ПК** — AI видит экран, двигает мышь, нажимает клавиши и управляет браузером. В разработке.
