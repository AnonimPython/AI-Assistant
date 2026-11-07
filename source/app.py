#* Flask web server for AI Assistant
#* Веб-сервер на Flask для AI ассистента
from flask import Flask, render_template, request, jsonify, redirect, url_for, Response
import requests
import json
import base64
import os
import re
import sys
import io
import zipfile
import shutil
import tempfile
import traceback
import fitz
import docx
import time
import threading
import concurrent.futures
import ipaddress
import socket
import datetime
import secrets
import hashlib
from urllib.parse import urlparse, urlencode

from config_manager import ConfigManager, get_links, SYSTEM_PROMPT
from translations import T
from desktop_actions import execute_command
app  = Flask(__name__)
config = ConfigManager()


#* Desktop-commands documentation appended to the system prompt so the AI
#* knows it can control the computer. The AI emits special ⟦...⟧ tokens,
#* the server executes them and replaces them with a short confirmation.
#* Документация команд управления компьютером, добавляемая в системный
#* промпт, чтобы ИИ умел управлять ПК. ИИ выдаёт токены ⟦...⟧, сервер
#* выполняет их и заменяет коротким подтверждением.
COMMANDS_DOC = (
    "\n\nYou can also control the user's computer. "
    "When the user asks you to perform one of the actions below, include the matching "
    "command token exactly as written (instead of describing it in words), then add a "
    "short confirmation sentence in words. Never wrap a token in code formatting. "
    "You may use more than one token. Only act when the user explicitly asks:\n"
    "- Open a website: ⟦open:<url-or-site-name>⟧  — translate site names to URLs yourself "
    "(e.g. \"ютуб\"→https://youtube.com, \"github\"→https://github.com).\n"
    "- Search the web: ⟦search:<query>⟧\n"
    "- Search images: ⟦images:<query>⟧  — use when the user asks to find or show a photo, picture or image; keep only the essential search terms.\n"
    "- Minimize/hide all windows (show desktop): ⟦minimize_all⟧"
)


def _system_prompt():
    #* Returns the user system prompt plus the desktop-commands documentation
    #* Возвращает системный промпт пользователя плюс документацию команд ПК
    prompt = config.get_system_prompt()
    #* When the user has not customized the prompt, use the UI language default
    #* Если пользователь не менял промпт, берём вариант на языке интерфейса
    if prompt == SYSTEM_PROMPT:
        lang = config.get_lang()
        prompt = T.get(lang, T["en"]).get("system_prompt_default", prompt)
    return prompt + COMMANDS_DOC


#* Regex for command tokens: ⟦kind:value⟧ or ⟦kind⟧
#* Регулярка для токенов команд: ⟦тип:значение⟧ или ⟦тип⟧
CMD_RE = re.compile(r'⟦(open|search|images|minimize_all)(?::([^⟧]*))?⟧', re.DOTALL)

IMAGE_WORD_RE = re.compile(
    r'(?i)\b(фото(?:графи\w*)?|фотк\w*|картин\w*|изображен\w*|'
    r'photo(?:graph\w*)?s?|pictures?|images?|pics?)\b'
)
FIND_WORD_RE = re.compile(
    r'(?i)\b(найд\w*|найти|покаж\w*|поищ\w*|подбер\w*|скин\w*|кин\w*|'
    r'пришл\w*|дай|хочу|хотел\w*|find|show|search|get|look for|send|give)\b'
)
WEB_INTENT_RE = re.compile(
    r'(?i)(погугл\w*|загугл\w*|поищ\w*\s+в\s+интернете|найд\w*\s+в\s+интернете|'
    r'поиск\w*\s+в\s+интернете|search\s+(the\s+)?web|search\s+online|look\s+up|'
    r'latest|current|today|новост\w*|последн\w*|сегодня|курс\w*|погод\w*|'
    r'what\s+is\s+happening|breaking)'
)


def _wants_images(message):
    return bool(IMAGE_WORD_RE.search(message or "") and FIND_WORD_RE.search(message or ""))


def _image_query(message):
    query = (message or "").strip()
    query = re.sub(r'(?i)^(пожалуйста[,\s]*|please[,\s]*)', '', query)
    query = re.sub(
        r'(?i)\b(найди|найти|покажи|показать|поищи|подбери|скинь|кинь|пришли|'
        r'дай|хочу|хотел\w*|мне|пожалуйста|find|show|search\s+for|look\s+for|'
        r'get|me|send|give)\b',
        ' ', query,
    )
    query = re.sub(
        r'(?i)\b(a|an|the)\s+(photo|picture|image|pic)\s+of\b',
        ' ', query,
    )
    query = re.sub(
        r'(?i)\b(photo|picture|image|pic)\s+of\b',
        ' ', query,
    )
    query = re.sub(
        r'(?i)\b(фотографию|фотография|фотографии|фотографий|фото|фотку|фотка|'
        r'картинку|картинка|картинки|изображение|изображения|'
        r'photos?|pictures?|images?|pics?)\b',
        ' ', query,
    )
    query = re.sub(
        r'(?i)\b(в\s+интернете|в\s+браузере|онлайн|on\s+the\s+web|online|'
        r'in\s+the\s+internet)\b',
        ' ', query,
    )
    query = re.sub(r'\s+', ' ', query).strip(' .,;:!?-')
    return query or (message or "").strip()


def _wants_web_search(message):
    return bool(WEB_INTENT_RE.search(message or ""))


def _cmd_msg(kind, ok, detail):
    #* Builds a short localized confirmation/error for an executed command
    #* Формирует короткое локализованное подтверждение/ошибку для команды
    if kind == "open":
        return t("cmd_open") + ": " + detail if ok else t("cmd_open_fail") + ": " + detail
    if kind == "search":
        return t("cmd_search") + ' "' + detail + '".' if ok else t("cmd_search_fail")
    if kind == "images":
        return t("cmd_images") + ' "' + detail + '".' if ok else t("cmd_images_fail")
    if kind == "minimize_all":
        return t("cmd_minimize") if ok else t("cmd_minimize_fail")
    return ""


def _execute_commands(text, prefer_images=False, return_meta=False):
    #* Finds command tokens in the AI reply, executes each action and replaces
    #* the token with a short confirmation. Returns the new reply text.
    #* Находит токены команд в ответе ИИ, выполняет действие и заменяет токен
    #* коротким подтверждением. Возвращает новый текст ответа.
    executed = []
    if not text or not CMD_RE.search(text):
        return (text, executed) if return_meta else text
    def repl(m):
        kind   = m.group(1)
        value  = (m.group(2) or "").strip()
        if kind == "search" and prefer_images:
            kind = "images"
        try:
            ok, detail = execute_command(kind, value)
        except Exception as ex:
            ok, detail = False, str(ex)[:80]
        executed.append(kind)
        return " " + _cmd_msg(kind, ok, detail) + " "
    text = CMD_RE.sub(repl, text)
    #? Collapse horizontal whitespace only, keep paragraph breaks intact
    #? Схлопываем только горизонтальные пробелы, сохраняя переносы строк
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()
    return (text, executed) if return_meta else text

#* Extract text from attached files (PDF, DOCX, TXT) / Извлекает текст из прикреплённых файлов
#* Возвращает список строк вида "Attached file 'name':\n```\ntext\n```"
def extract_files_text(files):
    parts = []
    for f in (files or []):
        name = f.get("name", "file")
        data_b64 = f.get("data", "")
        if not data_b64:
            continue
        try:
            raw = base64.b64decode(data_b64)
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            text = ""
            if ext == "pdf":
                pdf = fitz.open(stream=raw, filetype="pdf")
                text = "\n".join(page.get_text() for page in pdf)
            elif ext == "docx":
                doc = docx.Document(io.BytesIO(raw))
                text = "\n".join(p.text for p in doc.paragraphs)
            else:
                text = raw.decode("utf-8", errors="replace")
            parts.append(f"--- Attached file '{name}':\n```\n{text}\n```")
        except Exception as ex:
            parts.append(f"--- Attached file '{name}':\n```\n[Error reading file: {ex}]\n```")
    return parts


