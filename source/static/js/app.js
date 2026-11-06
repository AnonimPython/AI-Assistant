//* Chat application logic — message sending, TTS, UI updates, history, language
//* Логика чат-приложения — отправка сообщений, TTS, обновление интерфейса, история, язык

//* Splash screen — MUST run before anything else (even marked CDN)
//* Заставка — ДОЛЖНА выполняться до всего остального (даже до marked с CDN)
//* IIFE — runs immediately when the script is parsed, no dependencies
//* IIFE — запускается сразу при парсинге скрипта, без зависимостей
(function() {
    //* Find the splash overlay DOM element / Ищем элемент заставки в DOM
    const splash = document.getElementById("splash-overlay");
    //* If element doesn't exist (e.g. setup page), skip / Если элемента нет (страница настройки), пропускаем
    if (!splash) return;
    //* Available animation names / Доступные имена анимаций
    const anims = ["glide", "pulse", "rotate"];
    //* Pick a random animation / Выбираем случайную анимацию
    const chosen = anims[Math.floor(Math.random() * anims.length)];
    //* Apply the animation class to trigger CSS keyframes / Добавляем класс анимации для запуска CSS-анимации
    splash.classList.add("splash-" + chosen);
    //* After 1.8 seconds — hide the splash / Через 1.8 секунды — скрываем заставку
    setTimeout(function() {
        //* Add "hidden" class → opacity: 0 with smooth transition / Добавляем класс "hidden" → плавное затухание
        splash.classList.add("hidden");
        //* After transition ends — fully remove from layout / После окончания перехода — полностью убираем из потока
        setTimeout(function() { splash.style.display = "none"; }, 500);
    }, 1800);
})();

const chatMessages   = document.getElementById("chat-messages");
const messageInput    = document.getElementById("message-input");
const sendBtn         = document.getElementById("send-btn");
const modelSelect     = document.getElementById("model-select");
const voiceSelect     = document.getElementById("voice-select");
const clearChatBtn    = document.getElementById("clear-chat-btn");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const resetBtn        = document.getElementById("reset-btn");
const statusText      = document.getElementById("status-text");
const statusDot       = document.getElementById("status-indicator");
const muteToggle      = document.getElementById("mute-toggle");
const muteIconOn      = document.getElementById("mute-icon-on");
const muteIconOff     = document.getElementById("mute-icon-off");

const t = TRANSLATIONS || {};
//* Locale for dates — always follow the UI language, not the OS locale
//* Локаль для дат — всегда следует языку интерфейса, а не локали ОС
const LOCALE_BY_LANG = { en: "en-US", ru: "ru-RU", de: "de-DE", fr: "fr-FR", pt: "pt-BR" };
const UI_LOCALE = LOCALE_BY_LANG[CURRENT_LANG] || "en-US";
let isLoading = false;
let isMuted = false;



//* Auto-resize the textarea as the user types
//* Автоматическое изменение высоты textarea при вводе
// Example: autoResize(messageInput);
function autoResize(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    sendBtn.disabled = isLoading || !textarea.value.trim();
}

// Auto-resize on every input event
messageInput.addEventListener("input", () => autoResize(messageInput));


//* Send message on Enter (Shift+Enter for new line)
//* Отправка сообщения по Enter (Shift+Enter для новой строки)
messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Click send button
sendBtn.addEventListener("click", sendMessage);


//* Clear chat messages (UI only)
//* Очистка сообщений чата (только интерфейс)
clearChatBtn.addEventListener("click", () => {
    chatMessages.innerHTML = "";
    addWelcomeMessage();
});

//! Clear history on server and reload UI
//! Очистка истории на сервере и перезагрузка интерфейса
clearHistoryBtn.addEventListener("click", async () => {
    if (!confirm(t.confirm_clear_history || "Clear all chat history? This cannot be undone.")) return;
    try {
        const r     = await fetch("/api/history/clear", { method: "POST" });
        const data  = await r.json();
        if (data.success) {
            chatMessages.innerHTML = "";
            addWelcomeMessage();
            setStatus(t.status_ready || "Ready", "ready");
        }
    } catch {
        alert(t.connection_error || "Connection error");
    }
});

//! WARNING: Reset all settings and redirect to setup
//! ВНИМАНИЕ: Сброс всех настроек и перенаправление на страницу настройки
resetBtn.addEventListener("click", async () => {
    if (!confirm(t.confirm_reset || "Reset all settings? API keys will need to be re-entered.")) return;
    try {
        const r = await fetch("/api/reset-config", { method: "POST" });
        const data = await r.json();
        if (data.success) window.location.href = "/setup";
    } catch {
        alert("Reset error");
    }
});


//* Language switcher
//* Переключатель языка
// Attach a click handler to each language-switcher button
document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
        const lang = btn.dataset.lang;
        try {
            const r = await fetch("/api/lang", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lang }),
            });
            const data = await r.json();
            if (data.success) {
                window.location.reload();
            }
        } catch {
            alert("Language switch error");
        }
    });
});



//* Mute toggle — skip TTS even when a voice is selected
//* Кнопка mute — отключает озвучку, даже если выбран голос
muteToggle.addEventListener("click", () => {
    isMuted = !isMuted;
    muteIconOn.style.display  = isMuted ? "none" : "";
    muteIconOff.style.display = isMuted ? "" : "none";
    muteToggle.classList.toggle("muted", isMuted);

    if (isMuted) {
        document.querySelectorAll("audio").forEach(a => {
            a.pause();
            if (a.onended) a.onended();
        });
    }
});



//* Rebuilds the voice select dropdown with a fresh list
//* Перестраивает выпадающий список голосов
function rebuildVoiceSelect(voices) {
    const currentVal = voiceSelect.value;
    voiceSelect.innerHTML = '<option value="">' + (t.no_voice || "No voice") + "</option>";
    // Populate the <select> with each available voice option
    for (const v of voices) {
        const opt = document.createElement("option");
        opt.value = v[1];
        opt.textContent = v[0];
        voiceSelect.appendChild(opt);
    }
    // Restore the previously selected voice (if still available in the new list)
    if (currentVal) {
        // Scan all options looking for the previously selected value
        for (const opt of voiceSelect.options) {
            if (opt.value === currentVal) {
                voiceSelect.value = currentVal;
                break;
            }
        }
    }
}

//* Check for updates and show banner if available
//* Проверка обновлений и показ баннера
async function checkForUpdates() {
    try {
        const configResp = await fetch("/api/config");
        const configData = await configResp.json();
        if (!configData.check_updates) return;

        const r = await fetch("/api/check-update");
        const data = await r.json();
        if (data.update_available && data.latest) {
            const text = (t.update_available || "A new version {version} is available!").replace("{version}", data.latest);
            updateBannerText.textContent = text;
            updateBanner.style.display = "flex";
        }
    } catch {}
}

//* Dismiss the update banner / Закрыть баннер обновлений
function initUpdateBannerDismiss() {
    updateBannerDismiss.addEventListener("click", () => {
        updateBanner.style.display = "none";
    });
}

//* Toggle update check setting / Переключить проверку обновлений
function initCheckUpdatesToggle() {
    checkUpdatesToggle.addEventListener("change", async () => {
        const enabled = checkUpdatesToggle.checked;
        try {
            await fetch("/api/check-updates-setting", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled }),
            });
        } catch {}
    });
}

//* Send user message to the server and stream the bot response
//* Отправка сообщения пользователя на сервер и стриминг ответа бота
async function sendMessage() {
    const msg = messageInput.value.trim();
    if (!msg || isLoading) return;

    isLoading = true;
    sendBtn.disabled = true;
    setStatus(t.status_thinking || "Thinking...", "processing");

    addMessage(msg, "user");
    messageInput.value = "";
    messageInput.style.height = "auto";

    //* Create bot message bubble immediately (will fill with tokens)
    //* Создаём пузырёк бота сразу (будет заполняться токенами)
    const botDiv = document.createElement("div");
    botDiv.className = "message bot";
    const botContent = document.createElement("div");
    botContent.className = "message-content";
    botDiv.appendChild(botContent);
    chatMessages.appendChild(botDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    let fullText = "";
    let audioB64 = null;
    let ttsError = null;

    try {
// POST to streaming endpoint
        const r = await fetch("/api/chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: msg,
                model: modelSelect.value,
                voice: voiceSelect.value,
                muted: isMuted,
            }),
        });

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

