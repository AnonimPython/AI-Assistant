#! All user data stored in ~/AI Assistant/
#! Все данные пользователя хранятся в ~/AI Assistant/
import json
import os
import platform
import tempfile
import threading
import time
import sys


#* All working files: config, history, voices, agents
#* Все рабочие файлы: конфиг, история, голоса, агенты
_APP_DATA   = os.path.join(os.path.expanduser("~"), "AI Assistant")
CONFIG_DIR  = _APP_DATA
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
HISTORY_FILE = os.path.join(CONFIG_DIR, "history.json")
CUSTOM_VOICES_FILE = os.path.join(CONFIG_DIR, "custom_voices.json")
AGENTS_DIR  = os.path.join(CONFIG_DIR, "agents")

#! Migrate old data/ directory to ~/AI Assistant/ if needed
#! Переносим старую папку data/ в ~/AI Assistant/ если нужно
_OLD_DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
_OLD_DATA = os.path.normpath(_OLD_DATA)
#? Old data found — migrating to new location
#? Найдена старая папка — переносим в новое место
if os.path.isdir(_OLD_DATA) and not os.path.isdir(_APP_DATA):
    import shutil
    shutil.copytree(_OLD_DATA, _APP_DATA)


#? OpenRouter models list — free tier models
#? Список моделей OpenRouter — бесплатные модели
MODELS_OR = [
    {"provider": "openrouter", "id": "inclusionai/ling-3.0-tiny:free", "name": "Ling 3.0 Tiny"},
    {"provider": "openrouter", "id": "poolside/laguna-s-2.1:free", "name": "Laguna S 2.1"},
    {"provider": "openrouter", "id": "poolside/laguna-xs-2.1:free", "name": "Laguna XS 2.1"},
    {"provider": "openrouter", "id": "cohere/north-mini-code:free", "name": "North Mini Code"},
    # {"provider": "openrouter", "id": "qwen/qwen3-next-80b-a3b-instruct:free", "name": "Qwen3 Next 80B"},  # broken
    {"provider": "openrouter", "id": "google/gemma-4-31b-it:free", "name": "Gemma 4 31B"},
    # {"provider": "openrouter", "id": "nousresearch/hermes-3-llama-3.1-405b:free", "name": "Hermes 3 405B"},  # broken
]

#? HuggingFace models list — various providers / все не работают
#? Список моделей HuggingFace — различные провайдеры
MODELS_HF = [
    # {"provider": "huggingface", "id": "deepseek-ai/DeepSeek-V4-Flash:novita", "name": "DeepSeek V4 Flash"},  # broken
    # {"provider": "huggingface", "id": "google/gemma-4-31B-it:novita", "name": "Gemma 4 31B Novita"},  # broken
    # {"provider": "huggingface", "id": "zai-org/GLM-5.2:novita", "name": "GLM 5.2 Novita"},  # broken
    # {"provider": "huggingface", "id": "WeiboAI/VibeThinker-3B:featherless-ai", "name": "VibeThinker 3B"},  # broken
    # {"provider": "huggingface", "id": "openai/gpt-oss-20b:groq", "name": "GPT OSS 20B Groq"},  # broken
    # {"provider": "huggingface", "id": "TinyLlama/TinyLlama-1.1B-Chat-v1.0:featherless-ai", "name": "TinyLlama 1.1B Chat"},  # broken
    # {"provider": "huggingface", "id": "microsoft/Phi-4-mini-instruct:featherless-ai", "name": "Phi 4 Mini Instruct"},  # broken
    # {"provider": "huggingface", "id": "dphn/Dolphin-Mistral-24B-Venice-Edition:featherless-ai", "name": "Dolphin Mistral 24B Venice"},  # broken
    # {"provider": "huggingface", "id": "jinaai/ReaderLM-v2:featherless-ai", "name": "ReaderLM v2"},  # broken
    # {"provider": "huggingface", "id": "Jackrong/Qwopus3.6-27B-Coder:featherless-ai", "name": "Qwopus 3.6 27B Coder"},  # broken
    # {"provider": "huggingface", "id": "anthracite-org/magnum-v4-72b:featherless-ai", "name": "Magnum V4 72B"},  # broken
    # {"provider": "huggingface", "id": "huihui-ai/Huihui-Qwen3-4B-Instruct-2507-abliterated:featherless-ai", "name": "Huihui Qwen3 4B"},  # broken
    # {"provider": "huggingface", "id": "deepreinforce-ai/Ornith-1.0-35B:deepinfra", "name": "Ornith 1.0 35B"},  # broken
]