VERSION     = "2.0.0"

OPENROUTER_AUTH_URL = "https://openrouter.ai/auth"
OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/auth/keys"
_oauth_pending = {}
REPO_OWNER  = "AnonimPython"
REPO_NAME   = "AI-Assistant"
GITHUB_API  = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest"


#* Parses a version string into a padded comparable tuple, e.g. "1.2.3" → (1, 2, 3, 0)
#* Парсит версию в дополненный сравнимый кортеж, напр. "1.2.3" → (1, 2, 3, 0)
def _parse_version(v):
    parts = re.split(r"[._-]", (v or "").lstrip("v"))
    nums = tuple(int(p) for p in parts if p.isdigit()) or (0,)
    #* Pad to 4 components so "1.0" and "1.0.0" compare as equal
    #* Дополняем до 4 компонентов, чтобы "1.0" и "1.0.0" были равны
    return nums + (0,) * max(0, 4 - len(nums))


def t(key):
    #* Returns translated string for current language
    #* Возвращает переведённую строку для текущего языка
    # Example: t("save") → "Save" / "Сохранить"
    # Пример: t("save") → "Save" / "Сохранить"
    lang = config.get_lang()
    return T.get(lang, T["ru"]).get(key, key)


#* Strips reasoning tags (think, ˇthink, ˇthinkˇ, etc.) from AI responses
#* Удаляет теги рассуждений (think, ˇthink, ˇthinkˇ и т.д.) из ответов ИИ

def _clean_reply(text):
    #? Remove various reasoning/thinking tags from AI responses
    #? Удаляем различные теги рассуждений из ответов ИИ
    # Example: _clean_reply("Hi <think>hmm</think> there") → "Hi there"
    # Пример: _clean_reply("Hi <think>hmm</think> there") → "Hi there"
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL | re.IGNORECASE)
    #? Also strip lone opening/closing tags without content
    #? Также удаляем одиночные открывающие/закрывающие теги
    text = re.sub(r'</?think>', '', text, flags=re.IGNORECASE)
    return text.strip()


def _extract_citations(message_data):
    #* Pulls unique HTTP(S) citations from an OpenRouter message
    #* Извлекает уникальные HTTP(S)-цитаты из сообщения OpenRouter
    sources = []
    seen = set()
    for ann in (message_data.get("annotations") or []):
        if ann.get("type") != "url_citation":
            continue
        citation = ann.get("url_citation") or {}
        url = (citation.get("url") or "").strip()
        if not url or url in seen:
            continue
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            continue
        title = (citation.get("title") or parsed.netloc or url).strip()
        title = title.replace("[", "(").replace("]", ")")
        seen.add(url)
        sources.append((title, url))
    return sources


def _append_sources(content, message_data):
    #* Appends a compact, clickable source list to a grounded answer
    #* Добавляет компактный список ссылок к ответу с web-поиском
    sources = _extract_citations(message_data)
    if not sources:
        return content
    lang = config.get_lang()
    label = T.get(lang, T["en"]).get("web_sources", "Sources")
    lines = [f"\n\n**{label}:**"]
    for title, url in sources[:6]:
        lines.append(f"- [{title}]({url})")
    return content.rstrip() + "\n".join(lines)


#! Calls OpenRouter API — requires valid API key
#! Вызов OpenRouter API — требуется валидный API ключ
def _call_openrouter(model_id, message, history=None, use_web=False):
    limit = config.get_history_limit()
    sp = _system_prompt()
    messages = [{"role": "system", "content": sp}]
    if history:
        for h in history[-(limit):]:  # Walk recent history to build message context
            if h["role"] in ("user", "assistant"):
                messages.append({"role": h["role"], "content": h["content"]})
    else:
        messages.append({"role": "user", "content": message})
    r = requests.post(
        url="https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {config.get_or_key()}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/evgenijlevin/ai_assistant",
            "X-OpenRouter-Title": "AI Assistant",
        },
        data=json.dumps({
            "model": model_id,
            "messages": messages,
            "max_tokens": 4096,
            **({"plugins": [{"id": "web", "max_results": 5}]} if use_web else {}),
        }),
        timeout=60 if use_web else 45,
    )
    if r.status_code != 200:
        err = "AI error"
        try:
            err_data = r.json().get("error", {})
            err = err_data.get("message", r.text)
        except Exception:
            err = r.text
        raise Exception(f"{err}\n\nTry a different model or check your OpenRouter balance.")

    raw = r.json()
    if "choices" not in raw or not raw["choices"]:  # Validate response structure from model
        raise Exception(f"Empty response from model. Try a different model.\n\n{raw.get('error', {}).get('message', '')}")

    msg_data = raw["choices"][0].get("message", {})
    content  = msg_data.get("content") or msg_data.get("reasoning") or ""
    if use_web:
        content = _append_sources(content, msg_data)

    return content

# Example: _call_openrouter("gpt-4", "Hello") → returns AI response text
# Пример: _call_openrouter("gpt-4", "Привет") → возвращает текст ответа ИИ

#* Streaming version of OpenRouter call — yields tokens one by one
#* Стрим-версия вызова OpenRouter — отдаёт токены по одному
# Example: for token in _call_openrouter_stream("gpt-4", "Hi"): print(token)
# Пример: for token in _call_openrouter_stream("gpt-4", "Привет"): print(token)
def _call_openrouter_stream(model_id, message, history=None):
    limit = config.get_history_limit()
    sp = _system_prompt()
    messages = [{"role": "system", "content": sp}]
    if history:
        for h in history[-(limit):]:  # Walk recent history to build message context
            if h["role"] in ("user", "assistant"):
                messages.append({"role": h["role"], "content": h["content"]})
    else:
        messages.append({"role": "user", "content": message})
    r = requests.post(
        url="https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {config.get_or_key()}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/evgenijlevin/ai_assistant",
            "X-OpenRouter-Title": "AI Assistant",
        },
        data=json.dumps({
            "model": model_id,
            "messages": messages,
            "max_tokens": 4096,
            "stream": True,
        }),
        timeout=45,
        stream=True,
    )
    if r.status_code != 200:
        err = "AI error"
        try:
            err_data = r.json().get("error", {})
            err = err_data.get("message", r.text)
        except Exception:
            err = r.text
        raise Exception(f"{err}\n\nTry a different model or check your OpenRouter balance.")

    for line in r.iter_lines():  # Read each line from the SSE stream
        if not line:
            continue
        line = line.decode("utf-8")
        if line.startswith("data: "):
            data_str = line[6:].strip()
            if data_str == "[DONE]":
                break
            try:
                chunk = json.loads(data_str)
                if "choices" in chunk and len(chunk["choices"]) > 0:
                    delta = chunk["choices"][0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        yield content
            except json.JSONDecodeError:
                continue


#! Calls HuggingFace Inference API — may return 503 while model loads
#! Вызов HuggingFace Inference API — может вернуть 503 пока модель загружается
def _call_huggingface(model_id, message, history=None):
    hf_token = config.get_hf_key()
    api_url = f"https://router.huggingface.co/hf-inference/models/{model_id}"

    limit = config.get_history_limit()
    sp = _system_prompt()
    prompt = f"<|system|>\n{sp}\n"
    if history:
        for h in history[-(limit):]:  # Walk recent history to build conversation prompt
            if h["role"] == "user":
                prompt += f"<|user|>\n{h['content']}\n"
            elif h["role"] == "assistant":
                prompt += f"<|assistant|>\n{h['content']}\n"
    prompt += "<|assistant|>\n"

    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 4096,
            "return_full_text": False,
        }
    }

    r = requests.post(
        api_url,
        headers={"Authorization": f"Bearer {hf_token}", "Content-Type": "application/json"},
        json=payload,
        timeout=45,
    )

    if r.status_code == 200:
        result = r.json()
        if isinstance(result, list) and len(result) > 0:
            return result[0].get("generated_text", str(result))
        if isinstance(result, dict) and "generated_text" in result:
            return result["generated_text"]
        return str(result)

    if r.status_code == 503:
        return "Model is loading, please try again later."

    err_text = r.text
    try:
        err_text = r.json().get("error", r.text)
    except Exception:
        pass
    raise Exception(f"HuggingFace error: {err_text}")