// Read SSE chunks from the server until the stream ends
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";

            // Process each SSE event string in the buffer
            for (const part of parts) {
                if (!part.startsWith("data: ")) continue;
                let data;
                try {
                    data = JSON.parse(part.slice(6));
                } catch {
                    continue;
                }

                if (data.type === "token") {
// Append new token to bot bubble
                    fullText += data.content;
                    botContent.innerHTML = formatMessage(fullText);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } else if (data.type === "model_switch") {
                    fullText += "[" + data.content + "]\n";
                    botContent.innerHTML = formatMessage(fullText);
                } else if (data.type === "replace") {
                    fullText = data.content;
                    botContent.innerHTML = formatMessage(fullText);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } else if (data.type === "done") {
// Stream complete — grab audio or TTS error
                    audioB64 = data.audio || null;
                    ttsError = data.tts_error || null;
                } else if (data.type === "error") {
                    botContent.innerHTML = formatMessage("<span style='color:var(--danger)'>Error:</span> " + escapeHtml(data.content));
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
        }

        if (audioB64) addAudioRow(botDiv, audioB64);
        if (ttsError) addTtsErrorRow(botDiv, ttsError);

        setStatus(t.status_ready || "Ready", "ready");
    } catch (err) {
        botContent.innerHTML = formatMessage("<span style='color:var(--danger)'>" + (t.connection_error || "Connection error") + ":</span> " + escapeHtml(err.message));
        chatMessages.scrollTop = chatMessages.scrollHeight;
        setStatus(t.status_error || "Error", "error");
    } finally {
        isLoading = false;
        sendBtn.disabled = !messageInput.value.trim();
    }
}


//* Add a message bubble to the chat
//* Добавление сообщения в чат
function addMessage(text, role, audioB64, ttsError) {
    const div = document.createElement("div");
    div.className = `message ${role}`;

    const content = document.createElement("div");
    content.className = "message-content";
    content.innerHTML = formatMessage(text);
    div.appendChild(content);

    if (audioB64) {
        addAudioRow(div, audioB64);
    } else if (ttsError) {
        addTtsErrorRow(div, ttsError);
    }

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}


//* Attach a replay-audio button to a message bubble
//* Прикрепление кнопки повторного воспроизведения к сообщению
function addAudioRow(parentDiv, audioB64) {
    const row = document.createElement("div");
    row.className = "audio-row";
    const replayBtn = document.createElement("button");
    replayBtn.className = "audio-btn";
    replayBtn.innerHTML = "🔊 " + (t.replay_audio || "Replay");
    replayBtn.onclick = () => playAudio(audioB64);
    row.appendChild(replayBtn);
    parentDiv.appendChild(row);
// Auto-play audio when it arrives
    setTimeout(() => playAudio(audioB64), 100);
}


//* Show TTS error row inside a bot message
//* Отображение ошибки TTS внутри сообщения бота
function addTtsErrorRow(parentDiv, ttsError) {
    const row = document.createElement("div");
    row.className = "audio-row";
    const errSpan = document.createElement("span");
    errSpan.className = "tts-error";
    errSpan.textContent = "🎤 " + ttsError;
    row.appendChild(errSpan);
    parentDiv.appendChild(row);
}