#* Fish Audio TTS voices — (display_name, reference_id)
#* Голоса Fish Audio TTS — (отображаемое_имя, идентификатор)
VOICES = [
    ("Shinobu — female (RU)", "a96ec9e0b4b54d92988b4eff8a0097c6"),
    ("Gojo Satoru — male (RU)", "c13bf4a09d6b4eec8faf90e4e71782d1"),
    ("Mita (MiSide) — female (RU)", "6dc11f3f67a543f6ad4537a4a347e224"),
    ("Cap Mita (MiSide) (RU)", "ff1ae409865e4c7493db061913d77a79"),
    ("GLaDOS (Portal) RU — female (RU)", "7dcc373dd62f44e490072a73a0b73dc4"),
    ("Johnny Silverhand (v2) — male (RU)", "aded77ddefce489abf1f0f0e07b9cb12"),
    ("Johnny Silverhand — male (RU)", "7ada5bb3bc644efab8ba08a377dc9ec4"),
    ("Anton Chigur (Kriger) — male (RU)", "132720cd273840b1a3af569f91b2ea3f"),
    ("Homelander (The Boys) — male (RU)", "10f399ed80e64739bb0e713416a66d6e"),
    ("Ayanokoji — male (RU)", "b2716eb8c3a14df0bbb4ae5ca4d9d70a"),
    ("Peter Griffin — male (RU)", "946536221be74fd68580abac0fa2bf4f"),
    ("Dominic Toretto — male (RU)", "46a15e20b8434d1a80c45adf2408dac2"),
    ("Marin Kitagawa — female (RU)", "1db1618b6eaf4571ac7db70e20eb6727"),
    ("Jarvis — male (RU)", "3fc339d7c6474b11a221708e2a7b1c4b"),
    ("Wassup ma boy — male (RU)", "4427e53290a04fbca0ec0b2be9487243"),
    ("Morpheus (Matrix) — male (RU)", "e43f5f43e2df470a855dad3e0f2f369b"),
    ("Statham (RU dub) — male (RU)", "2074ed007f0940618f98dd4f9f8ec1f7"),
    ("Рудо — male (RU)", "ae0872ceeba04fe38fed1099fd2b3c0f"),
    ("Мэвис (Отель Монстров) — female (RU)", "02f8eff6783c4fe59a849cc439f250e9"),
    ("Мориарти — male (RU)", "b4b3cd5e89cc4fb682301b43e627d5ef"),
    ("Рик Санчез — male (RU)", "cb92b10e1a5946b9b6bd7391aefe31fe"),
    ("Леон Кенеди — male (RU)", "76df85f264884c3f82cee493c96b7b77"),
    ("Девушка Ru — female (RU)", "287a9a01a5d241a6bccf43f199a89109"),
    ("Эрими Мушибами (Безумный азарт) (RU)", "de7f0dfc640849aca3658ee0b088e628"),
    ("Кубик в кубе (RU)", "2b932e13e5564601a6f5c705cecf36fe"),
    ("Компот (Три кота) (RU)", "ca3728544b0b4964870016337f32c720"),
    ("Брэд Пит «Кузнецов» (RU)", "d9247a00779649adbe7f4fdde2ac11c8"),
    ("Билли Бутчер (RU)", "7be18a8fb05a4f50813d1b7abb055849"),
    ("Ягами Лайт (RU)", "9a2eb495e00c44e480478fc7d6b0eae6"),
    ("Нацуки (Литературный клуб) (RU)", "a8bccf8232f34efba053420030d1bd7a"),
    ("Крош (Смешарики) (RU)", "03863e67737a471181486599d21f4673"),
    ("Девушка Няшка (RU)", "ad6bf3e5383f4319a10b37eca0f57c6b"),
    ("Девушка Няшка 2 (RU)", "3764a6a096d14408af1d49b13633c218"),
    ("Гёкоё (фармацевт) (RU)", "9603781991bc48a098c581227351e96e"),
    ("Яндекс Алиса (RU)", "a8c977dc83f6470ab9e1956cac24d000"),
    ("L (Тетрадь смерти) (RU)", "c82093447f0a44d6b60ee3f23987f2a5"),
    ("Сукуна (RU)", "b90eb1c64fe14c99a614055e7b8bbad6"),
    ("Том Холанд (RU)", "938daa27e39f4ddb9623bf028f4e5eb8"),
    ("Мориарти 2 (RU)", "05ef6fb39281452baf7c62e0ae4fdd95"),
    ("T2x2 (RU)", "de4c390a7e044706874e9a19c5f1b7cc"),
    ("Девушка Няшка 3 (RU)", "0324978b24744588ae5a79b5b8a30466"),
    ("Макима (RU)", "eee040cb2e524e6083df058c34ec6377"),
    ("Сукуна 2 (RU)", "ea6ac651326445899ae1acaa810f523e"),
]


