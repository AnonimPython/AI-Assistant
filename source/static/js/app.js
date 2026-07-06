//* Chat application logic — message sending, TTS, UI updates, history, language
//* Логика чат-приложения — отправка сообщений, TTS, обновление интерфейса, история, язык

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
let isLoading = false;
let customVoiceList = [];
let isMuted = false;



//* Auto-resize the textarea as the user types
//* Автоматическое изменение высоты textarea при вводе
// Example: autoResize(messageInput);
function autoResize(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    sendBtn.disabled = !textarea.value.trim();
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



//? Voice management — add custom voices from Fish Audio
//? Управление голосами — добавление своих голосов с Fish Audio

const toggleAddVoiceBtn = document.getElementById("toggle-add-voice");
const addVoiceForm     = document.getElementById("add-voice-form");
const voiceNameInput   = document.getElementById("voice-name-input");
const voiceUrlInput    = document.getElementById("voice-url-input");
const addVoiceBtn      = document.getElementById("add-voice-btn");
const voiceMsg         = document.getElementById("voice-msg");
const customVoicesList = document.getElementById("custom-voices-list");

// Show/hide the add-voice form panel
toggleAddVoiceBtn.addEventListener("click", () => {
    // Toggle form visibility (hidden when "none" or unset)
    const show = addVoiceForm.style.display === "none" || !addVoiceForm.style.display;
    addVoiceForm.style.display = show ? "block" : "none";
    // Clear any leftover success/error message when reopening
    // Очищаем сообщения при повторном открытии
    if (show) { voiceMsg.textContent = ""; voiceMsg.className = "voice-msg"; }
    // Auto-focus name input when form opens
    if (show) voiceNameInput.focus();
});

const guideBtn   = document.getElementById("how-to-add-voice-btn");
const guideOverlay = document.getElementById("voice-guide-overlay");
const guideClose  = document.getElementById("guide-close");

guideBtn.addEventListener("click", () => {
    guideOverlay.style.display = "flex";
    document.body.style.overflow = "hidden";
});

function closeGuide() {
    guideOverlay.style.display = "none";
    document.body.style.overflow = "";
}

guideClose.addEventListener("click", closeGuide);
guideOverlay.addEventListener("click", (e) => {
    if (e.target === guideOverlay) closeGuide();
});

//* Adds a new voice via API
//* Добавляет новый голос через API
addVoiceBtn.addEventListener("click", async () => {
// Validate fields before sending
    const name = voiceNameInput.value.trim();
    const url  = voiceUrlInput.value.trim();
    if (!name || !url) {
        voiceMsg.textContent = t.name_required || "Please fill in all fields";
        voiceMsg.className   = "voice-msg error";
        return;
    }

    addVoiceBtn.disabled = true;
    addVoiceBtn.textContent = t.voice_adding || "Adding...";
    voiceMsg.textContent = "";

    try {
        const r = await fetch("/api/voices/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, url }),
        });
        const data = await r.json();
        if (data.success) {
            voiceNameInput.value = "";
            voiceUrlInput.value  = "";
            voiceMsg.textContent = t.voice_add_success || "Voice added!";
            voiceMsg.className   = "voice-msg success";
            rebuildVoiceSelect(data.voices);
            fetchCustomVoices();
            addVoiceForm.style.display = "none";
        } else {
            voiceMsg.textContent = data.error || t.voice_invalid_url || "Invalid voice link";
            voiceMsg.className   = "voice-msg error";
        }
    } catch {
        voiceMsg.textContent = t.voice_add_error || "Failed to add voice";
        voiceMsg.className   = "voice-msg error";
    } finally {
        addVoiceBtn.disabled = false;
        addVoiceBtn.textContent = t.add_voice || "Add voice";
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

//* Fetch and render only custom voices
//* Загружаем и отображаем только добавленные голоса
fetchCustomVoices();

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

// Dismiss update banner
updateBannerDismiss.addEventListener("click", () => {
    updateBanner.style.display = "none";
});

// Toggle update check setting
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

//* Fetch custom voice list from the server
//* Загрузка списка пользовательских голосов с сервера
async function fetchCustomVoices() {
    try {
        const r    = await fetch("/api/voices/custom");
        const data  = await r.json();
        if (data.voices) {
            customVoiceList = data.voices;
            renderCustomVoicesList(data.voices);
        }
    } catch {}
}


//* Render custom voices list in the sidebar
//* Отрисовка списка пользовательских голосов в боковой панели
function renderCustomVoicesList(voices) {
    customVoicesList.innerHTML = "";
    if (!voices || voices.length === 0) {
        customVoicesList.innerHTML = '<span class="voice-no-custom">' + (t.voice_no_custom || "No custom voices yet") + "</span>";
        return;
    }
    // Create a list item for each custom voice
    for (const v of voices) {
        const item = document.createElement("div");
        item.className = "voice-item";
        item.innerHTML = `<span class="voice-item-name">${escapeHtml(v[0])}</span>
            <button class="voice-remove-btn" data-id="${escapeHtml(v[1])}">${t.voice_remove || "Remove"}</button>`;
        customVoicesList.appendChild(item);
    }
    // Attach a remove handler to each voice delete button
    customVoicesList.querySelectorAll(".voice-remove-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const voiceId = btn.dataset.id;
            try {
                const r = await fetch("/api/voices/remove", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ voice_id: voiceId }),
                });
                const data = await r.json();
                if (data.success) {
                    rebuildVoiceSelect(data.voices);
                    fetchCustomVoices();
                }
            } catch {
                alert("Failed to remove voice");
            }
        });
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
marked.setOptions({
    gfm: true,
    breaks: true,
    pedantic: false,
});