# Example: _call_huggingface("mistralai/Mistral-7B", "Hello") → AI response text
# Пример: _call_huggingface("mistralai/Mistral-7B", "Привет") → текст ответа ИИ



#* Prepares text for TTS: drops code blocks, inline code and markdown noise,
#* so the voice reads only natural speech — never code or syntax garbage.
#* Готовит текст для озвучки: убирает блоки кода, инлайн-код и разметку,
#* чтобы голос читал только связную речь, а не код и символы.
def _strip_md(text):
    if not text:
        return ""
    #? Remove fenced code blocks completely (never read code aloud)
    #? Полностью убираем блоки кода (код не озвучиваем)
    text = re.sub(r'```[\s\S]*?```', ' ', text)
    text = re.sub(r'^```.*$', ' ', text, flags=re.MULTILINE)   # stray fences
    #? Inline code: keep only short word-like tokens (pip install, file.py),
    #? drop long or symbol-heavy snippets that the voice would mangle.
    #? Инлайн-код: оставляем только короткие слова, длинные/символьные куски выкидываем.
    def _inline(m):
        s = m.group(1).strip()
        if 0 < len(s) <= 40 and re.fullmatch(r'[\w\-.,/\\ :]+', s, flags=re.UNICODE):
            return s
        return ' '
    text = re.sub(r'`([^`]+)`', _inline, text)
    #? Markdown cleanup / Очистка markdown-разметки
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'(\*{1,3}|_{1,3})(.*?)\1', r'\2', text)
    text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'!\[([^\]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'^(?:---|\*\*\*|___)\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^[\s]*[-*+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^[\s]*\d+\.\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^>\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^[\s]*\|[\s\-:|]+\|[\s\-:|]*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'~~(.*?)~~', r'\1', text)
    text = re.sub(r'https?://\S+', ' ', text)
    #? Neutralize code-typical symbols so they don't break prosody / intonation
    #? Нейтрализуем типичные для кода символы, чтобы не ломать интонацию
    text = re.sub(r'[(){}\[\]<>=;:|`~^*]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

#* Converts text to speech via Fish Audio API, returns base64 WAV
#* Преобразует текст в речь через Fish Audio API, возвращает WAV в base64
# Example: _call_tts("Hello world", "some_voice_id") → base64-encoded WAV string
# Пример: _call_tts("Привет мир", "some_voice_id") → строка WAV в base64
def _call_tts(text, voice_id):
    text = _strip_md(text)  # Clean markdown before TTS
    #? Nothing speakable left (e.g. the answer is pure code) → skip voice entirely
    #? Говорить нечего (например, ответ — сплошной код) → не озвучиваем вообще
    if not text or len(text) < 10:
        return None
    #? Cap length at a sentence boundary so speech stays smooth and quick
    #? Ограничиваем длину по границе предложения, чтобы речь была плавной и быстрой
    MAX_TTS = 1600
    if len(text) > MAX_TTS:
        cut = text[:MAX_TTS]
        for ch in ('. ', '! ', '? ', '.', '!', '?'):
            idx = cut.rfind(ch)
            if idx > MAX_TTS // 2:
                cut = cut[:idx + 1]
                break
        text = cut.strip()
    r = requests.post(
        "https://api.fish.audio/v1/tts",
        headers={
            "Authorization": f"Bearer {config.get_fish_key()}",
            "Content-Type": "application/json",
            "model": "s2.1-pro-free",
        },
        json={"text": text, "reference_id": voice_id, "format": "wav"},
        timeout=60,
    )
    r.raise_for_status()
    return base64.b64encode(r.content).decode()



#* Starts OpenRouter OAuth PKCE and redirects the user to the provider
#* Запускает OpenRouter OAuth PKCE и перенаправляет пользователя к провайдеру
@app.route("/api/oauth/openrouter/start")
def api_oauth_openrouter_start():
    now = time.time()
    for key, pending in list(_oauth_pending.items()):
        if now - pending.get("created", 0) > 900:
            _oauth_pending.pop(key, None)

    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("ascii")).digest()
    ).decode("ascii").rstrip("=")
    state = secrets.token_urlsafe(18)
    _oauth_pending[state] = {"verifier": verifier, "created": now}

    params = {
        "callback_url": url_for("api_oauth_openrouter_callback", _external=True),
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
        "key_label": "AI Assistant",
    }
    return redirect(OPENROUTER_AUTH_URL + "?" + urlencode(params))


#* Receives OpenRouter OAuth code, exchanges it for a key, and starts the app
#* Принимает OAuth-код OpenRouter, обменивает на ключ и запускает приложение
@app.route("/api/oauth/openrouter/callback")
def api_oauth_openrouter_callback():
    code = (request.args.get("code") or "").strip()
    state = (request.args.get("state") or "").strip()
    pending = _oauth_pending.pop(state, None)
    if not code or not pending:
        return redirect(url_for("setup", oauth="error"))

    try:
        resp = requests.post(
            OPENROUTER_KEYS_URL,
            json={
                "code": code,
                "code_verifier": pending["verifier"],
                "code_challenge_method": "S256",
            },
            timeout=25,
        )
        resp.raise_for_status()
        key = (resp.json().get("key") or "").strip()
        if not key:
            raise ValueError("OpenRouter returned no key")
        config.save(or_key=key)
        return redirect(url_for("index"))
    except Exception:
        return redirect(url_for("setup", oauth="error"))


#* Main chat page — shows model/voice selectors
#* Главная страница чата — показывает выбор модели/голоса
@app.route("/")
def index():
    if not config.is_configured():
        return redirect(url_for("setup"))
    lang  = config.get_lang()
    theme = config.get_theme()
    return render_template("index.html",
                           models=config.get_models(),
                           voices=config.get_voices(),
                           links=get_links(),
                           lang=lang,
                           theme=theme,
                           version=VERSION,
                           t=T[lang],
                           cache_bust=str(int(time.time())))



#* Setup page — first-time API key configuration
#* Страница настройки — первоначальная конфигурация API ключей
@app.route("/setup")
def setup():
    if config.is_configured():
        return redirect(url_for("index"))
    return render_template("setup.html", links=get_links(),
                           lang=config.get_lang(), theme=config.get_theme(),
                           oauth_error=request.args.get("oauth") == "error")



#* Hides a secret, keeping only the last 4 characters for identification
#* Скрывает секрет, оставляя только последние 4 символа для идентификации
def _mask_key(value):
    value = (value or "").strip()
    if not value:
        return ""
    return "••••••••" + value[-4:]


def _is_masked(value):
    #* True when the client sent back the masked placeholder unchanged
    #* True, если клиент вернул неизменённую маску вместо ключа
    return (value or "").strip().startswith("••••")