//* Show typing indicator (animated dots)
//* Показ индикатора набора текста (анимированные точки)
function showTyping() {
    const div = document.createElement("div");
    div.className = "message bot";
    div.id = "typing-" + Date.now();
    const content = document.createElement("div");
    content.className = "message-content";
    content.innerHTML = `
        <div class="typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    div.appendChild(content);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div.id;
}


//* Remove typing indicator by its generated id
//* Удаление индикатора набора по сгенерированному id
function removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}


//? Convert plain text / markdown to safe HTML
//? Преобразование обычного текста / markdown в безопасный HTML
//* Format message text as safe HTML with markdown-like syntax
//* Форматирование текста сообщения в безопасный HTML с markdown-синтаксисом
// Example: formatMessage("**bold** and `code`") → "<strong>bold</strong> and <code>code</code>"
// Пример: formatMessage("**bold** and `code`") → "<strong>bold</strong> and <code>code</code>"
//* Try to configure marked — if CDN fails, quietly skip
//* Пытаемся настроить marked — если CDN недоступен, тихо пропускаем
try {
    marked.setOptions({
        gfm: true,      //* GitHub-flavoured markdown / Markdown в стиле GitHub
        breaks: true,   //* Convert line breaks to <br> / Преобразует переносы строк в <br>
        pedantic: false, //* Don't be strict about markdown / Не строгий режим разметки
    });
} catch {}
//* Функция не падает, даже если marked не загрузился
//* Function never throws, even if marked failed to load

//* Show branching cards — 3 response variants, user picks one
//* Показывает карточки ветвления — 3 варианта ответа, пользователь выбирает
function showBranchCards(container, branches, botDiv) {
    container.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "branch-wrapper";
    const heading = document.createElement("div");
    heading.className = "branch-heading";
    heading.textContent = t.branch_heading || "Choose a response:";
    wrapper.appendChild(heading);
    const cardsDiv = document.createElement("div");
    cardsDiv.className = "branch-cards";
    for (let i = 0; i < branches.length; i++) {
        const card = document.createElement("div");
        card.className = "branch-card";
        const num = document.createElement("div");
        num.className = "branch-num";
        num.textContent = "#" + (i + 1);
        card.appendChild(num);
        const text = document.createElement("div");
        text.className = "branch-text";
        text.innerHTML = formatMessage(branches[i]);
        card.appendChild(text);
        card.addEventListener("click", () => {
            container.innerHTML = "";
            container.innerHTML = formatMessage(branches[i]);
            card.scrollIntoView({ behavior: "smooth" });
        });
        cardsDiv.appendChild(card);
    }
    wrapper.appendChild(cardsDiv);
    container.appendChild(wrapper);
}

function formatMessage(text) {
    //* Strip raw markdown tables (lines with |---| separators or | cells) / Убираем сырые таблицы
    text = text.replace(/^\|.*\|.*\n(?:\|[\s:-]+\|.*\n)*/gm, "");
    //* Reduce headings to bold (### text → **text**) / Заменяем заголовки на жирный текст
    text = text.replace(/^#{1,6}\s+(.+)$/gm, "**$1**");
    try {
        const html = marked.parse(text);
        //* Sanitize model output — it is untrusted and may contain raw HTML
        //* Санитайзим ответ модели — он недоверенный и может содержать HTML
        if (window.DOMPurify) return DOMPurify.sanitize(html);
        return escapeHtml(text).replace(/\n/g, "<br>");
    } catch {
        return escapeHtml(text).replace(/\n/g, "<br>");
    }
}


//* Escape HTML entities in a string
//* Экранирование HTML-сущностей в строке
// Example: escapeHtml("<script>alert(1)</script>") → "&lt;script&gt;alert(1)&lt;/script&gt;"
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


//* Decode and play base64 audio
//* Декодирование и воспроизведение аудио из base64
// Example: playAudio(audioB64) — where audioB64 is base64-encoded WAV data
function playAudio(b64) {
    try {
// Convert base64 → raw bytes
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        // Copy each byte from the binary string into the typed array
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.playsinline = true;
        audio.setAttribute("playsinline", "");
        audio.setAttribute("webkit-playsinline", "");
        audio.style.display = "none";
        document.body.appendChild(audio);
        audio.onended = () => {
            URL.revokeObjectURL(url);
            if (audio.parentNode) audio.parentNode.removeChild(audio);
        };
        audio.play().catch(err => {
            console.warn("Audio play failed:", err.message);
        });
    } catch (err) {
        console.error("Audio error:", err.message);
    }
}


//* Update status indicator (ready / processing / error)
//* Обновление индикатора статуса (готов / обработка / ошибка)
function setStatus(text, type) {
    statusText.textContent = text;
    const glow = type === "ready" ? "rgba(0, 200, 83, 0.45)" :
                 type === "processing" ? "rgba(255, 165, 2, 0.45)" :
                 type === "error" ? "rgba(255, 71, 87, 0.45)" : "rgba(136, 136, 170, 0.35)";
    const ring = type === "ready" ? "rgba(0, 200, 83, 0.09)" :
                 type === "processing" ? "rgba(255, 165, 2, 0.09)" :
                 type === "error" ? "rgba(255, 71, 87, 0.09)" : "rgba(136, 136, 170, 0.08)";
    statusDot.style.background = type === "ready" ? "#00c853" :
                                  type === "processing" ? "#ffa502" :
                                  type === "error" ? "#ff4757" : "#8888aa";
    statusDot.style.boxShadow = `0 0 0 4px ${ring}, 0 0 12px ${glow}`;
}


//* Insert welcome message when chat is empty
//* Вставка приветственного сообщения, когда чат пуст
function addWelcomeMessage() {
    const div = document.createElement("div");
    div.className = "message welcome";
    const content = document.createElement("div");
    content.className = "message-content";
    content.innerHTML = `<p>${t.welcome_msg || "Hello! I am AI Assistant. Pick a model and ask a question!"}</p>`;
    div.appendChild(content);
    chatMessages.appendChild(div);
}


//* Load chat history from server
//* Загрузка истории чата с сервера
async function loadHistory() {
    try {
        const r = await fetch("/api/history");
        const history = await r.json();

        if (history && history.length > 0) {
            // Replay each saved message into the chat UI
            for (const msg of history) {
                addMessage(msg.content, msg.role);
            }
        } else {
            addWelcomeMessage();
        }
    } catch {
        addWelcomeMessage();
    }
}


//* Settings modal
//* Модальное окно настроек
const settingsBtn      = document.getElementById("settings-btn");
const settingsModal    = document.getElementById("settings-modal");
const settingsClose    = document.getElementById("settings-close");
const themePresets     = document.getElementById("theme-presets");
const themeApplyBtn    = document.getElementById("theme-apply-btn");

const updateBanner      = document.getElementById("update-banner");
const updateBannerText  = document.getElementById("update-banner-text");
const updateBannerDismiss = document.getElementById("update-banner-dismiss");
const checkUpdatesToggle = document.getElementById("check-updates-toggle");

initUpdateBannerDismiss();
initCheckUpdatesToggle();

//* Splash overlay element (kept for reference, splash runs via IIFE at top)
//* Элемент заставки (сохранён для ссылки, заставка запускается через IIFE в начале файла)
const splashOverlay    = document.getElementById("splash-overlay");

//* Container for saved custom models / Контейнер для списка сохранённых моделей
const savedAgentsList  = document.getElementById("saved-agents-list");
//* Beta: branch toggle / Бета: переключатель мульти-ответа
const branchToggle     = document.getElementById("branch-toggle");



//* Get the currently active theme name from body classes
//* Получение названия активной темы из классов body
function getCurrentTheme() {
    // Scan body classes for one that starts with "theme-"
    for (const c of document.body.classList) {
        if (c.startsWith("theme-")) return c.replace("theme-", "");
    }
    return "dark-purple";
}

let selectedTheme = getCurrentTheme();

//* Apply a theme by name (removes existing theme classes)
//* Применение темы по имени (удаляет существующие классы темы)
function applyTheme(name) {
    // Remove all existing theme classes before applying the new one
    document.body.classList.forEach(c => {
        if (c.startsWith("theme-")) document.body.classList.remove(c);
    });
    document.body.classList.add("theme-" + name);
}

//* Highlight the currently active theme card in the picker
//* Подсветка активной карточки темы в палитре
function highlightCurrentTheme() {
    const current = getCurrentTheme();
    // Highlight the card whose dataset.theme matches the current theme
    themePresets.querySelectorAll(".theme-card").forEach(card => {
        card.classList.toggle("active", card.dataset.theme === current);
    });
}

const orKeyInput       = document.getElementById("or-key-input");
const fishKeyInput     = document.getElementById("fish-key-input");
const hfKeyInput       = document.getElementById("hf-key-input");
const saveKeysBtn      = document.getElementById("save-keys-btn");
const keysSaveMsg      = document.getElementById("keys-save-msg");
const historyLimitInput = document.getElementById("history-limit-input");
const systemPromptInput = document.getElementById("system-prompt-input");
const saveSystemPromptBtn = document.getElementById("save-system-prompt-btn");
const systemPromptMsg    = document.getElementById("system-prompt-msg");

let historyLimitTimer = null;

//* Load API keys and config from the server
//* Загрузка API-ключей и конфигурации с сервера
async function loadKeys() {
    try {
        const r = await fetch("/api/config");
        const data = await r.json();
        orKeyInput.value         = data.or_key || "";
        fishKeyInput.value       = data.fish_key || "";
        hfKeyInput.value         = data.hf_key || "";
        historyLimitInput.value  = data.history_limit || 10;
        systemPromptInput.value  = data.system_prompt || "";
    } catch {}
}

// Auto-save history limit after 500ms debounce
historyLimitInput.addEventListener("input", () => {
    clearTimeout(historyLimitTimer);
    historyLimitTimer = setTimeout(async () => {
        const val = parseInt(historyLimitInput.value) || 10;
        try {
            await fetch("/api/history-limit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ limit: val }),
            });
        } catch {}
    }, 500);
});

// Save API keys (OpenRouter required, Fish/HF optional)
saveKeysBtn.addEventListener("click", async () => {
    const orKey   = orKeyInput.value.trim();
    const fishKey = fishKeyInput.value.trim();
    const hfKey   = hfKeyInput.value.trim();
    if (!orKey) {
        keysSaveMsg.textContent = "OpenRouter key is required";
        keysSaveMsg.className = "voice-msg error";
        return;
    }
    keysSaveMsg.textContent = "";
    saveKeysBtn.disabled = true;
    try {
        const r = await fetch("/api/save-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ or_key: orKey, fish_key: fishKey, hf_key: hfKey }),
        });
        const data = await r.json();
        if (data.success) {
            keysSaveMsg.textContent = t.keys_saved || "Keys saved!";
            keysSaveMsg.className = "voice-msg success";
        } else {
            keysSaveMsg.textContent = data.error || "Save error";
            keysSaveMsg.className = "voice-msg error";
        }
    } catch {
        keysSaveMsg.textContent = t.connection_error || "Connection error";
        keysSaveMsg.className = "voice-msg error";
    } finally {
        saveKeysBtn.disabled = false;
    }
});

//* Save or reset the system prompt
//* Сохраняет или сбрасывает системный промпт
saveSystemPromptBtn.addEventListener("click", async () => {
    const prompt = systemPromptInput.value;
    saveSystemPromptBtn.disabled = true;
    saveSystemPromptBtn.textContent = t.saving || "Saving...";
    systemPromptMsg.textContent = "";
    try {
        const r = await fetch("/api/system-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
        });
        const data = await r.json();
        if (data.success) {
            systemPromptMsg.textContent = t.system_prompt_saved || "Prompt saved!";
            systemPromptMsg.className = "voice-msg success";
        } else {
            systemPromptMsg.textContent = data.error || "Save error";
            systemPromptMsg.className = "voice-msg error";
        }
    } catch {
        systemPromptMsg.textContent = t.connection_error || "Connection error";
        systemPromptMsg.className = "voice-msg error";
    } finally {
        saveSystemPromptBtn.disabled = false;
        saveSystemPromptBtn.textContent = t.system_prompt_save || "Save prompt";
    }
});

// Open settings modal — load keys + highlight current theme
settingsBtn.addEventListener("click", () => {
    try {
        settingsModal.style.display = "flex";
        highlightCurrentTheme();
        loadKeys();
        keysSaveMsg.textContent = "";
        keysSaveMsg.className = "";
        systemPromptMsg.textContent = "";
        systemPromptMsg.className = "voice-msg";
    } catch (e) { console.error("Settings open error:", e); }
});

// Close settings modal
settingsClose.addEventListener("click", () => {
    settingsModal.style.display = "none";
});

// Close modal when clicking backdrop
settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.style.display = "none";
});

//? Theme card hover/click — live preview
//? Живой просмотр при наведении/клике
// Attach click/hover handlers to each theme card
themePresets.querySelectorAll(".theme-card").forEach(card => {
    card.addEventListener("click", () => {
        selectedTheme = card.dataset.theme;
        applyTheme(selectedTheme);
        // Remove active state from all other cards, then activate this one
        themePresets.querySelectorAll(".theme-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
    });
    card.addEventListener("mouseenter", () => {
        applyTheme(card.dataset.theme);
    });
    card.addEventListener("mouseleave", () => {
        applyTheme(selectedTheme);
    });
});

// Persist selected theme to server
themeApplyBtn.addEventListener("click", async () => {
    try {
        const r = await fetch("/api/theme", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme: selectedTheme }),
        });
        const data = await r.json();
        if (data.success) {
            applyTheme(data.theme);
            themeApplyBtn.textContent = t.theme_saved || "✓ Saved";
            setTimeout(() => { themeApplyBtn.textContent = t.apply || "Apply"; }, 2000);
        }
    } catch {}
});

//? Test models — calls each model and shows OK/ERROR
//? Тест моделей — проверяет каждую модель и показывает OK/ERROR


//* Init everything on page load — after splash has started its 1.8s timer
//* Инициализация при загрузке страницы — после того как сплэш запустил свой 1.8с таймер
document.addEventListener("DOMContentLoaded", async () => {
    //* Load chat history from server / Загружаем историю чата с сервера
    loadHistory();
    //* Focus the input field so user can type immediately / Фокус на поле ввода
    messageInput.focus();
    //* Load saved agents (URL checker feature) / Загружаем сохранённых агентов
    loadSavedAgents();

    //* Load config and sync the "check updates" toggle / Загружаем конфиг и синхронизируем тоггл обновлений
    try {
        fetch("/api/config").then(r => r.json()).then(d => {
            if (d.check_updates !== undefined) checkUpdatesToggle.checked = d.check_updates;
        }).catch(() => {});
    } catch {}

    //* Check for new GitHub releases / Проверяем новые релизы на GitHub
    checkForUpdates();
});

//* Fetch saved custom models from the server / Загружает сохранённые модели с сервера
async function loadSavedAgents() {
    try {
        const r = await fetch("/api/agents/list");
        if (!r.ok) throw new Error("HTTP " + r.status);
        const data = await r.json();
        renderSavedAgents(data.agents || []);
    } catch (err) {
        console.error("loadSavedAgents:", err);
    }
}

//* Render the list of saved custom models with remove buttons / Отрисовывает список кастомных моделей с кнопками удаления
function renderSavedAgents(agents) {
    savedAgentsList.innerHTML = "";
    if (!agents.length) {
        savedAgentsList.innerHTML = '<span class="voice-no-custom">' + (t.agent_no_agents || "No agents yet") + "</span>";
        return;
    }
    for (const a of agents) {
        const item = document.createElement("div");
        item.className = "agent-item";
        item.innerHTML = `<span class="agent-item-name">🤖 ${escapeHtml(a.name)}</span>
            <button class="agent-remove-btn" data-model-id="${escapeHtml(a.id)}">${t.agent_remove || "Remove"}</button>`;
        savedAgentsList.appendChild(item);
    }
    //* Attach remove handler to each agent / Вешаем обработчик удаления на каждого агента
    savedAgentsList.querySelectorAll(".agent-remove-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const modelId = btn.dataset.modelId;
            try {
                const r = await fetch("/api/agents/remove", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: "https://openrouter.ai/" + modelId }),
                });
                const data = await r.json();
                if (data.success) {
                    //* Remove the option from model-select dropdown / Удаляем опцию из выпадающего списка
                    const opt = modelSelect.querySelector(`option[value="${escapeHtml(modelId)}"]`);
                    if (opt) opt.remove();
                    loadSavedAgents();
                }
            } catch {}
        });
    });
}

//* ============================================================
//* Free models browser / Браузер бесплатных моделей
//* ============================================================

const browseModelsBtn = document.getElementById("browse-models-btn");
const modelsModal     = document.getElementById("models-modal");
const modelsClose     = document.getElementById("models-close");
const modelsSearch    = document.getElementById("models-search");
const modelsRefresh   = document.getElementById("models-refresh");
const modelsStatus    = document.getElementById("models-status");
const modelsList      = document.getElementById("models-list");

let freeModels       = [];
let freeModelsLoaded = false;
let modelsLoading    = false;

function openModelsModal() {
    modelsModal.style.display = "flex";
    if (!freeModelsLoaded) loadFreeModels(false);
    else renderFreeModels();
}

async function loadFreeModels(force) {
    if (modelsLoading) return;
    modelsLoading = true;
    modelsStatus.textContent = t.models_loading || "Loading models...";
    modelsStatus.className = "voice-msg";
    modelsList.innerHTML = "";
    try {
        const r = await fetch("/api/models/browse" + (force ? "?refresh=1" : ""));
        const data = await r.json();
        if (!r.ok || !data.success) throw new Error(data.error || "HTTP " + r.status);
        freeModels = data.items || [];
        freeModelsLoaded = true;
        modelsStatus.textContent = "";
        renderFreeModels();
    } catch (err) {
        modelsStatus.textContent = (t.models_error || "Failed to load models") + ": " + err.message;
        modelsStatus.className = "voice-msg error";
        freeModelsLoaded = false;
    } finally {
        modelsLoading = false;
    }
}

function modelDateLabel(item) {
    if (item.knowledge_cutoff) {
        return (t.models_knowledge || "Knowledge cutoff") + ": " + item.knowledge_cutoff;
    }
    if (item.created) {
        const d = new Date(item.created * 1000);
        if (!isNaN(d.getTime())) {
            return (t.models_released || "Released") + ": " +
                d.toLocaleDateString(UI_LOCALE, { year: "numeric", month: "short" });
        }
    }
    return "";
}

function renderFreeModels() {
    if (!modelsList) return;
    const q = (modelsSearch.value || "").trim().toLowerCase();
    const items = freeModels.filter(m => {
        const hay = [m.name, m.full_name, m.author, m.id].join(" ").toLowerCase();
        return !q || hay.includes(q);
    });

    modelsList.innerHTML = "";
    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "models-empty";
        empty.textContent = t.models_empty || "No free models found";
        modelsList.appendChild(empty);
        return;
    }

    for (const item of items) {
        const card = document.createElement("div");
        card.className = "model-card";

        const info = document.createElement("div");
        info.className = "model-info";

        const nameRow = document.createElement("div");
        nameRow.className = "model-name-row";
        const name = document.createElement("span");
        name.className = "model-name";
        name.textContent = item.name;
        nameRow.appendChild(name);
        const badge = document.createElement("span");
        badge.className = "model-free-badge";
        badge.textContent = t.models_free_badge || "Free";
        nameRow.appendChild(badge);
        info.appendChild(nameRow);

        const meta = document.createElement("div");
        meta.className = "model-meta";
        const author = document.createElement("span");
        author.textContent = (t.models_author || "By") + " " + item.author;
        meta.appendChild(author);
        const dateLabel = modelDateLabel(item);
        if (dateLabel) {
            const date = document.createElement("span");
            date.textContent = dateLabel;
            meta.appendChild(date);
        }
        if (item.context_length) {
            const ctx = document.createElement("span");
            ctx.textContent = (t.models_context || "Context") + ": " +
                Math.round(item.context_length / 1000) + "K";
            meta.appendChild(ctx);
        }
        info.appendChild(meta);

        if (item.description) {
            const desc = document.createElement("div");
            desc.className = "model-desc";
            desc.textContent = item.description;
            info.appendChild(desc);
        }
        card.appendChild(info);

        const btn = document.createElement("button");
        btn.className = "model-add-btn" + (item.added ? " added" : "");
        btn.textContent = item.added ? (t.models_added || "Added") : (t.models_add || "Add");
        btn.disabled = !!item.added;
        btn.addEventListener("click", () => addFreeModel(item, btn));
        card.appendChild(btn);

        modelsList.appendChild(card);
    }
}

async function addFreeModel(item, btn) {
    btn.disabled = true;
    btn.textContent = t.models_adding || "Adding...";
    try {
        const r = await fetch("/api/agents/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model_id: item.id, name: item.name, url: item.url }),
        });
        const data = await r.json();
        if (!data.success) throw new Error(data.error || "Save failed");

        item.added = true;
        btn.textContent = t.models_added || "Added";
        btn.classList.add("added");

        if (data.model) {
            let opt = Array.from(modelSelect.options).find(o => o.value === data.model.id);
            if (!opt) {
                opt = document.createElement("option");
                modelSelect.appendChild(opt);
            }
            opt.value = data.model.id;
            opt.textContent = data.model.name + " (openrouter)";
            modelSelect.value = data.model.id;
        }
        loadSavedAgents();
    } catch (err) {
        btn.disabled = false;
        btn.textContent = t.models_add || "Add";
        modelsStatus.textContent = (t.models_error || "Failed to add model") + ": " + err.message;
        modelsStatus.className = "voice-msg error";
    }
}

if (browseModelsBtn) browseModelsBtn.addEventListener("click", openModelsModal);
if (modelsClose) modelsClose.addEventListener("click", () => { modelsModal.style.display = "none"; });
if (modelsModal) modelsModal.addEventListener("click", (e) => {
    if (e.target === modelsModal) modelsModal.style.display = "none";
});
if (modelsSearch) modelsSearch.addEventListener("input", renderFreeModels);
if (modelsRefresh) modelsRefresh.addEventListener("click", () => loadFreeModels(true));
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modelsModal && modelsModal.style.display !== "none") {
        modelsModal.style.display = "none";
    }
});

//* ============================================================
//* Fish Audio voice browser / Каталог голосов Fish Audio
//* ============================================================

const browseVoicesBtn = document.getElementById("browse-voices-btn");
const voicesModal     = document.getElementById("voices-modal");
const voicesClose     = document.getElementById("voices-close");
const voicesSearch    = document.getElementById("voices-search");
const voicesLanguage  = document.getElementById("voices-language");
const voicesRefresh   = document.getElementById("voices-refresh");
const voicesStatus    = document.getElementById("voices-status");
const voicesList      = document.getElementById("voices-list");
const voicesLoadMore  = document.getElementById("voices-load-more");

let browseVoicesItems  = [];
let browseVoicesPage   = 1;
let browseVoicesHasMore = false;
let browseVoicesLoading = false;
let voicesSearchTimer   = null;
let previewVoiceAudio   = null;
let previewVoiceId      = null;
let previewVoiceBtn     = null;

function openVoicesModal() {
    voicesModal.style.display = "flex";
    if (!browseVoicesItems.length) loadBrowseVoices(true);
    else renderBrowseVoices();
}

function stopVoicePreview() {
    if (previewVoiceAudio) {
        previewVoiceAudio.pause();
        previewVoiceAudio = null;
    }
    if (previewVoiceBtn) {
        previewVoiceBtn.textContent = t.voices_preview || "Preview";
        previewVoiceBtn.classList.remove("playing");
    }
    previewVoiceId = null;
    previewVoiceBtn = null;
}

function isVoiceAdded(voiceId) {
    return Array.from(voiceSelect.options).some(o => o.value === voiceId);
}

function compactNumber(n) {
    try {
        return new Intl.NumberFormat(UI_LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(n);
    } catch {
        return String(n);
    }
}

async function loadBrowseVoices(reset) {
    if (browseVoicesLoading) return;
    if (reset) {
        browseVoicesPage = 1;
        browseVoicesItems = [];
        stopVoicePreview();
    }
    browseVoicesLoading = true;
    if (reset) {
        voicesStatus.textContent = t.models_loading || "Loading...";
        voicesStatus.className = "voice-msg";
        voicesList.innerHTML = "";
    }
    voicesLoadMore.disabled = true;

    try {
        const params = new URLSearchParams({
            page: String(browseVoicesPage),
            per_page: "24",
        });
        const q = voicesSearch.value.trim();
        const lang = voicesLanguage.value;
        if (q) params.set("search", q);
        if (lang) params.set("lang", lang);

        const r = await fetch("/api/voices/browse?" + params.toString());
        const data = await r.json();
        if (!r.ok || !data.success) throw new Error(data.error || "HTTP " + r.status);

        const known = new Set(browseVoicesItems.map(v => v.id));
        for (const item of data.items || []) {
            if (!known.has(item.id)) browseVoicesItems.push(item);
        }
        browseVoicesHasMore = !!data.has_more;
        browseVoicesPage += 1;
        voicesStatus.textContent = "";
        voicesStatus.className = "voice-msg";
        renderBrowseVoices();
    } catch (err) {
        voicesStatus.textContent = (t.voices_error || "Failed to load voices") + ": " + err.message;
        voicesStatus.className = "voice-msg error";
    } finally {
        browseVoicesLoading = false;
        voicesLoadMore.disabled = false;
        updateVoicesLoadMore();
    }
}

function updateVoicesLoadMore() {
    if (!voicesLoadMore) return;
    voicesLoadMore.style.display = browseVoicesHasMore ? "" : "none";
    voicesLoadMore.textContent = t.voices_load_more || "Load more";
    voicesLoadMore.disabled = browseVoicesLoading;
}

function playVoicePreview(item, btn) {
    if (!item.preview_url) return;
    if (previewVoiceId === item.id) {
        stopVoicePreview();
        return;
    }
    stopVoicePreview();

    previewVoiceId = item.id;
    previewVoiceBtn = btn;
    previewVoiceAudio = new Audio("/api/voices/preview?url=" + encodeURIComponent(item.preview_url));
    btn.textContent = t.voices_stop || "Stop";
    btn.classList.add("playing");
    previewVoiceAudio.onended = stopVoicePreview;
    previewVoiceAudio.onerror = stopVoicePreview;
    previewVoiceAudio.play().catch(stopVoicePreview);
}

function renderBrowseVoices() {
    voicesList.innerHTML = "";
    if (!browseVoicesItems.length) {
        const empty = document.createElement("div");
        empty.className = "models-empty";
        empty.textContent = t.voices_empty || "No voices found";
        voicesList.appendChild(empty);
        return;
    }

    for (const item of browseVoicesItems) {
        const card = document.createElement("div");
        card.className = "voice-card";

        const info = document.createElement("div");
        info.className = "voice-card-info";

        const nameRow = document.createElement("div");
        nameRow.className = "voice-card-name-row";
        const name = document.createElement("span");
        name.className = "voice-card-name";
        name.textContent = item.name;
        nameRow.appendChild(name);

        for (const lang of (item.languages || []).slice(0, 2)) {
            const chip = document.createElement("span");
            chip.className = "voice-lang-chip";
            chip.textContent = String(lang).toUpperCase();
            nameRow.appendChild(chip);
        }
        info.appendChild(nameRow);

        const meta = document.createElement("div");
        meta.className = "voice-card-meta";
        if (item.like_count) {
            const likes = document.createElement("span");
            likes.textContent = "♥ " + compactNumber(item.like_count);
            meta.appendChild(likes);
        }
        if (item.task_count) {
            const uses = document.createElement("span");
            uses.textContent = "▶ " + compactNumber(item.task_count);
            meta.appendChild(uses);
        }
        if (item.description) {
            const desc = document.createElement("span");
            desc.className = "voice-card-desc";
            desc.textContent = item.description;
            meta.appendChild(desc);
        }
        info.appendChild(meta);

        if (item.tags && item.tags.length) {
            const tags = document.createElement("div");
            tags.className = "voice-card-tags";
            for (const tag of item.tags.slice(0, 4)) {
                const chip = document.createElement("span");
                chip.textContent = tag;
                tags.appendChild(chip);
            }
            info.appendChild(tags);
        }
        card.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "voice-card-actions";

        const preview = document.createElement("button");
        preview.className = "voice-preview-btn";
        preview.textContent = t.voices_preview || "Preview";
        preview.dataset.id = item.id;
        preview.disabled = !item.preview_url;
        preview.addEventListener("click", () => playVoicePreview(item, preview));
        actions.appendChild(preview);

        const add = document.createElement("button");
        const added = isVoiceAdded(item.id);
        add.className = "model-add-btn" + (added ? " added" : "");
        add.textContent = added ? (t.models_added || "Added") : (t.models_add || "Add");
        add.disabled = added;
        add.addEventListener("click", () => addBrowseVoice(item, add));
        actions.appendChild(add);

        card.appendChild(actions);
        voicesList.appendChild(card);
    }
}

async function addBrowseVoice(item, btn) {
    btn.disabled = true;
    btn.textContent = t.models_adding || "Adding...";
    try {
        const r = await fetch("/api/voices/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: item.name,
                url: "https://fish.audio/voices/" + item.id + "/",
            }),
        });
        const data = await r.json();
        if (!r.ok || !data.success) throw new Error(data.error || "Save failed");

        rebuildVoiceSelect(data.voices);
        voiceSelect.value = item.id;
        btn.textContent = t.models_added || "Added";
        btn.classList.add("added");
        voicesStatus.textContent = t.voice_add_success || "Voice added!";
        voicesStatus.className = "voice-msg success";
    } catch (err) {
        btn.disabled = false;
        btn.textContent = t.models_add || "Add";
        voicesStatus.textContent = (t.voice_add_error || "Failed to add voice") + ": " + err.message;
        voicesStatus.className = "voice-msg error";
    }
}

if (browseVoicesBtn) browseVoicesBtn.addEventListener("click", openVoicesModal);
if (voicesClose) voicesClose.addEventListener("click", () => { stopVoicePreview(); voicesModal.style.display = "none"; });
if (voicesModal) voicesModal.addEventListener("click", (e) => {
    if (e.target === voicesModal) { stopVoicePreview(); voicesModal.style.display = "none"; }
});
if (voicesSearch) voicesSearch.addEventListener("input", () => {
    clearTimeout(voicesSearchTimer);
    voicesSearchTimer = setTimeout(() => loadBrowseVoices(true), 350);
});
if (voicesLanguage) voicesLanguage.addEventListener("change", () => loadBrowseVoices(true));
if (voicesRefresh) voicesRefresh.addEventListener("click", () => loadBrowseVoices(true));
if (voicesLoadMore) voicesLoadMore.addEventListener("click", () => loadBrowseVoices(false));
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && voicesModal && voicesModal.style.display !== "none") {
        stopVoicePreview();
        voicesModal.style.display = "none";
    }
});

//* File uploads are temporarily disabled — block browser drop navigation
//* Загрузка файлов временно отключена — блокируем переход при перетаскивании
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());

//* ============================================================
//* Mic toggle — click to start recording, click again to stop & send
//* Microphone — click to start recording, click again to stop and transcribe
//* Микрофон — клик начать запись, повторный клик остановить и распознать
//* ============================================================

const micBtn = document.getElementById("mic-btn");
const micStatus = document.getElementById("mic-status");

//* Mic state / Состояние микрофона
let isListening = false;
let mediaRec = null;
let mediaStreamRec = null;
let recChunks = [];

//* Map the app language to an ISO 639-1 code for the STT server
//* Сопоставляем язык приложения с кодом ISO 639-1 для STT-сервера
function micLangCode() {
    return LOCALE_BY_LANG[CURRENT_LANG] || "en-US";
}

function micMsg(text, type) {
    if (micStatus) {
        micStatus.textContent = text;
        micStatus.className = "mic-status" + (type ? " " + type : "");
    }
    if (text) console.log("[mic]", type, text);
}

//* Unified entry point: first click starts recording, second click stops it.
//* On stop the audio is transcribed server-side and sent to the AI.
//* Единая точка входа: первый клик начинает запись, второй — останавливает.
//* После остановки аудио распознаётся на сервере и отправляется в ИИ.
function startMic() {
    if (isListening) return;
    startRecorder();
}

function stopMic() {
    if (isListening) stopRecorder();
}

function stopMic() {
    if (isListening) stopRecorder();
}

//* ============================================================
//* RECORDING PIPELINE / ПАЙПЛАЙН ЗАПИСИ:
//* Records audio with MediaRecorder, then POSTs it to /api/stt,
//* which transcribes it via the local Whisper model and returns text.
//* We then drop the text into the input and auto-send it.
//* Записывает аудио через MediaRecorder, отправляет на /api/stt, где оно
//* распознаётся локальным Whisper. Текст кладётся в поле ввода и
//* отправляется в ИИ автоматически.
//* ============================================================

//* Converts a Blob to a base64 string (for the JSON payload)
//* Конвертирует Blob в base64-строку (для JSON-полезной нагрузки)
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
        fr.onerror = reject;
        fr.readAsDataURL(blob);
    });
}

async function startRecorder() {
    try {
        mediaStreamRec = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        console.error("getUserMedia failed:", e);
        micBtn.classList.remove("recording");
        isListening = false;
        micMsg(t.mic_denied || "Microphone access denied. Allow mic in browser settings.", "error");
        return;
    }
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
    mediaRec = new MediaRecorder(mediaStreamRec, mime ? { mimeType: mime } : undefined);
    recChunks = [];
    mediaRec.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    mediaRec.onstop = () => sendRecording();
    mediaRec.start();
    micBtn.classList.add("recording");
    micMsg(t.mic_listening || "Listening...", "");
    isListening = true;
}

function stopRecorder() {
    if (mediaRec && mediaRec.state !== "inactive") mediaRec.stop();
}

async function sendRecording() {
    micBtn.classList.remove("recording");
    isListening = false;
    if (mediaStreamRec) mediaStreamRec.getTracks().forEach((tr) => tr.stop());
    mediaStreamRec = null;
    if (!recChunks.length) { micMsg(""); return; }

    const blob = new Blob(recChunks, { type: recChunks[0].type || "audio/webm" });
    recChunks = [];
    micMsg(t.mic_sending || "Transcribing...", "");
    try {
        const audioB64 = await blobToBase64(blob);
        const r = await fetch("/api/stt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: audioB64, lang: micLangCode() }),
        });
        const data = await r.json();
        micMsg("");
        const text = (data.text || "").trim();
        if (text) {
            messageInput.value = text;
            autoResize(messageInput);
            sendMessage();
        } else {
            micMsg(t.mic_no_speech || "No speech detected. Try again.", "error");
        }
    } catch (e) {
        console.error("STT failed:", e);
        micMsg(t.mic_failed || "Failed to process the recording.", "error");
    }
}

micBtn.addEventListener("click", () => {
    if (isListening) stopMic();
    else startMic();
});

//* ============================================================
//* Strip markdown for TTS / Очистка markdown для голосового вывода
//* ============================================================
//* Removes markdown syntax so TTS reads clean natural text
//* Удаляет markdown-разметку, чтобы TTS читал чистый естественный текст
//* Server-side equivalent: app.py → _strip_md()
//* Серверный аналог: app.py → _strip_md()

function stripMarkdown(text) {
    return text
        //* Remove code blocks / Удаляем блоки кода (```...```)
        .replace(/```[\s\S]*?```/g, "code block")
        //* Remove inline code / Удаляем инлайн-код (`code`)
        .replace(/`([^`]+)`/g, "$1")
        //* Remove markdown headers (##, ###, etc) / Удаляем заголовки
        .replace(/^#{1,6}\s+/gm, "")
        //* Remove bold / italic markers (*, **, _, __) / Удаляем выделение жирным/курсивом
        .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, "$2")
        //* Remove links [text](url) → keep text / Удаляем ссылки, оставляем текст
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        //* Remove images ![alt](url) → keep alt / Удаляем изображения, оставляем alt
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        //* Remove horizontal rules (---, ***, ___) / Удаляем горизонтальные разделители
        .replace(/^(?:---|\*\*\*|___)\s*$/gm, "")
        //* Remove unordered list markers (-, *, +) / Удаляем маркеры ненумерованных списков
        .replace(/^[\s]*[-*+]\s+/gm, "")
        //* Remove ordered list markers (1., 2., etc) / Удаляем маркеры нумерованных списков
        .replace(/^[\s]*\d+\.\s+/gm, "")
        //* Remove blockquote markers (>) / Удаляем маркеры цитат
        .replace(/^>\s+/gm, "")
        //* Remove table separators / Удаляем разделители таблиц
        .replace(/^[\s]*\|[\s\-:|]+\|[\s\-:|]*$/gm, "")
        //* Remove strikethrough (~~text~~) / Удаляем зачёркивание
        .replace(/~~(.*?)~~/g, "$1")
        //* Collapse multiple spaces into one / Склеиваем множественные пробелы в один
        .replace(/\s+/g, " ")
        .trim();
}


//* Hand Assistant — control the OS mouse via MediaPipe hand tracking
//* Hand Assistant — управление мышью жестами руки через MediaPipe
//* ============================================================
//* Gestures / Жесты:
//*   open hand → move cursor / открытая ладонь → движение курсора
//*   thumb bent (folded) → press left button / согнутый большой палец → нажать ЛКМ
//*   thumb held bent → hold left button (drag) / держим палец согнутым → ЛКМ зажата
//*   thumb released → release left button / разогнул палец → отпустить ЛКМ
//* ============================================================

const handToggle = document.getElementById("hand-toggle");
const handPanel = document.getElementById("hand-panel");
const handVideo = document.getElementById("hand-video");
const handPanelStatus = document.getElementById("hand-panel-status");
const handMsg = document.getElementById("hand-msg");

let handStream = null;
let handLandmarker = null;
let handActive = false;
let handSizeCanvas = null;

//* Local bundled MediaPipe (no CDN needed) / Локальные файлы MediaPipe (без CDN)
const HAND_WASM = "/static/js/mediapipe/wasm";
const HAND_MODEL = "/static/js/mediapipe/hand_landmarker.task";
const HAND_BUNDLE = "/static/js/mediapipe/vision_bundle.mjs";

function handMsgSet(text, type) {
    if (handMsg) {
        handMsg.textContent = text;
        handMsg.className = "hand-msg" + (type ? " " + type : "");
    }
    if (handPanelStatus) handPanelStatus.textContent = text;
    if (text) console.log("[hand]", type, text);
}

function dist2(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

async function loadHandLandmarker() {
    if (handLandmarker) return handLandmarker;
    //* Load the MediaPipe bundle once via dynamic import / Загружаем бандл один раз через динамический импорт
    if (!window.__mediapipeBundle) {
        window.__mediapipeBundle = await import(HAND_BUNDLE);
    }
    const vision = await window.__mediapipeBundle.FilesetResolver.forVisionTasks(HAND_WASM);
    //* Try GPU first, fall back to CPU (some WebViews don't support WebGL)
    //* Сначала пробуем GPU, при неудаче переходим на CPU
    const make = (delegate) => window.__mediapipeBundle.HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
    });
    try {
        handLandmarker = await make("GPU");
    } catch (e) {
        console.warn("[hand] GPU delegate failed, using CPU:", e);
        handLandmarker = await make("CPU");
    }
    return handLandmarker;
}

