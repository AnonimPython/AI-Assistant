#! All user data stored in ~/AI Assistant/
#! Все данные пользователя хранятся в ~/AI Assistant/
import json
import os
import platform
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
    {"provider": "openrouter", "id": "poolside/laguna-xs-2.1:free", "name": "Laguna XS 2.1"},
    {"provider": "openrouter", "id": "cohere/north-mini-code:free",      "name": "North Mini Code"},
    {"provider": "openrouter", "id": "qwen/qwen3-next-80b-a3b-instruct:free", "name": "Qwen3 Next 80B"},
    {"provider": "openrouter", "id": "google/gemma-4-31b-it:free",   "name": "Gemma 4 31B"},
    {"provider": "openrouter",   "id": "nousresearch/hermes-3-llama-3.1-405b:free", "name": "Hermes 3 405B"},
]

#? HuggingFace models list — various providers
#? Список моделей HuggingFace — различные провайдеры
MODELS_HF = [
    {"provider": "huggingface",  "id": "deepseek-ai/DeepSeek-V4-Flash:novita", "name": "DeepSeek V4 Flash"},
    {"provider": "huggingface", "id": "google/gemma-4-31B-it:novita",       "name": "Gemma 4 31B Novita"},
    {"provider": "huggingface", "id": "zai-org/GLM-5.2:novita",         "name": "GLM 5.2 Novita"},
    {"provider":   "huggingface", "id": "WeiboAI/VibeThinker-3B:featherless-ai", "name": "VibeThinker 3B"},
    {"provider": "huggingface", "id": "openai/gpt-oss-20b:groq",     "name": "GPT OSS 20B Groq"},
    {"provider": "huggingface",  "id": "TinyLlama/TinyLlama-1.1B-Chat-v1.0:featherless-ai", "name": "TinyLlama 1.1B Chat"},
    {"provider": "huggingface", "id": "microsoft/Phi-4-mini-instruct:featherless-ai", "name": "Phi 4 Mini Instruct"},
    {"provider": "huggingface", "id": "dphn/Dolphin-Mistral-24B-Venice-Edition:featherless-ai", "name": "Dolphin Mistral 24B Venice"},
    {"provider":"huggingface", "id": "jinaai/ReaderLM-v2:featherless-ai", "name": "ReaderLM v2"},
    {"provider": "huggingface", "id": "Jackrong/Qwopus3.6-27B-Coder:featherless-ai", "name": "Qwopus 3.6 27B Coder"},
    {"provider": "huggingface", "id": "anthracite-org/magnum-v4-72b:featherless-ai",    "name": "Magnum V4 72B"},
    {"provider": "huggingface", "id": "huihui-ai/Huihui-Qwen3-4B-Instruct-2507-abliterated:featherless-ai", "name": "Huihui Qwen3 4B"},
    {"provider": "huggingface", "id": "deepreinforce-ai/Ornith-1.0-35B:deepinfra", "name": "Ornith 1.0 35B"},
]

#* Fish Audio TTS voices — (display_name, reference_id)
#* Голоса Fish Audio TTS — (отображаемое_имя, идентификатор)
VOICES = [
    ("Shinobu (RU) — female", "a96ec9e0b4b54d92988b4eff8a0097c6"),
    ("Gojo Satoru (RU) — male", "c13bf4a09d6b4eec8faf90e4e71782d1"),
    ("Mita (MiSide) — female (RU)", "6dc11f3f67a543f6ad4537a4a347e224"),
    ("Cap Mita (MiSide)", "ff1ae409865e4c7493db061913d77a79"),
    ("GLaDOS (Portal) RU — female", "7dcc373dd62f44e490072a73a0b73dc4"),
    ("Johnny Silverhand (v2) — male", "aded77ddefce489abf1f0f0e07b9cb12"),
    ("Johnny Silverhand — male", "7ada5bb3bc644efab8ba08a377dc9ec4"),
    ("Anton Chigur (Kriger) — male", "132720cd273840b1a3af569f91b2ea3f"),
    ("Homelander (The Boys) — male", "10f399ed80e64739bb0e713416a66d6e"),
    ("Ayanokoji (RU) — male", "b2716eb8c3a14df0bbb4ae5ca4d9d70a"),
    ("Peter Griffin — male", "946536221be74fd68580abac0fa2bf4f"),
    ("Dominic Toretto — male", "46a15e20b8434d1a80c45adf2408dac2"),
    ("Marin Kitagawa — female", "1db1618b6eaf4571ac7db70e20eb6727"),
    ("Jarvis — male", "3fc339d7c6474b11a221708e2a7b1c4b"),
    ("Wassup ma boy — male", "4427e53290a04fbca0ec0b2be9487243"),
    ("Morpheus (Matrix) — male", "e43f5f43e2df470a855dad3e0f2f369b"),
    ("Statham (RU dub) — male", "2074ed007f0940618f98dd4f9f8ec1f7"),
]