#* Returns current config (keys masked for display)
#* Возвращает текущую конфигурацию (ключи для отображения)
@app.route("/api/config", methods=["GET"])
def api_get_config():
    keys = {
        "or_key":        _mask_key(config.get_or_key()),
        "fish_key":      _mask_key(config.get_fish_key()),
        "hf_key":        _mask_key(config.get_hf_key()),
        "or_key_set":    bool(config.get_or_key()),
        "fish_key_set":  bool(config.get_fish_key()),
        "hf_key_set":    bool(config.get_hf_key()),
        "history_limit": config.get_history_limit(),
        "system_prompt": config.get_system_prompt(),
        "check_updates": config.get_check_updates(),
        "key_storage": config.get_key_storage_status(),
    }
    return jsonify(keys)


#! Saves API keys to config file. Masked/empty values keep the stored key,
#! so the user can update a single key without re-entering the others.
#! Сохраняет API ключи. Маскированные/пустые значения сохраняют текущий
#! ключ, поэтому можно обновить один ключ, не вводя остальные.
@app.route("/api/save-config", methods=["POST"])
def api_save_config():
    data = request.json or {}
    lang = (data.get("lang") or "").strip()

    resolved = {}
    existing = {
        "or_key":   config.get_or_key(),
        "fish_key": config.get_fish_key(),
        "hf_key":   config.get_hf_key(),
    }
    for name in ("or_key", "fish_key", "hf_key"):
        value = (data.get(name) or "").strip()
        resolved[name] = existing[name] if (not value or _is_masked(value)) else value

    if not resolved["or_key"]:
        return jsonify({"success": False, "error": "OpenRouter key is required"})

    config.save(resolved["or_key"], resolved["fish_key"], resolved["hf_key"])
    if lang in ("en", "de", "fr", "pt", "ru"):
        config.set_lang(lang)
    return jsonify({"success": True})


#* Updates the chat history context limit
#* Обновляет лимит контекста истории чата
@app.route("/api/history-limit", methods=["POST"])
def api_history_limit():
    data = request.json
    n = data.get("limit", 10)
    config.set_history_limit(n)
    return jsonify({"success": True, "limit": config.get_history_limit()})


#* Saves or resets the system prompt
#* Сохраняет или сбрасывает системный промпт
@app.route("/api/system-prompt", methods=["POST"])
def api_system_prompt():
    data = request.json
    prompt = data.get("prompt", "").strip()
    config.set_system_prompt(prompt)
    return jsonify({"success": True, "system_prompt": config.get_system_prompt()})




#? Main chat endpoint — sends message to selected AI model, optionally generates TTS
#? Основной endpoint чата — отправляет сообщение выбранной ИИ модели, опционально генерирует TTS
@app.route("/api/chat", methods=["POST"])
def api_chat():
    data     = request.json
    msg      = data.get("message", "")
    model_id = data.get("model", "")
    voice_id = data.get("voice", "")
    muted    = data.get("muted", False)
    use_web  = bool(data.get("web_search")) or _wants_web_search(msg)
    wants_images = _wants_images(msg)

    if not config.is_configured():
        return jsonify({"reply": "Please configure API keys first."})

    model_info = None
    for m in config.get_models():  # Find the requested model metadata by ID
        if m["id"] == model_id:
            model_info = m
            break

    if not model_info:
        return jsonify({"reply": "Model not found."})

    try:
        #* Save user message to history
        #* Сохраняем сообщение пользователя в историю
        config.add_to_history("user", msg)

        #* Try models in order until one works (auto-fallback on rate limits)
        #* Пробуем модели по порядку, пока одна не ответит (авто-фолбек при лимитах)
        all_models = config.get_models()
        start_idx = 0
        for i, m in enumerate(all_models):  # Locate the selected model's position
            if m["id"] == model_id:
                start_idx = i
                break

        reply = None
        fallback_chain = all_models[start_idx:] + all_models[:start_idx]
        last_error = ""
        used_model_id = model_id

        chat_history = config.get_history()

        for m in fallback_chain:  # Try each model in fallback order until one succeeds
            try:
                if m["provider"] == "openrouter":
                    reply = _call_openrouter(m["id"], msg, chat_history, use_web=use_web)
                elif use_web:
                    continue
                else:
                    result = _call_huggingface(m["id"], msg, chat_history)
                    if result.startswith("Model is loading"):  # HF cold-start — skip to next model
                        continue
                    reply = result
                if reply:
                    if m["id"] != model_id:
                        used_model_id = m["id"]
                    break
            except Exception as ex:
                last_error = str(ex)
                continue

        if not reply:
            raise Exception(f"All models failed. Last error: {last_error}")

        #* Strip reasoning markers and echo from AI output
        #* Удаляем маркеры рассуждений и эхо-повторы из ответа ИИ
        reply = _clean_reply(reply)

        #? Tag response with fallback model name if different
        #? Помечаем ответ именем модели-фолбека, если она отличается
        if used_model_id != model_id:
            fb_name = ""
            for m in all_models:  # Look up display name of the fallback model
                if m["id"] == used_model_id:
                    fb_name = m["name"]
                    break
            reply = f"[{fb_name}]\n{reply}"

        #? Prevent AI from echoing user's message back
        #? Не даём ИИ повторять сообщение пользователя
        if reply.lower().startswith(msg[:30].lower()):
            strip_candidates = [reply]
            idx = reply.find("\n")
            if idx != -1:
                strip_candidates.append(reply[idx+1:].strip())
            #? Try stripping just the user message prefix (no newline)
            #? Пробуем отрезать только начало с сообщением пользователя (без перевода строки)
            for i in range(min(len(msg), len(reply)), 0, -1):  # Shrink prefix until match found
                if reply.lower().startswith(msg[:i].lower()):
                    tail = reply[i:].strip()
                    if len(tail) > 10:
                        strip_candidates.append(tail)
                    break
            #? Pick the shortest non-empty candidate
            #? Выбираем самый короткий непустой кандидат
            reply = min((c for c in strip_candidates if c), key=len, default=reply)

        #* Execute any desktop-command tokens the AI emitted (open site, search, ...)
        #* Выполняем токены команд ПК, которые выдал ИИ (открыть сайт, поиск, ...)
        reply, executed = _execute_commands(reply, prefer_images=wants_images, return_meta=True)
        if wants_images and not any(k in ("images", "search", "open") for k in executed):
            ok, detail = execute_command("images", _image_query(msg))
            notice = _cmd_msg("images", ok, detail)
            reply = (reply + "\n\n" + notice).strip() if reply else notice

        #* Save AI response to history
        #* Сохраняем ответ ИИ в историю
        config.add_to_history("assistant", reply)

        audio_b64 = None
        tts_error = None
        if voice_id and not muted:
            try:
                audio_b64 = _call_tts(reply, voice_id)
            except Exception as ex:
                tts_error = str(ex)[:100]
                print("TTS error:", tts_error)

        return jsonify({"reply": reply, "audio": audio_b64, "tts_error": tts_error})

    except Exception as ex:
        traceback.print_exc()
        return jsonify({"reply": f"Error: {str(ex)}"})