#* Default system prompt — instructs the AI to respond in Russian
#* Системный промпт по умолчанию — указывает ИИ отвечать на русском
SYSTEM_PROMPT = (
    "You are a highly capable, multilingual AI assistant. "
    "Always respond in clear, natural Russian (unless the user writes in another language, then match their language). "
    "Formatting rules:\n"
    "- Do NOT use markdown tables (no |---| or | cells). Use plain lists or short paragraphs instead.\n"
    "- Do NOT use headings (no #, ##, ###, etc.). Use **bold** for emphasis if needed.\n"
    "- Use bullet points (* or -) for lists, not numbered lists unless order matters.\n"
    "- Keep responses well-structured with short paragraphs separated by blank lines.\n"
    "- Be concise but thorough. Answer the user's question directly.\n"
    "- If you need to show data, use simple indented lines or bullet points, never tables."
)





#* Returns links for obtaining API keys
#* Возвращает ссылки для получения API ключей
#? Returns links for obtaining API keys
#? Возвращает ссылки для получения API ключей
def get_links():
    return {
        "openrouter": "https://openrouter.ai/keys",
        "fishaudio": "https://fish.audio/app/developers/",
        "huggingface": "https://huggingface.co/settings/tokens",
    }


#* Writes JSON atomically (temp file + replace) to avoid corrupting data on crash
#* Атомарно пишет JSON (временный файл + replace), чтобы не повредить данные
def _atomic_write_json(path, data, ensure_ascii=False):
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=ensure_ascii)
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