async function startHandAssistant() {
    handMsgSet(t.hand_init || "Initializing camera...", "");
    try {
        await loadHandLandmarker();
    } catch (e) {
        handToggle.checked = false;
        handMsgSet(t.hand_mediapipe_error || "Hand tracking library failed to load. Check your internet connection.", "error");
        return;
    }
    try {
        handStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
        });
    } catch (e) {
        handToggle.checked = false;
        handMsgSet(t.hand_camera_error || "Camera access denied or unavailable. Allow camera access and try again.", "error");
        return;
    }
    handVideo.srcObject = handStream;
    handPanel.style.display = "block";
    handActive = true;
    handMsgSet(t.hand_ready || "Hand Assistant is active.", "success");
    //* Match the overlay canvas to the actual video resolution / Подгоняем канвас под разрешение видео
    const cv = document.getElementById("hand-canvas");
    handSizeCanvas = () => {
        if (cv && handVideo.videoWidth) {
            cv.width = handVideo.videoWidth;
            cv.height = handVideo.videoHeight;
        }
    };
    handSizeCanvas();
    handVideo.addEventListener("loadedmetadata", handSizeCanvas);
    startHandLoop();
    handVideo.play().catch(() => {});
}

function stopHandAssistant() {
    handActive = false;
    stopHandLoop();
    if (handStream) {
        handStream.getTracks().forEach((tr) => tr.stop());
        handStream = null;
    }
    if (handVideo) {
        handVideo.srcObject = null;
        if (handSizeCanvas) handVideo.removeEventListener("loadedmetadata", handSizeCanvas);
    }
    if (handPanel) handPanel.style.display = "none";
    if (handToggle) handToggle.checked = false;
    const cv = document.getElementById("hand-canvas");
    if (cv) cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
    thumbDown = false;
    thumbDownFrames = thumbUpFrames = 0;
}