#* Computer-use vision loop — takes screenshots, calls vision model, executes actions
#* Видео-цикл управления компьютером — скриншоты, вижен-модель, исполнение действий
#? Streaming chat endpoint — Server-Sent Events for real-time token output
#? Стрим-чат endpoint — Server-Sent Events для вывода токенов в реальном времени
@app.route("/api/chat/stream", methods=["POST"])
def api_chat_stream():
    data     = request.json
    msg      = data.get("message", "")
    orig_msg = msg
    files    = data.get("files", [])
    model_id = data.get("model", "")
    voice_id = data.get("voice", "")
    muted    = data.get("muted", False)
    use_web  = bool(data.get("web_search")) or _wants_web_search(orig_msg)
    wants_images = _wants_images(orig_msg)

    if files:
        file_parts = extract_files_text(files)
        if file_parts:
            msg = "\n\n".join(file_parts) + "\n\nUser question:\n" + msg

    if not config.is_configured():
        return jsonify({"reply": "Please configure API keys first."})

    def generate():
        #* Generator yielding SSE events — tokens, model switches, and final audio
        #* Генератор, отдающий SSE-события — токены, смену модели и финальное аудио
        try:
            #* Save user message early so it's included in history context
            #* Сохраняем сообщение пользователя сразу, чтобы оно было в контексте истории
            config.add_to_history("user", msg)
            chat_history = config.get_history()

            all_models = config.get_models()
            start_idx = 0
            for i, m in enumerate(all_models):  # Locate the selected model's position
                if m["id"] == model_id:
                    start_idx = i
                    break

            fallback_chain = all_models[start_idx:] + all_models[:start_idx]
            last_error = ""
            used_model_id = model_id
            reply = ""
            succeeded = False
            model_switch_tag = ""

            for m in fallback_chain:  # Try each model in fallback order until one succeeds
                if succeeded:
                    break

                if m["provider"] == "openrouter":
                    tokens_yielded = False
                    try:
                        if use_web:
                            reply = ""
                            reply = _call_openrouter(m["id"], msg, chat_history, use_web=True)
                            if not reply:
                                raise Exception("Empty web search response")
                            if m["id"] != model_id:
                                used_model_id = m["id"]
                                for nm in all_models:
                                    if nm["id"] == used_model_id:
                                        model_switch_tag = nm["name"]
                                        break
                                yield f"data: {json.dumps({'type': 'model_switch', 'content': model_switch_tag})}\n\n"
                            yield f"data: {json.dumps({'type': 'token', 'content': reply})}\n\n"
                            succeeded = True
                            continue
                        for token in _call_openrouter_stream(m["id"], msg, chat_history):  # Stream tokens from OpenRouter
                            if not tokens_yielded:
                                tokens_yielded = True
                                if m["id"] != model_id:
                                    used_model_id = m["id"]
                                    for nm in all_models:  # Look up display name of the fallback model
                                        if nm["id"] == used_model_id:
                                            model_switch_tag = nm["name"]
                                            break
                                    yield f"data: {json.dumps({'type': 'model_switch', 'content': model_switch_tag})}\n\n"
                            reply += token
                            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                        succeeded = True
                    except Exception as ex:
                        last_error = str(ex)
                        reply = ""
                        if tokens_yielded:
                            #? Clear partially streamed output before trying the next model
                            #? Очищаем частично выведенный ответ перед следующей моделью
                            yield f"data: {json.dumps({'type': 'replace', 'content': ''})}\n\n"
                        continue
                else:
                    if use_web:
                        continue
                    #? HuggingFace fallback (non-streaming)
                    #? Фолбек на HuggingFace (без стриминга)
                    try:
                        result = _call_huggingface(m["id"], msg, chat_history)
                        if result.startswith("Model is loading"):  # HF cold-start — skip to next model
                            continue
                        reply = result
                        if m["id"] != model_id:
                            used_model_id = m["id"]
                            for nm in all_models:  # Look up display name of the fallback model
                                if nm["id"] == used_model_id:
                                    model_switch_tag = nm["name"]
                                    break
                            yield f"data: {json.dumps({'type': 'model_switch', 'content': model_switch_tag})}\n\n"
                        yield f"data: {json.dumps({'type': 'token', 'content': reply})}\n\n"
                        succeeded = True
                    except Exception as ex:
                        last_error = str(ex)
                        continue

            if not succeeded:
                raise Exception(f"All models failed. Last error: {last_error}")

            reply_cleaned = _clean_reply(reply)
            if reply_cleaned != reply:
                reply = reply_cleaned
                yield f"data: {json.dumps({'type': 'replace', 'content': reply})}\n\n"

            #* Execute any desktop-command tokens the AI emitted (open site, search, ...)
            #* Выполняем токены команд ПК, которые выдал ИИ (открыть сайт, поиск, ...)
            before_cmd = reply
            reply, executed = _execute_commands(reply, prefer_images=wants_images, return_meta=True)
            if wants_images and not any(k in ("images", "search", "open") for k in executed):
                ok, detail = execute_command("images", _image_query(orig_msg))
                notice = _cmd_msg("images", ok, detail)
                reply = (reply + "\n\n" + notice).strip() if reply else notice
            if reply != before_cmd:
                yield f"data: {json.dumps({'type': 'replace', 'content': reply})}\n\n"

            config.add_to_history("assistant", reply)

            audio_b64 = None
            tts_error = None
            if voice_id and not muted:
                try:
                    audio_b64 = _call_tts(reply, voice_id)
                except Exception as ex:
                    tts_error = str(ex)[:100]

            yield f"data: {json.dumps({'type': 'done', 'audio': audio_b64, 'tts_error': tts_error})}\n\n"

        except Exception as ex:
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'content': str(ex)})}\n\n"

    return Response(generate(), mimetype="text/event-stream")


#* Standalone TTS endpoint — converts text to speech without AI
#* Отдельный TTS endpoint — преобразует текст в речь без ИИ
@app.route("/api/tts", methods=["POST"])
def api_tts():
    if not config.is_configured():
        return jsonify({"error": "Not configured"}), 400

    data  = request.json
    text  = data.get("text", "")
    voice = data.get("voice", "")

    try:
        audio_b64 = _call_tts(text, voice)
        if not audio_b64:
            return jsonify({"error": "Nothing to read aloud"}), 200
        return jsonify({"audio": audio_b64})
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500


#* Speech-to-text via a local faster-whisper model. Runs fully offline, so
#* Russian recognition keeps working even when the HF inference host is
#* unreachable. The model is loaded once and cached for later requests.
#* Распознавание речи через локальную модель faster-whisper. Работает
#* офлайн, поэтому распознавание русского работает даже когда хост HF
#* inference недоступен. Модель загружается один раз и кэшируется.
#* Returns {"text": ...} / Возвращает {"text": ...}
_whisper_model = None
_whisper_lock = threading.Lock()
_WHISPER_MODEL_NAME = "small"


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        with _whisper_lock:
            if _whisper_model is None:
                from faster_whisper import WhisperModel
                _whisper_model = WhisperModel(
                    _WHISPER_MODEL_NAME, device="cpu", compute_type="int8"
                )
    return _whisper_model


#* Normalizes an app language tag ("ru-RU", "en-US", ...) to an ISO 639-1 code
#* Приводит языковой тег приложения ("ru-RU", "en-US", ...) к коду ISO 639-1
def _stt_lang(lang):
    if not lang:
        return None
    code = str(lang).split("-")[0].lower()
    if len(code) == 2:
        return code
    return None


def _stt(audio_bytes, lang="ru"):
    try:
        model = _get_whisper_model()
    except Exception as ex:
        print("STT: whisper model load failed:", ex)
        return None

    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_bytes)
            path = f.name
        segments, _info = model.transcribe(path, language=_stt_lang(lang))
        return " ".join(s.text.strip() for s in segments).strip() or None
    except Exception as ex:
        print("STT error:", ex)
        return None
    finally:
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass


@app.route("/api/stt", methods=["POST"])
def api_stt():
    if not config.is_configured():
        return jsonify({"error": "Not configured"}), 400

    data = request.get_json(silent=True) or {}
    audio_b64 = data.get("audio", "")
    lang = data.get("lang", "ru")
    if not audio_b64:
        return jsonify({"error": "No audio"}), 400

    try:
        raw = base64.b64decode(audio_b64)
        text = _stt(raw, lang)
        if not text:
            return jsonify({"error": "Speech recognition failed"}), 500
        return jsonify({"text": text})
    except Exception as ex:
        traceback.print_exc()
        return jsonify({"error": str(ex)[:200]}), 500