function formatMessage(text) {
    return marked.parse(text);
}


//* Escape HTML entities in a string
//* Экранирование HTML-сущностей в строке
// Example: escapeHtml("<script>alert(1)</script>") → "&lt;script&gt;alert(1)&lt;/script&gt;"
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
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
    statusDot.style.background = type === "ready" ? "#00c853" :
                                  type === "processing" ? "#ffa502" :
                                  type === "error" ? "#ff4757" : "#8888aa";
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

const splashOverlay = document.getElementById("splash-overlay");
const splashTitle   = document.getElementById("splash-title");

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

// Save all three API keys at once
saveKeysBtn.addEventListener("click", async () => {
    const orKey   = orKeyInput.value.trim();
    const fishKey = fishKeyInput.value.trim();
    const hfKey   = hfKeyInput.value.trim();
    if (!orKey || !fishKey || !hfKey) {
        keysSaveMsg.textContent = "All three keys are required";
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
    settingsModal.style.display = "flex";
    highlightCurrentTheme();
    loadKeys();
    keysSaveMsg.textContent = "";
    keysSaveMsg.className = "";
    systemPromptMsg.textContent = "";
    systemPromptMsg.className = "voice-msg";
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


//* Splash screen animation
//* Анимация заставки при запуске
const SPLASH_DURATION = 2800;

const animations = ["typewriter", "neon", "cascade"];

function runSplashAnimation() {
    const chosen = animations[Math.floor(Math.random() * animations.length)];
    splashOverlay.classList.add("splash-" + chosen);

    if (chosen === "cascade") {
        const text = splashTitle.textContent;
        splashTitle.textContent = "";
        for (const ch of text) {
            const span = document.createElement("span");
            span.className = "splash-char";
            span.textContent = ch === " " ? "\u00A0" : ch;
            span.style.animationDelay = (Math.random() * 0.6).toFixed(2) + "s";
            splashTitle.appendChild(span);
        }
    }
}

function hideSplash() {
    splashOverlay.classList.add("hidden");
    setTimeout(() => {
        splashOverlay.style.display = "none";
    }, 600);
}

// Init everything on page load
document.addEventListener("DOMContentLoaded", async () => {
    runSplashAnimation();

    setTimeout(async () => {
        hideSplash();

        loadHistory();
        messageInput.focus();

        try {
            const r = await fetch("/api/config");
            const d = await r.json();
            if (d.check_updates !== undefined) {
                checkUpdatesToggle.checked = d.check_updates;
            }
        } catch {}

        checkForUpdates();
    }, SPLASH_DURATION);
});