//* Send a mouse command to the local Flask server (OS-level control)
//* Отправляем команду мыши на локальный Flask-сервер (управление на уровне ОС)
function sendHand(action, payload) {
    fetch("/api/hand/mouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ action }, payload || {})),
    }).catch(() => {});
}

//* Gesture state / Состояние жестов
let handSmoothX = 0.5, handSmoothY = 0.5;
let lastSentX = 0.5, lastSentY = 0.5;
let handHasControl = false, handGoneFrames = 0;
let thumbDown = false;               // LMB currently held / ЛКМ зажата сейчас
let thumbDownFrames = 0, thumbUpFrames = 0;
let lastMoveSent = 0;
let lastTickAt = 0;                  // timestamp of the previous detection tick
let handTimerId = null;

const HAND_LOOP_MS = 33;            // ~30 fps detection / ~30 кадров/с
const HAND_SMOOTH = 0.2;            // cursor low-pass per 33 ms (lower = smoother)
const HAND_DEADZONE = 0.0012;       // normalized dead zone before sending a move
const HAND_THUMB_FACTOR = 1.15;     // thumb counts as folded when tip is this close to wrist
const HAND_GUARD_FRAMES = 2;        // consecutive frames needed to press/release LMB

//* ============================================================
//* HAND SKELETON RENDERER (fully custom, NOT Google's DrawingUtils)
//* ОТРИСОВКА СКЕЛЕТА РУКИ (полностью своя, НЕ гугловский DrawingUtils)
//* ============================================================
//* WHY CUSTOM: Google's MediaPipe ships DrawingUtils.drawLandmarks /
//* drawConnectors helpers. We deliberately DON'T use them here and instead
//* draw every dot and line ourselves with the raw Canvas 2D API. This gives
//* us full control over styling (colors, glow, sizes), zero extra imports,
//* and a lightweight, transparent renderer.
//* ЗАЧЕМ СВОЙ: в MediaPipe есть готовые хелперы DrawingUtils для точек и
//* линий. Здесь мы СОЗНАТЕЛЬНО их не используем и рисуем каждую точку и
//* линию сами через низкоуровневый Canvas 2D API. Так мы полностью
//* контролируем стиль (цвета, свечение, размеры), не тянем лишний код и
//* получаем прозрачный и лёгкий рендер.
//*
//* THE DATA — HOW LANDMARKS WORK / ДАННЫЕ — КАК УСТРОЕНЫ ЛАНДМАРКИ:
//* ------------------------------------------------------------------
//* MediaPipe's hand landmarker returns 21 landmarks per hand. Each
//* landmark is a point with normalized coordinates: x and y are floats
//* from 0.0 to 1.0 (0,0 = top-left corner of the VIDEO FRAME, 1,1 =
//* bottom-right). z is depth. "Normalized" means the numbers do NOT depend
//* on camera resolution — 0.5 is always the horizontal middle.
//* Модель MediaPipe возвращает 21 ландмарк на руку. Каждый ландмарк —
//* точка с нормализованными координатами: x и y — числа от 0.0 до 1.0
//* (0,0 = левый верхний угол КАДРА ВИДЕО, 1,1 = правый нижний). z — глубина.
//* «Нормализованные» значит числа не зависят от разрешения камеры —
//* 0.5 это всегда горизонтальная середина.
//*
//* LANDMARK INDEXES (standard MediaPipe hand skeleton) / ИНДЕКСЫ ТОЧЕК:
//* ------------------------------------------------------------------
//*   0  = wrist / запястье
//*   1,2,3,4   = thumb   (CMC, MCP, IP, TIP)   большой палец
//*   5,6,7,8   = index   (MCP, PIP, DIP, TIP)  указательный
//*   9,10,11,12= middle  (MCP, PIP, DIP, TIP)  средний
//*   13,14,15,16 = ring   (MCP, PIP, DIP, TIP) безымянный
//*   17,18,19,20= pinky  (MCP, PIP, DIP, TIP)  мизинец
//*
//* HAND_BONES — the skeleton connections below are the list of (indexA,
//* indexB) pairs that link adjacent joints into bones. It's a plain
//* hard-coded table (the same topology Google's HAND_CONNECTIONS uses,
//* but written out here as our own data so the renderer is self-contained).
//* HAND_BONES — пары индексов (A, B), которые соединяют соседние суставы
//* в «кости». Это обычная захардкоженная таблица (та же топология, что и
//* в гугловском HAND_CONNECTIONS, но выписана здесь как наши собственные
//* данные, чтобы рендер был полностью автономным).
const HAND_BONES = [
    //* Thumb: wrist→CMC→MCP→IP→TIP / Большой: запястье→CMC→MCP→IP→кончик
    [0, 1], [1, 2], [2, 3], [3, 4],
    //* Index: MCP→PIP→DIP→TIP / Указательный
    [5, 6], [6, 7], [7, 8],
    //* Middle: MCP→PIP→DIP→TIP / Средний
    [9, 10], [10, 11], [11, 12],
    //* Ring: MCP→PIP→DIP→TIP / Безымянный
    [13, 14], [14, 15], [15, 16],
    //* Pinky: MCP→PIP→DIP→TIP / Мизинец
    [17, 18], [18, 19], [19, 20],
    //* Palm: wrist connects to each finger's base knuckle / Ладонь:
    //* запястье связано с основаниями всех пальцев
    [0, 5], [0, 17], [5, 9], [9, 13], [13, 17],
];