#! WARNING: Resets all config — deletes saved API keys
#! ВНИМАНИЕ: Сбрасывает всю конфигурацию — удаляет сохранённые API ключи
@app.route("/api/reset-config", methods=["POST"])
def api_reset_config():
    config.reset()
    return jsonify({"success": True})



#* Returns full chat history
#* Возвращает полную историю чата
@app.route("/api/history", methods=["GET"])
def api_history():
    return jsonify(config.get_history())



#! Clears all chat history
#! Очищает всю историю чата
@app.route("/api/history/clear", methods=["POST"])
def api_history_clear():
    config.clear_history()
    return jsonify({"success": True})




#* Returns current language setting
#* Возвращает текущую языковую настройку
@app.route("/api/lang", methods=["GET"])
def api_get_lang():
    return jsonify({"lang": config.get_lang()})



#* Changes app language
#* Меняет язык приложения
@app.route("/api/lang", methods=["POST"])
def api_set_lang():
    data = request.json
    lang = data.get("lang", "")
    if lang in ("en", "de", "fr", "pt", "ru"):
        config.set_lang(lang)
        return jsonify({"success": True, "lang": lang})
    return jsonify({"success": False, "error": "Invalid language"}), 400



#* Returns current theme
#* Возвращает текущую тему
@app.route("/api/theme", methods=["GET"])
def api_get_theme():
    return jsonify({"theme": config.get_theme()})


#* Changes app theme
#* Меняет тему приложения
@app.route("/api/theme", methods=["POST"])
def api_set_theme():
    data  = request.json
    theme = (data.get("theme") or "").strip()
    config.set_theme(theme)
    return jsonify({"success": True, "theme": config.get_theme()})


#* Toggle update check setting
#* Вкл/выкл проверку обновлений
@app.route("/api/check-updates-setting", methods=["POST"])
def api_check_updates_setting():
    data = request.json
    enabled = data.get("enabled", True)
    config.set_check_updates(enabled)
    return jsonify({"success": True, "check_updates": config.get_check_updates()})


#* Check if a URL is free or paid by analyzing page content
#* Проверка, платный или бесплатный сайт по URL
@app.route("/api/agents/check-url", methods=["POST"])
def api_agents_check_url():
    data = request.json
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"success": False, "error": "URL required"}), 400

    from urllib.parse import urlparse
    parsed = urlparse(url)
    path = parsed.path.strip("/")
    #* The full path is the model ID (e.g. "tencent/hy3:free")
    #* Полный путь — это ID модели (например "tencent/hy3:free")
    model_id = path if path else parsed.netloc.replace("www.", "")

    #* Determine status from the model name: if ":free" suffix → free
    #* Определяем статус по имени модели: если есть ":free" → бесплатно
    if ":free" in model_id:
        status = "free"
        label = "Free"
    else:
        status = "paid"
        label = "Paid"

    return jsonify({
        "success": True,
        "name": model_id.rsplit("/", 1)[-1] if "/" in model_id else model_id,
        "model_id": model_id,
        "url": url,
        "status": status,
        "label": label,
    })


#* List custom models
#* Список кастомных моделей
@app.route("/api/agents/list", methods=["GET"])
def api_agents_list():
    resp = jsonify({"agents": config.get_custom_models()})
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


#* Add a model from URL — extracts model ID and adds to custom model list
#* Добавить модель по URL — извлекает ID модели и добавляет в список кастомных
@app.route("/api/agents/add", methods=["POST"])
def api_agents_add():
    data = request.json or {}
    url = (data.get("url") or "").strip()
    model_id = (data.get("model_id") or "").strip()
    name = (data.get("name") or "").strip()

    if not model_id:
        if not url:
            return jsonify({"success": False, "error": "url required"}), 400
        parsed = urlparse(url)
        path = parsed.path.strip("/")
        model_id = path if path else parsed.netloc.replace("www.", "")

    if not model_id:
        return jsonify({"success": False, "error": "model_id required"}), 400

    added = config.add_custom_model(model_id, name or None)
    display = name or (model_id.rsplit("/", 1)[-1] if "/" in model_id else model_id)
    return jsonify({
        "success": True,
        "added": added,
        "model": {
            "provider": "openrouter",
            "id": model_id,
            "name": display,
        }
    })


#* Remove a custom model by URL
#* Удалить кастомную модель по URL
@app.route("/api/agents/remove", methods=["POST"])
def api_agents_remove():
    data = request.json
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"success": False, "error": "url required"}), 400
    from urllib.parse import urlparse
    parsed = urlparse(url)
    model_id = parsed.path.strip("/")
    config.remove_custom_model(model_id)
    return jsonify({"success": True})


#* Free text models catalogue — cached for a few minutes to spare OpenRouter
#* Каталог бесплатных текстовых моделей — кэшируется на несколько минут
OPENROUTER_MODELS_API   = "https://openrouter.ai/api/v1/models"
OPENROUTER_FREE_URL     = "https://openrouter.ai/models?max_price=0&max_output_price=0&output_modalities=text"
_MODELS_TTL             = 600
_models_cache           = {"ts": 0.0, "items": [], "source": ""}
_models_cache_lock      = threading.Lock()


def _is_zero_price(value):
    #* OpenRouter returns prices as strings like "0" or "0.000001"
    #* OpenRouter отдаёт цены строками вида "0" или "0.000001"
    try:
        return float(value) == 0.0
    except (TypeError, ValueError):
        return False


def _fetch_free_models_api():
    #* Primary source: the public models API (same data as the website)
    #* Основной источник: публичный API моделей (те же данные, что на сайте)
    resp = requests.get(OPENROUTER_MODELS_API, timeout=25)
    resp.raise_for_status()
    payload = resp.json()

    items = []
    for model in payload.get("data", []):
        pricing = model.get("pricing") or {}
        if not (_is_zero_price(pricing.get("prompt")) and
                _is_zero_price(pricing.get("completion"))):
            continue
        arch = model.get("architecture") or {}
        if "text" not in (arch.get("output_modalities") or []):
            continue

        model_id = (model.get("id") or "").strip()
        if not model_id:
            continue
        full_name = re.sub(r"\s+", " ", model.get("name") or model_id).strip()
        short_name = full_name.split(":", 1)[1].strip() if ":" in full_name else full_name
        author = full_name.split(":", 1)[0].strip() if ":" in full_name else model_id.split("/")[0]

        items.append({
            "id":               model_id,
            "name":             short_name or full_name,
            "full_name":        full_name,
            "author":           author,
            "knowledge_cutoff": model.get("knowledge_cutoff") or None,
            "created":          model.get("created"),
            "context_length":   model.get("context_length"),
            "description":      (model.get("description") or "").strip(),
            "url":              f"https://openrouter.ai/{model_id}",
        })
    if not items:
        raise ValueError("API returned no free text models")
    return items


#* Parses dates shown on model cards like "Nov 4, 2026" into a Unix timestamp
#* Парсит даты с карточек вида "Nov 4, 2026" в Unix-время
def _parse_card_date(text):
    match = re.search(r"([A-Za-z]{3})[a-z]*\s+\d{1,2},\s+\d{4}", text or "")
    if not match:
        return None
    raw = re.search(r"[A-Za-z]{3}[a-z]*\s+\d{1,2},\s+\d{4}", text).group(0)
    for fmt in ("%b %d, %Y", "%B %d, %Y"):
        try:
            return int(datetime.datetime.strptime(raw, fmt).timestamp())
        except ValueError:
            continue
    return None


