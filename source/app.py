#* Flask web server for AI Assistant
#* Веб-сервер на Flask для AI ассистента
from flask import Flask, render_template, request, jsonify, redirect, url_for, Response
import requests
import json
import base64
import os
import re
import sys
import zipfile
import shutil
import tempfile
import traceback

from config_manager import ConfigManager, get_links
from translations import T
app  = Flask(__name__)
config = ConfigManager()

VERSION     = "1.0"
REPO_OWNER  = "AnonimPython"
REPO_NAME   = "AI-Assistant"
GITHUB_API  = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest"



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


#! Calls OpenRouter API — requires valid API key
#! Вызов OpenRouter API — требуется валидный API ключ
def _call_openrouter(model_id, message, history=None):
    limit = config.get_history_limit()
    sp = config.get_system_prompt()
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
        }),
        timeout=45,
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

    return content

# Example: _call_openrouter("gpt-4", "Hello") → returns AI response text
# Пример: _call_openrouter("gpt-4", "Привет") → возвращает текст ответа ИИ

#* Streaming version of OpenRouter call — yields tokens one by one
#* Стрим-версия вызова OpenRouter — отдаёт токены по одному
# Example: for token in _call_openrouter_stream("gpt-4", "Hi"): print(token)
# Пример: for token in _call_openrouter_stream("gpt-4", "Привет"): print(token)
def _call_openrouter_stream(model_id, message, history=None):
    limit = config.get_history_limit()
    sp = config.get_system_prompt()
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
    hf_token    = config.get_hf_key()
    api_url = f"https://api-inference.huggingface.co/models/{model_id}"

    limit = config.get_history_limit()
    sp = config.get_system_prompt()
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



#* Converts text to speech via Fish Audio API, returns base64 WAV
#* Преобразует текст в речь через Fish Audio API, возвращает WAV в base64
# Example: _call_tts("Hello world", "some_voice_id") → base64-encoded WAV string
# Пример: _call_tts("Привет мир", "some_voice_id") → строка WAV в base64
def _call_tts(text, voice_id):
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
                           t=T[lang])



#* Setup page — first-time API key configuration
#* Страница настройки — первоначальная конфигурация API ключей
@app.route("/setup")
def setup():
    if config.is_configured():
        return redirect(url_for("index"))
    return render_template("setup.html", links=get_links())



#* Returns current config (keys masked for display)
#* Возвращает текущую конфигурацию (ключи для отображения)
@app.route("/api/config", methods=["GET"])
def api_get_config():
    keys = {
        "or_key":        config.get_or_key(),
        "fish_key":      config.get_fish_key(),
        "hf_key":        config.get_hf_key(),
        "history_limit": config.get_history_limit(),
        "system_prompt": config.get_system_prompt(),
        "check_updates": config.get_check_updates(),
    }
    return jsonify(keys)


#! Saves all three API keys to config file
#! Сохраняет все три API ключа в файл конфигурации
@app.route("/api/save-config", methods=["POST"])
def api_save_config():
    data = request.json
    or_key    = data.get("or_key", "").strip()
    fish_key  = data.get("fish_key", "").strip()
    hf_key    = data.get("hf_key", "").strip()
    lang      = data.get("lang", "").strip()

    if not or_key or not fish_key or not hf_key:
        return jsonify({"success": False, "error": "All three keys are required"})

    config.save(or_key, fish_key, hf_key)
    if lang in ("en", "de", "fr", "sr", "ru"):
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
                    reply = _call_openrouter(m["id"], msg, chat_history)
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



#? Streaming chat endpoint — Server-Sent Events for real-time token output
#? Стрим-чат endpoint — Server-Sent Events для вывода токенов в реальном времени
@app.route("/api/chat/stream", methods=["POST"])
def api_chat_stream():
    data     = request.json
    msg      = data.get("message", "")
    model_id = data.get("model", "")
    voice_id = data.get("voice", "")
    muted    = data.get("muted", False)

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
                    try:
                        tokens_yielded = False
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
                        continue
                else:
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
        return jsonify({"audio": audio_b64})
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500



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
    if lang in ("en", "de", "fr", "sr", "ru"):
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


#* Proxy for voice preview audio — forwards MP3 to avoid CORS
#* Прокси для аудио-превью — передаёт MP3, обходя CORS
@app.route("/api/voices/preview")
def api_voices_preview():
    url = request.args.get("url", "")
    if not url:
        return "Missing url", 400
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

        #* Parse version string into comparable tuple, e.g. "1.2.3" → (1,2,3)
        #* Парсит версию в кортеж для сравнения, напр. "1.2.3" → (1,2,3)
        def _parse(v):
            parts = re.split(r"[._-]", v)
            return tuple(int(p) for p in parts if p.isdigit()) or (0,)

        available = latest and _parse(latest) > _parse(VERSION)

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
        dl_url = data.get("zipball_url")
        if not dl_url:
            return jsonify({"success": False, "error": "No download URL"}), 400

        zip_resp = requests.get(dl_url, timeout=60, stream=True)
        zip_resp.raise_for_status()

        app_dir = os.path.dirname(os.path.abspath(__file__))

        with tempfile.TemporaryDirectory() as tmp:
            zip_path = os.path.join(tmp, "update.zip")
            with open(zip_path, "wb") as f:
                for chunk in zip_resp.iter_content(8192):  # Stream download in 8 KB chunks
                    f.write(chunk)

            extract_dir = os.path.join(tmp, "extracted")
            os.makedirs(extract_dir, exist_ok=True)
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(extract_dir)

            root = os.path.join(extract_dir, os.listdir(extract_dir)[0])

            for item in os.listdir(root):  # Copy every file/folder from update to app directory
                src = os.path.join(root, item)
                dst = os.path.join(app_dir, item)
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


if __name__ == "__main__":

    port  = int(os.environ.get("PORT", 5066))
    debug = os.environ.get("DEBUG", "true").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