//* Landmark indexes that are finger TIPS — drawn bigger & golden / Точки
//* на кончиках пальцев — рисуем крупнее и золотистым цветом
const HAND_TIPS = new Set([4, 8, 12, 16, 20]);

//* Renders all detected hands on top of the mirrored preview video.
//* Рисует все найденные руки поверх зеркального предпросмотра видео.
function drawHands(res) {
    const cv = document.getElementById("hand-canvas");
    if (!cv) return;
    const ctx = cv.getContext("2d");

    //* 1) WIPE / ОЧИСТКА: erase the dots from the previous frame so we
    //* start from a blank canvas each time. Canvas 2D has no auto-clear,
    //* so we do it manually over the full pixel area.
    //* Стираем точки прошлого кадра, чтобы начинать с чистого листа.
    ctx.clearRect(0, 0, cv.width, cv.height);

    //* Nothing to draw — leave the canvas blank / Нечего рисовать — пусто.
    if (!res || !res.landmarks || !res.landmarks.length) return;

    //* 2) UNIT SCALING / МАСШТАБ: the canvas pixel size equals the raw
    //* camera resolution (we set cv.width/height in startHandAssistant).
    //* Landmarks are normalized 0..1, so each normalized unit spans the
    //* whole canvas. We multiply x by width and y by height to land on
    //* the exact pixel where the joint actually is in the frame.
    //* Пиксельный размер канваса равен разрешению камеры (задаём в
    //* startHandAssistant). Ландмарки нормализованы 0..1, значит каждая
    //* единица растягивается на весь канвас. Умножаем x на ширину, y на
    //* высоту — и попадаем точно в пиксель, где реально находится сустав.
    const W = cv.width, H = cv.height;

    //* Handled per detected hand (up to 2) / Обрабатываем каждую руку
    //* (в кадре их может быть до двух).
    for (const hand of res.landmarks) {
        //* Convert normalized → pixels for all 21 points at once.
        //* Конвертируем нормализованные координаты → пиксели для всех
        //* 21 точки разом.
        const pts = hand.map(p => ({ x: p.x * W, y: p.y * H }));

        //* 3) BONES / «КОСТИ»: draw connecting lines UNDER the dots.
        //* Line width scales with the camera resolution so the skeleton
        //* looks the same on any webcam.
        //* Рисуем соединительные линии ПОД точками. Толщина линии
        //* масштабируется от разрешения камеры — скелет одинаков на любой
        //* вебке.
        ctx.lineJoin = "round";          // smooth bone joints / скруглённые стыки
        ctx.lineCap  = "round";          // rounded bone ends / круглые концы
        ctx.strokeStyle = "rgba(0, 255, 136, 0.85)";  // neon green / неоново-зелёный
        ctx.lineWidth = Math.max(2, (W / 640) * 2);
        for (const [a, b] of HAND_BONES) {
            ctx.beginPath();
            ctx.moveTo(pts[a].x, pts[a].y);   // bone start / начало «кости»
            ctx.lineTo(pts[b].x, pts[b].y);   // bone end   / конец «кости»
            ctx.stroke();
        }

        //* 4) JOINTS / СУСТАВЫ: glowing dots on top of the bones.
        //* The "glow" is a radial feel created with shadowBlur — a soft
        //* halo around each dot. Fingertips are golden and slightly bigger,
        //* everything else is white. Wrist (index 0) is drawn largest.
        //* Светящиеся точки поверх «костей». «Свечение» делаем через
        //* shadowBlur — мягкий ореол вокруг точки. Кончики пальцев —
        //* золотистые и крупнее, остальные — белые. Запястье (0) — самое
        //* большое.
        const baseR = Math.max(3, (W / 640) * 3);      // normal joint size
        for (let i = 0; i < pts.length; i++) {
            const isTip  = HAND_TIPS.has(i);           // fingertip? / это кончик?
            const radius = isTip ? baseR * 1.3 : baseR; // tips a bit larger
            ctx.beginPath();
            ctx.arc(pts[i].x, pts[i].y, radius, 0, Math.PI * 2);
            ctx.fillStyle = isTip ? "#FFD54F" : "#FFFFFF";  // gold/white
            ctx.shadowColor = isTip ? "#FFD54F" : "#00FF88"; // matching glow
            ctx.shadowBlur = isTip ? 10 : 6;               // halo strength
            ctx.fill();
        }
        //* Reset the glow so it never leaks into the next frame / Сбрасываем
        //* свечение, чтобы оно не «протекало» в следующий кадр.
        ctx.shadowBlur = 0;
    }
}