#* Parses "1.05M" / "65k" context sizes into an integer token count
#* Парсит размер контекста "1.05M" / "65k" в целое число токенов
def _parse_context_len(text):
    match = re.search(r"([\d.]+)\s*([KkMmBb])\s+context", text or "")
    if not match:
        return None
    try:
        value = float(match.group(1))
    except ValueError:
        return None
    return int(value * {"k": 1_000, "m": 1_000_000, "b": 1_000_000_000}[match.group(2).lower()])


def _fetch_free_models_html():
    #* Fallback: parse the OpenRouter models page markup on the user's machine
    #* Резерв: парсим разметку страницы моделей OpenRouter на машине пользователя
    from bs4 import BeautifulSoup

    resp = requests.get(
        OPENROUTER_FREE_URL,
        timeout=25,
        headers={"User-Agent": "Mozilla/5.0 (compatible; AI-Assistant/1.0)"},
    )
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    items = {}
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        if not re.fullmatch(r"/[^/?#]+/[^/?#]+", href):
            continue

        #* A real model card always contains a "Copy: <model-id>" button
        #* Настоящая карточка модели всегда содержит кнопку "Copy: <model-id>"
        card = None
        model_id = href.strip("/")
        node = anchor
        for _ in range(4):
            node = node.parent
            if node is None:
                break
            copy_el = node.find(attrs={"title": re.compile(r"^Copy:\s*")})
            if copy_el and copy_el.get("title"):
                model_id = copy_el["title"].split(":", 1)[1].strip() or model_id
                card = node
                break
        if card is None or not model_id or model_id in items:
            continue

        card_text = re.sub(r"\s+", " ", card.get_text(" ", strip=True))
        #* Keep only models whose input AND output tokens are free
        #* Оставляем только модели с бесплатными входными И выходными токенами
        free_in = re.search(r"\$0(?:\.0+)?\s*/\s*M\s+input tokens", card_text, re.I)
        free_out = re.search(r"\$0(?:\.0+)?\s*/\s*M\s+output tokens", card_text, re.I)
        if not (free_in and free_out):
            continue

        name_span = anchor.find("span", class_=lambda c: c and "font-semibold" in c)
        full_name = ""
        if name_span:
            first = name_span.find("span")
            full_name = (first.get_text(" ", strip=True) if first
                         else name_span.get_text(" ", strip=True)).strip()
        full_name = re.sub(r"\s+", " ", full_name or anchor.get("aria-label", "") or
                           anchor.get_text(" ", strip=True)).strip()
        short_name = full_name.split(":", 1)[1].strip() if ":" in full_name else full_name
        author = model_id.split("/")[0]

        items[model_id] = {
            "id":               model_id,
            "name":             short_name or full_name,
            "full_name":        full_name,
            "author":           author,
            "knowledge_cutoff": None,
            "created":          _parse_card_date(card_text),
            "context_length":   _parse_context_len(card_text),
            "description":      "",
            "url":              f"https://openrouter.ai/{model_id}",
        }
    if not items:
        raise ValueError("Could not parse any models from the page")
    return list(items.values())


def _get_free_models(force=False):
    #* Returns cached catalogue; refreshes from API, then HTML fallback
    #* Возвращает кэш; обновляет через API, при ошибке — через HTML
    now = time.time()
    with _models_cache_lock:
        if not force and _models_cache["items"] and now - _models_cache["ts"] < _MODELS_TTL:
            return _models_cache["items"], _models_cache["source"]

    try:
        items = _fetch_free_models_api()
        source = "api"
    except Exception:
        items = _fetch_free_models_html()
        source = "html"

    items.sort(key=lambda m: m.get("created") or 0, reverse=True)
    with _models_cache_lock:
        _models_cache.update(ts=now, items=items, source=source)
    return items, source


#* Browse free OpenRouter models — one-click add from the UI
#* Просмотр бесплатных моделей OpenRouter — добавление в один клик из UI
@app.route("/api/models/browse", methods=["GET"])
def api_models_browse():
    force = request.args.get("refresh") in ("1", "true", "yes")
    try:
        items, source = _get_free_models(force=force)
    except Exception as ex:
        return jsonify({"success": False, "error": str(ex)[:200]}), 502

    added_ids = {m["id"] for m in config.get_models()}
    result = [{**item, "added": item["id"] in added_ids} for item in items]
    return jsonify({
        "success": True,
        "items":   result,
        "total":   len(result),
        "source":  source,
    })