#* Default system prompt — instructs the AI to respond in Russian
#* Системный промпт по умолчанию — указывает ИИ отвечать на русском
SYSTEM_PROMPT = "You are a helpful assistant. Always respond in Russian."



#* Returns links for obtaining API keys
#* Возвращает ссылки для получения API ключей
#? Returns links for obtaining API keys
#? Возвращает ссылки для получения API ключей
def get_links():
    return {
        "openrouter": "https://openrouter.ai/keys",
        "fishaudio": "https://fish.audio/",
        "huggingface": "https://huggingface.co/settings/tokens",
    }


class ConfigManager:
    #! Handles loading/saving of API keys to JSON file
    #! Отвечает за загрузку/сохранение API ключей в JSON файл

    #* Initializes config and loads data from file
    #* Инициализирует конфиг и загружает данные из файла
    def __init__(self):
        self._data = {}

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
        self.ensure_dir()
        # Store non-empty keys only / Сохраняем только непустые ключи
        if or_key:
            self._data["or_key"] = or_key.strip()
        if fish_key:
            self._data["fish_key"] = fish_key.strip()
        if hf_key:
            self._data["hf_key"] = hf_key.strip()

        self._data["configured"] = True
        with open(CONFIG_FILE, "w") as f:
            json.dump(self._data, f, indent=2)


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
        self._data["history_limit"] = max(1, min(int(n), 50))
        self.ensure_dir()
        with open(CONFIG_FILE, "w") as f:
            json.dump(self._data, f, indent=2)

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
        #* Returns combined list of all models (OpenRouter + HuggingFace)
        #* Возвращает объединённый список всех моделей
        return MODELS_OR + MODELS_HF


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
        with open(CUSTOM_VOICES_FILE, "w", encoding="utf-8") as f:
            json.dump(voices, f, indent=2, ensure_ascii=False)


    #* Deletes a user-added voice by its ID
    #* Удаляет добавленный пользователем голос по ID
    def remove_custom_voice(self, voice_id):
        #! Deletes a user-added voice by its ID
        #! Удаляет добавленный пользователем голос по ID
        voices = self.get_custom_voices()
        voices = [v for v in voices if v[1] != voice_id]
        self.ensure_dir()
        with open(CUSTOM_VOICES_FILE, "w", encoding="utf-8") as f:
            json.dump(voices, f, indent=2, ensure_ascii=False)


    def get_lang(self):
        #* Returns current language code, default "ru"
        #* Возвращает текущий код языка, по умолчанию "ru"
        return self._data.get("lang", "ru")


    def set_lang(self, lang):
        #* Saves language preference to config
        #* Сохраняет выбранный язык в конфиг
        if lang in ("en", "de", "fr", "sr", "ru"):
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
        self.ensure_dir()
        with open(CONFIG_FILE, "w") as f:
            json.dump(self._data, f, indent=2)



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
        self.ensure_dir()
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(messages, f, indent=2, ensure_ascii=False)


    def add_to_history(self, role, content):
        #* Appends a single message to history
        #* Добавляет одно сообщение в историю
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
        #! Deletes all chat history
        #! Удаляет всю историю чата
        if os.path.exists(HISTORY_FILE):
            os.remove(HISTORY_FILE)



    #! WARNING: Deletes the config file and resets all settings
    #! ВНИМАНИЕ: Удаляет файл конфигурации и сбрасывает все настройки
    def reset(self):
        #! WARNING: Deletes the config file and resets all settings
        #! ВНИМАНИЕ: Удаляет файл конфигурации и сбрасывает все настройки
        if os.path.exists(CONFIG_FILE):
            os.remove(CONFIG_FILE)
        self._data = {}