function processHand(lm) {
    //* TIME-ADAPTIVE SMOOTHING / СГЛАЖИВАНИЕ ПО ВРЕМЕНИ:
    //* The low-pass factor HAND_SMOOTH is "per 33 ms tick". When the OS
    //* minimizes the window it throttles our setInterval to a fraction of
    //* the normal rate (e.g. once a second). With a fixed per-tick factor
    //* the cursor would only creep a small step each time — the "slow
    //* motion" effect. Fix: convert the factor to real time. We compute
    //* how many "normal ticks" actually elapsed since the last frame and
    //* raise alpha accordingly. Slow ticks → alpha→1 → the cursor catches
    //* up instantly instead of lagging behind the hand.
    //* Коэффициент HAND_SMOOTH задан «на тик 33 мс». Когда ОС сворачивает
    //* окно, она тормозит наш setInterval в разы (например до раза в
    //* секунду). При фиксированном коэффициенте курсор бы каждый раз
    //* полз на крошечный шаг — эффект «слоумо». Решение: переводим
    //* коэффициент в реальное время. Считаем, сколько «нормальных тиков»
    //* прошло с прошлого кадра, и увеличиваем alpha. Медленный тик →
    //* alpha→1 → курсор мгновенно догоняет руку вместо отставания.
    const nowMs = performance.now();
    const dt = Math.min((nowMs - lastTickAt) / HAND_LOOP_MS, 10);
    lastTickAt = nowMs;
    const alpha = 1 - Math.pow(1 - HAND_SMOOTH, dt);

    //* Low-pass the cursor toward the index tip (mirrored for natural feel)
    //* Сглаживаем курсор к кончику указательного (зеркалим для естественности)
    handSmoothX += (1 - lm[8].x - handSmoothX) * alpha;
    handSmoothY += (lm[8].y - handSmoothY) * alpha;

    //* Send a move only when the smoothed position drifts past a dead zone.
    //* Kills the micro-jitter that makes the cursor "shake".
    //* Отправляем движение только когда сглаженная позиция ушла дальше
    //* мёртвой зоны — это убирает дрожание курсора.
    const now = Date.now();
    const dx = handSmoothX - lastSentX, dy = handSmoothY - lastSentY;
    if (now - lastMoveSent > 30 && (Math.abs(dx) > HAND_DEADZONE || Math.abs(dy) > HAND_DEADZONE)) {
        lastMoveSent = now;
        lastSentX = handSmoothX;
        lastSentY = handSmoothY;
        sendHand("move", { x: handSmoothX, y: handSmoothY });
    }

    //* LEFT MOUSE BUTTON — THUMB GESTURE / ЛЕВАЯ КНОПКА — ЖЕСТ БОЛЬШИМ ПАЛЬЦЕМ:
    //* The thumb acts like a physical mouse button:
    //*   - thumb folded toward the palm  → PRESS  LMB (mouseDown)
    //*   - thumb straight / open         → RELEASE LMB (mouseUp)
    //* A quick fold+open gives the OS a single click; holding the thumb
    //* folded drags (hold & move). We guard both edges with N consecutive
    //* frames so tracker noise around the fold boundary can't fire the
    //* button accidentally.
    //* Большой палец работает как физическая кнопка мыши:
    //*   - палец согнут к ладони      → НАЖАТЬ ЛКМ (mouseDown)
    //*   - палец разогнут / открыт    → ОТПУСТИТЬ ЛКМ (mouseUp)
    //* Быстрый сгиб-разгиб даёт ОС одиночный клик; удержание пальца
    //* согнутым = перетаскивание (зажать и вести). Обе границы
    //* защищены N подряд идущими кадрами, чтобы шум трекера у границы
    //* сгиба не нажимал кнопку случайно.
    //* Thumb is "folded" when its tip (4) is as close to the wrist (0)
    //* as its own MCP joint (2) — i.e. the thumb has collapsed across the
    //* palm. / Палец «согнут», когда кончик (4) так же близок к запястью
    //* (0), как и его основание (2) — то есть палец сложился к ладони.
    const thumbBent = dist2(lm[4], lm[0]) < dist2(lm[2], lm[0]) * HAND_THUMB_FACTOR;

    if (thumbBent) {
        thumbDownFrames++;
        thumbUpFrames = 0;
    } else {
        thumbUpFrames++;
        thumbDownFrames = 0;
    }

    if (thumbDownFrames >= HAND_GUARD_FRAMES && !thumbDown) {
        thumbDown = true;
        sendHand("down");
    }
    if (thumbUpFrames >= HAND_GUARD_FRAMES && thumbDown) {
        thumbDown = false;
        sendHand("up");
    }
}