#* Rejects URLs that resolve to loopback/private/link-local addresses (SSRF guard)
#* Отклоняет URL, ведущие на loopback/private/link-local адреса (защита от SSRF)
def _is_public_http_url(url):
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError:
        return False
    try:
        infos = socket.getaddrinfo(parsed.hostname, port, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    for info in infos:
        try:
            addr = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if (addr.is_private or addr.is_loopback or addr.is_link_local
                or addr.is_reserved or addr.is_multicast or addr.is_unspecified):
            return False
    return True


#* Proxy for voice preview audio — forwards MP3 to avoid CORS
#* Прокси для аудио-превью — передаёт MP3, обходя CORS
@app.route("/api/voices/preview")
def api_voices_preview():
    url = request.args.get("url", "")
    if not url:
        return "Missing url", 400
    if not _is_public_http_url(url):
        return "Forbidden url", 403
    try:
        resp = requests.get(url, timeout=15, stream=True)
        resp.raise_for_status()
        headers = {"Content-Type": resp.headers.get("Content-Type", "audio/mpeg")}
        return resp.content, 200, headers
    except requests.RequestException:
        return "Failed to fetch audio", 502


#* Browse Fish Audio marketplace — paginated voice listing
#* Просмотр маркетплейса Fish Audio — список голосов по страницам
FISH_API_BROWSE = "https://api.fish.audio/model"

@app.route("/api/voices/browse", methods=["GET"])
def api_voices_browse():
    page     = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    per_page = min(per_page, 50)
    search   = request.args.get("search", "").strip()
    lang     = request.args.get("lang", "").strip()

    params = {
        "page_size":     per_page,
        "page_number":   page,
        "self":          "false",
    }
    if search:
        params["title"] = search
    if lang:
        params["language"] = lang

    try:
        resp = requests.get(FISH_API_BROWSE, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        items = []
        for m in data.get("items", []):  # Parse each voice model from the marketplace listing
            samples = m.get("samples", [])
            preview_url = samples[0]["audio"] if samples else None
            items.append({
                "id":          m.get("_id", ""),
                "name":        m.get("title", "Unknown"),
                "description": m.get("description", ""),
                "tags":        m.get("tags", []),
                "languages":   m.get("languages", []),
                "preview_url": preview_url,
                "like_count":  m.get("like_count", 0),
                "task_count":  m.get("task_count", 0),
            })

        return jsonify({
            "success":  True,
            "items":    items,
            "total":    data.get("total", 0),
            "has_more": data.get("has_more", False),
            "page":     page,
            "per_page": per_page,
        })
    except requests.RequestException as e:
        return jsonify({"success": False, "error": str(e)}), 502


#* Adds a new voice from Fish Audio URL
#* Добавляет новый голос по ссылке Fish Audio
@app.route("/api/voices/add", methods=["POST"])
def api_voices_add():
    data = request.json
    name = (data.get("name") or "").strip()
    url  = (data.get("url") or "").strip()
    if not name or not url:
        return jsonify({"success": False, "error": "Name and URL are required"}), 400
    voice_id = config.parse_voice_url(url)
    if not voice_id:
        return jsonify({"success": False, "error": "Could not extract voice ID from URL"}), 400
    config.add_custom_voice(name, voice_id)
    return jsonify({
        "success": True,
        "voice":   [name, voice_id],
        "voices":  config.get_voices(),
    })


#* Returns only custom (user-added) voices
#* Возвращает только добавленные пользователем голоса
@app.route("/api/voices/custom", methods=["GET"])
def api_voices_custom():
    return jsonify({"voices": config.get_custom_voices()})


#! Removes a user-added voice
#! Удаляет добавленный пользователем голос
@app.route("/api/voices/remove", methods=["POST"])
def api_voices_remove():
    data    = request.json
    voice_id = (data.get("voice_id") or "").strip()
    if not voice_id:
        return jsonify({"success": False, "error": "voice_id required"}), 400
    config.remove_custom_voice(voice_id)
    return jsonify({
        "success": True,
        "voices":  config.get_voices(),
    })


#* Health/status endpoint
#* Endpoint для проверки статуса
@app.route("/api/status", methods=["GET"])
def api_status():
    return jsonify({
        "configured":    config.is_configured(),
        "models_count":  len(config.get_models()),
        "voices_count":  len(config.get_voices()),
    })



#* Check for updates on GitHub
#* Проверка обновлений на GitHub
@app.route("/api/check-update", methods=["GET"])
def api_check_update():
    try:
        r = requests.get(GITHUB_API, timeout=10)
        if r.status_code == 404:
            return jsonify({"current": VERSION, "latest": None, "update_available": False})
        r.raise_for_status()
        data   = r.json()
        latest = data.get("tag_name", "").lstrip("v")
        url    = data.get("zipball_url") or ""
        notes  = data.get("body", "")

        available = latest and _parse_version(latest) > _parse_version(VERSION)

        return jsonify({
            "current":           VERSION,
            "latest":            latest,
            "update_available":  bool(available),
            "download_url":      url,
            "release_notes":     (notes or "")[:500],
        })
    except requests.RequestException as e:
        return jsonify({"current": VERSION, "latest": None, "update_available": False, "error": str(e)})


#! Installs the latest update — downloads, extracts, replaces files, restarts
#! Устанавливает обновление — скачивает, распаковывает, заменяет файлы, перезапускает
@app.route("/api/perform-update", methods=["POST"])
def api_perform_update():
    try:
        r = requests.get(GITHUB_API, timeout=10)
        r.raise_for_status()
        data  = r.json()
        latest = data.get("tag_name", "").lstrip("v")
        dl_url = data.get("zipball_url")
        if not dl_url:
            return jsonify({"success": False, "error": "No download URL"}), 400
        if latest and _parse_version(latest) <= _parse_version(VERSION):
            return jsonify({"success": False, "error": "Already up to date"}), 400

        zip_resp = requests.get(dl_url, timeout=60, stream=True)
        zip_resp.raise_for_status()

        #* The running code lives in <project>/source/, while the repo zipball
        #* has the repo root (source/, main.py, ...). Update the project root.
        #* Код лежит в <project>/source/, а zipball содержит корень репозитория
        #* (source/, main.py, ...). Обновляем корень проекта.
        app_dir = os.path.dirname(os.path.abspath(__file__))
        project_dir = os.path.dirname(app_dir) if os.path.basename(app_dir) == "source" else app_dir

        with tempfile.TemporaryDirectory() as tmp:
            zip_path = os.path.join(tmp, "update.zip")
            with open(zip_path, "wb") as f:
                for chunk in zip_resp.iter_content(8192):  # Stream download in 8 KB chunks
                    f.write(chunk)

            extract_dir = os.path.join(tmp, "extracted")
            os.makedirs(extract_dir, exist_ok=True)
            safe_root = os.path.realpath(extract_dir) + os.sep
            with zipfile.ZipFile(zip_path, "r") as zf:
                for member in zf.infolist():  # Guard against Zip Slip / Защита от Zip Slip
                    dest = os.path.realpath(os.path.join(extract_dir, member.filename))
                    if not dest.startswith(safe_root):
                        return jsonify({"success": False, "error": "Unsafe archive path"}), 400
                    zf.extract(member, extract_dir)

            entries = os.listdir(extract_dir)
            if len(entries) != 1:
                return jsonify({"success": False, "error": "Unexpected archive layout"}), 400
            root = os.path.join(extract_dir, entries[0])

            for item in os.listdir(root):  # Copy every file/folder from update to project directory
                src = os.path.join(root, item)
                dst = os.path.join(project_dir, item)
                if os.path.isdir(src):
                    if os.path.exists(dst):
                        shutil.rmtree(dst)
                    shutil.copytree(src, dst)
                else:
                    shutil.copy2(src, dst)

        return jsonify({"success": True, "restart": True})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


#* Beta: generate multiple response variants (branching)
#* Бета: генерация нескольких вариантов ответа (ветвление)
@app.route("/api/chat/branch", methods=["POST"])
def api_chat_branch():
    data = request.json
    msg = data.get("message", "")
    model_id = data.get("model", "")

    if not config.is_configured():
        return jsonify({"error": "API keys not configured"}), 400

    config.add_to_history("user", msg)
    chat_history = config.get_history()
    limit = config.get_history_limit()
    sp = _system_prompt()
    messages = [{"role": "system", "content": sp}]
    for h in chat_history[-(limit):]:
        if h["role"] in ("user", "assistant"):
            messages.append({"role": h["role"], "content": h["content"]})

    def _call():
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {config.get_or_key()}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/evgenijlevin/ai_assistant",
            },
            json={
                "model": model_id,
                "messages": messages,
                "max_tokens": 4096,
                "temperature": 0.9,
            },
            timeout=60,
        )
        if r.status_code != 200:
            return "[error]"
        data = r.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "") or "[empty]"

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        futures = [ex.submit(_call) for _ in range(3)]
        results = [f.result(timeout=120) for f in futures]

    return jsonify({"branches": results})


#* Hand Assistant — control the OS mouse with hand gestures via MediaPipe
#* Hand Assistant — управление системной мышью жестами руки через MediaPipe
#! Security: only local clients may control the mouse
#! Безопасность: только локальные клиенты могут управлять мышью
def _is_local():
    return request.remote_addr in ("127.0.0.1", "::1", "localhost")


@app.route("/api/hand/status", methods=["GET"])
def api_hand_status():
    try:
        import pyautogui
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 200


@app.route("/api/hand/mouse", methods=["POST"])
def api_hand_mouse():
    if not _is_local():
        return jsonify({"ok": False, "error": "forbidden"}), 403

    data = request.get_json(silent=True) or {}
    action = data.get("action", "move")

    try:
        import pyautogui
    except Exception:
        return jsonify({"ok": False, "error": "pyautogui is not installed"}), 500

    try:
        #? Keep the failsafe on: slam the cursor into a screen corner to abort
        #? Оставляем failsafe включённым: резкий увод курсора в угол прерывает управление
        pyautogui.FAILSAFE = True
        if action == "move":
            x, y = data.get("x"), data.get("y")
            if x is None or y is None:
                return jsonify({"ok": False, "error": "missing coords"}), 400
            sw, sh = pyautogui.size()
            px = max(0.0, min(1.0, float(x))) * sw
            ty = max(0.0, min(1.0, float(y))) * sh
            pyautogui.moveTo(px, ty, duration=0.0)
        elif action == "left":
            pyautogui.click(button="left")
        elif action == "right":
            pyautogui.click(button="right")
        elif action == "down":
            pyautogui.mouseDown(button="left")
        elif action == "up":
            pyautogui.mouseUp(button="left")
        else:
            return jsonify({"ok": False, "error": f"unknown action: {action}"}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

    return jsonify({"ok": True})


if __name__ == "__main__":

    port  = int(os.environ.get("PORT", 5066))
    host  = os.environ.get("HOST", "127.0.0.1")
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    app.run(host=host, port=port, debug=debug)