class ConfigManager:
    #! Handles loading/saving of API keys to JSON file
    #! Отвечает за загрузку/сохранение API ключей в JSON файл

    #* Initializes config and loads data from file
    #* Инициализирует конфиг и загружает данные из файла
    def __init__(self):
        self._data = {}
        #? Re-entrant lock protects config/history/voices from concurrent writes
        #? Реентрантный лок защищает конфиг/историю/голоса от гонок записи
        self._lock = threading.RLock()

        self.load()


    @property
    def config_path(self):
        #* Returns the full path to the config file
        #* Возвращает полный путь к файлу конфигурации
        return CONFIG_FILE



    def ensure_dir(self):
        #* Creates config directory + agents/ subdirectory if they don't exist
        #* Создаёт директорию конфигурации + подпапку agents/, если их нет
        os.makedirs(CONFIG_DIR, exist_ok=True)
        os.makedirs(AGENTS_DIR, exist_ok=True)


    def load(self):
        #* Loads config from JSON file into memory
        #* Загружает конфигурацию из JSON файла в память
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r") as f:
                    self._data = json.load(f)

            except (json.JSONDecodeError, IOError):
                #! If file is corrupted, start with empty config
                #! Если файл повреждён, начинаем с пустой конфигурации
                self._data = {}
        else:
            self._data = {}



    def save(self, or_key="", fish_key="", hf_key=""):
        #* Saves API keys to config file
        #* Сохраняет API ключи в файл конфигурации
        with self._lock:
            self.ensure_dir()
            # Store non-empty keys only / Сохраняем только непустые ключи
            if or_key:
                self._data["or_key"] = or_key.strip()
            if fish_key:
                self._data["fish_key"] = fish_key.strip()
            if hf_key:
                self._data["hf_key"] = hf_key.strip()

            self._data["configured"] = True
            self._save_config()


    #* Checks if the app has been configured with API keys
    #* Проверяет, настроено ли приложение с API ключами
    def is_configured(self):
        #? Checks if the app has been configured with API keys
        #? Проверяет, настроено ли приложение с API ключами
        return self._data.get("configured", False)


    #* Returns the OpenRouter API key
    #* Возвращает API ключ OpenRouter
    def get_or_key(self):
        return self._data.get("or_key", "")

    #* Returns the Fish Audio API key
    #* Возвращает API ключ Fish Audio
    def get_fish_key(self):
        return self._data.get("fish_key", "")

    #* Returns the chat history limit (number of saved messages)
    #* Возвращает лимит истории чата (количество сохранённых сообщений)
    def get_history_limit(self):
        return self._data.get("history_limit", 10)

    #* Sets the chat history limit (clamped between 1 and 50)
    #* Устанавливает лимит истории чата (ограничение от 1 до 50)
    def set_history_limit(self, n):
        # Clamp between 1 and 50 / Ограничение от 1 до 50
        with self._lock:
            self._data["history_limit"] = max(1, min(int(n), 50))
            self._save_config()

    #* Returns the HuggingFace API key
    #* Возвращает API ключ HuggingFace
    def get_hf_key(self):
        return self._data.get("hf_key", "")


    #* Returns the current system prompt (falls back to default)
    #* Возвращает текущий системный промпт (по умолчанию)
    def get_system_prompt(self):
        return self._data.get("system_prompt", SYSTEM_PROMPT)

    #* Saves a custom system prompt to config
    #* Сохраняет кастомный системный промпт в конфиг
    def set_system_prompt(self, prompt):
        self._data["system_prompt"] = prompt.strip()
        self._save_config()




    def get_models(self):
        #* Returns combined list of all models (OpenRouter + custom + HuggingFace)
        #* Возвращает объединённый список всех моделей (OpenRouter + кастомные + HuggingFace)
        custom = self.get_custom_models()
        return MODELS_OR + custom + MODELS_HF


    def get_custom_models(self):
        #* Returns user-added custom OpenRouter models from config
        #* Возвращает кастомные модели OpenRouter, добавленные пользователем
        return self._data.get("custom_models", [])


    def add_custom_model(self, model_id, name=None):
        #* Adds a model ID to the custom models list and persists
        #* Добавляет ID модели в список кастомных и сохраняет
        model_id = (model_id or "").strip()
        if not model_id:
            return False
        #* Prefer a human-readable name from the browse list; otherwise derive
        #* it from the last segment: "hy3:free" from "tencent/hy3:free".
        #* Предпочитаем человекочитаемое имя из списка; иначе берём последний
        #* сегмент: "hy3:free" из "tencent/hy3:free".
        display = (name or "").strip() or (
            model_id.rsplit("/", 1)[-1] if "/" in model_id else model_id
        )
        with self._lock:
            if any(m["id"] == model_id for m in self.get_models()):
                return False
            models = self.get_custom_models()
            models.append({
                "provider": "openrouter",
                "id": model_id,
                "name": display,
            })
            self._data["custom_models"] = models
            self._save_config()
        return True


    def remove_custom_model(self, model_id):
        #* Removes a model ID from the custom models list and persists
        #* Удаляет ID модели из списка кастомных и сохраняет
        with self._lock:
            models = self.get_custom_models()
            self._data["custom_models"] = [m for m in models if m["id"] != model_id]
            self._save_config()


    def get_voices(self):
        #* Returns built-in voices merged with user-added custom voices
        #* Возвращает встроенные голоса + добавленные пользователем
        custom = self.get_custom_voices()
        return VOICES + custom


    @staticmethod
    def parse_voice_url(url):
        #* Extracts voice ID from Fish Audio URL like https://fish.audio/voices/<id>/
        #* Извлекает ID голоса из Fish Audio URL вида https://fish.audio/voices/<id>/
        #* Example: parse_voice_url("https://fish.audio/voices/a96ec9e0b4b54d92988b4eff8a0097c6/") → "a96ec9e0b4b54d92988b4eff8a0097c6"
        #* Пример: parse_voice_url("https://fish.audio/voices/a96ec9e0b4b54d92988b4eff8a0097c6/") → "a96ec9e0b4b54d92988b4eff8a0097c6"
        url = url.strip().rstrip("/")
        #? If it's already just a plain ID (alphanumeric + dashes)
        #? Если это уже просто ID (буквы, цифры, дефисы)
        import re
        m = re.search(r"/([a-f0-9]{32})$", url)
        if m:
            return m.group(1)
        m = re.search(r"/([a-f0-9]{32})/", url + "/")
        if m:
            return m.group(1)
        #? If it looks like a raw UUID-like string, return as-is
        #? Если похоже на сырой UUID-подобный ID, возвращаем как есть
        if re.match(r"^[a-f0-9\-]{30,}$", url, re.IGNORECASE):
            return url
        return None


    def get_custom_voices(self):
        #* Loads user-added voices from custom_voices.json
        #* Загружает добавленные пользователем голоса из custom_voices.json
        if os.path.exists(CUSTOM_VOICES_FILE):
            try:
                with open(CUSTOM_VOICES_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return []
        return []


    def add_custom_voice(self, name, voice_id):
        #* Saves a new user-added voice
        #* Сохраняет новый голос, добавленный пользователем
        with self._lock:
            self.ensure_dir()
            voices = self.get_custom_voices()
            #? Avoid duplicates by voice_id
            #? Избегаем дубликатов по voice_id
            for i, (n, vid) in enumerate(voices):  # Scan existing voices; replace entry if ID matches / Сканируем; заменяем если ID совпадает
                if vid == voice_id:
                    voices[i] = [name, voice_id]
                    break
            else:
                voices.append([name, voice_id])
            _atomic_write_json(CUSTOM_VOICES_FILE, voices)


    #* Deletes a user-added voice by its ID
    #* Удаляет добавленный пользователем голос по ID
    def remove_custom_voice(self, voice_id):
        with self._lock:
            self.ensure_dir()
            voices = self.get_custom_voices()
            voices = [v for v in voices if v[1] != voice_id]
            _atomic_write_json(CUSTOM_VOICES_FILE, voices)


    def get_lang(self):
        #* Returns current language code, default "ru"
        #* Возвращает текущий код языка, по умолчанию "ru"
        lang = self._data.get("lang", "ru")
        #* Fall back safely if an old/unsupported language code is stored
        #* Безопасно откатываемся, если сохранён старый/неподдерживаемый код
        return lang if lang in ("en", "de", "fr", "pt", "ru") else "ru"


    def set_lang(self, lang):
        #* Saves language preference to config
        #* Сохраняет выбранный язык в конфиг
        if lang in ("en", "de", "fr", "pt", "ru"):
            self._data["lang"] = lang
            self._save_config()


    def get_check_updates(self):
        #* Returns whether update checks are enabled (default True)
        #* Возвращает, включена ли проверка обновлений (по умолчанию True)
        return self._data.get("check_updates", True)

    def set_check_updates(self, enabled):
        #* Saves update check preference to config
        #* Сохраняет настройку проверки обновлений в конфиг
        self._data["check_updates"] = bool(enabled)
        self._save_config()

    def get_theme(self):
        #* Returns current theme name, default "dark-purple"
        #* Возвращает название текущей темы, по умолчанию "dark-purple"
        return self._data.get("theme", "dark-purple")


    def set_theme(self, theme):
        #* Saves theme preference to config
        #* Сохраняет выбранную тему в конфиг
        # Validate theme name / Проверяем название темы
        valid = ("dark-purple", "dark-red", "dark-green", "dark-blue", "dark-orange", "dark-pink", "dark-cyan",
                 "dark-amber", "dark-slate", "dark-rose", "dark-indigo", "dark-lime",
                 "dark-black", "light-white", "bw")
        if theme in valid:
            self._data["theme"] = theme
            self._save_config()




    def _save_config(self):
        #* Writes current config to file
        #* Записывает текущую конфигурацию в файл
        with self._lock:
            self.ensure_dir()
            _atomic_write_json(CONFIG_FILE, self._data, ensure_ascii=False)



    def get_history(self):
        #* Loads chat history from history.json
        #* Загружает историю чата из history.json
        if os.path.exists(HISTORY_FILE):
            try:
                with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return []
        return []



    def save_history(self, messages):
        #* Saves chat messages to history.json
        #* Сохраняет сообщения чата в history.json
        with self._lock:
            self.ensure_dir()
            _atomic_write_json(HISTORY_FILE, messages)


    def add_to_history(self, role, content):
        #* Appends a single message to history (read-modify-write under lock)
        #* Добавляет одно сообщение в историю (чтение-изменение-запись под локом)
        with self._lock:
            history = self.get_history()
            history.append({
                "role": role,
                "content": content,
                "timestamp": time.time()
            })
            self.save_history(history)



    #! Deletes all chat history
    #! Удаляет всю историю чата
    def clear_history(self):
        with self._lock:
            if os.path.exists(HISTORY_FILE):
                os.remove(HISTORY_FILE)



    #! WARNING: Deletes the config file and resets all settings
    #! ВНИМАНИЕ: Удаляет файл конфигурации и сбрасывает все настройки
    def reset(self):
        with self._lock:
            if os.path.exists(CONFIG_FILE):
                os.remove(CONFIG_FILE)
            self._data = {}