//* Detection loop on setInterval instead of requestAnimationFrame:
//* rAF is frozen when the window is minimized, setInterval keeps running,
//* so hand tracking still works while the app is in the background.
//* Цикл на setInterval вместо requestAnimationFrame: rAF замирает при свёрнутом
//* окне, а setInterval продолжает работать, поэтому жесты работают и в фоне.
function handTick() {
    if (!handActive || !handLandmarker || !handVideo || handVideo.readyState < 2) return;
    if (handVideo.paused) handVideo.play().catch(() => {});
    const res = handLandmarker.detectForVideo(handVideo, performance.now());
    drawHands(res);

    //* Pick the closest hand (largest in frame) as the control hand
    //* Берём самую близкую руку (самую крупную в кадре) как управляющую
    let control = null, controlScale = 0;
    for (const lm of (res.landmarks || [])) {
        const s = dist2(lm[0], lm[9]) || 0;
        if (s > controlScale) { controlScale = s; control = lm; }
    }

    if (!control) {
        handGoneFrames++;
        if (handGoneFrames > 15) {
            if (thumbDown) { thumbDown = false; sendHand("up"); }
            handHasControl = false;
            thumbDownFrames = thumbUpFrames = 0;
            lastSentX = handSmoothX; lastSentY = handSmoothY;
        }
    } else {
        handGoneFrames = 0;
        if (!handHasControl) {
            handHasControl = true;
            handSmoothX = 1 - control[8].x;
            handSmoothY = control[8].y;
            lastSentX = handSmoothX; lastSentY = handSmoothY;
        }
        processHand(control);
    }
}

function startHandLoop() {
    stopHandLoop();
    lastTickAt = performance.now();   // baseline for time-adaptive smoothing
    handTimerId = setInterval(handTick, HAND_LOOP_MS);
}

function stopHandLoop() {
    if (handTimerId) { clearInterval(handTimerId); handTimerId = null; }
}

//* Restart the timer when the window becomes visible again in case
//* the OS throttled it while minimized.
//* Перезапускаем таймер при возврате окна на передний план, если
//* ОС приостановила его в свёрнутом состоянии.
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && handActive) startHandLoop();
});

if (handToggle) {
    handToggle.addEventListener("change", () => {
        if (handToggle.checked) startHandAssistant();
        else stopHandAssistant();
    });
}

//* Always stop the camera when leaving the page / Останавливаем камеру при уходе со страницы
window.addEventListener("beforeunload", stopHandAssistant);

const appSidebar = document.getElementById("app-sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarClose = document.getElementById("sidebar-close");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const modelBadge = document.getElementById("model-badge");

function setSidebarOpen(open) {
    document.body.classList.toggle("sidebar-open", open);
}

if (sidebarToggle) sidebarToggle.addEventListener("click", () => setSidebarOpen(true));
if (sidebarClose) sidebarClose.addEventListener("click", () => setSidebarOpen(false));
if (sidebarBackdrop) sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setSidebarOpen(false);
});

function syncModelBadge() {
    if (!modelBadge || !modelSelect || !modelSelect.selectedOptions.length) return;
    const option = modelSelect.selectedOptions[0];
    modelBadge.textContent = (option.textContent || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

if (modelSelect) {
    modelSelect.addEventListener("change", syncModelBadge);
    new MutationObserver(syncModelBadge).observe(modelSelect, { childList: true });
    syncModelBadge();
}
