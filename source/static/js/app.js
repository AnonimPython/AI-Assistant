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

//* Close the guide overlay / Закрыть оверлей руководства
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


//* Add a "Speak" button that generates TTS on demand (used when files disabled auto-TTS)
//* Добавляет кнопку "Озвучить" для генерации TTS по запросу (когда файлы отключили авто-TTS)
function addSpeakButton(parentDiv, text) {
    const row = document.createElement("div");
    row.className = "audio-row";
    const btn = document.createElement("button");
    btn.className = "audio-btn";
    btn.innerHTML = "🔊 " + (t.speak || "Озвучить");
    btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = "⏳";
        try {
            const r = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, voice: voiceSelect.value }),
            });
            const data = await r.json();
            if (data.audio) {
                btn.outerHTML = "";
                addAudioRow(parentDiv, data.audio);
                playAudio(data.audio);
            } else {
                btn.textContent = "❌ " + (data.error || "TTS error");
            }
        } catch {
            btn.textContent = "❌ " + (t.connection_error || "Error");
        }
    };
    row.appendChild(btn);
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
        return marked.parse(text);
    } catch {
        return text.replace(/\n/g, "<br>");
    }
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

initUpdateBannerDismiss();
initCheckUpdatesToggle();

//* Splash overlay element (kept for reference, splash runs via IIFE at top)
//* Элемент заставки (сохранён для ссылки, заставка запускается через IIFE в начале файла)
const splashOverlay    = document.getElementById("splash-overlay");

//* URL input for agent site checker / Поле ввода URL для проверки сайтов агента
const agentUrlInput    = document.getElementById("agent-url-input");
//* Check button for agent URL / Кнопка проверки URL агента
const agentCheckBtn    = document.getElementById("agent-check-btn");
//* Result display for agent check / Отображение результата проверки агента
const agentResult      = document.getElementById("agent-result");
//* Save button for confirmed agent / Кнопка сохранения подтверждённого агента
const agentSaveBtn     = document.getElementById("agent-save-btn");
//* Container for saved agents list / Контейнер для списка сохранённых агентов
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

//* Agent URL checker — analyzes a URL for free/paid status
//* Проверка URL агента — анализирует сайт на платность/бесплатность
//* Stores the last checked result before saving / Сохраняет последний результат проверки перед сохранением
let lastAgentCheck = null;

//* "Check" button — fetches URL and analyzes page content / Кнопка "Проверить" — запрашивает URL и анализирует контент
agentCheckBtn.addEventListener("click", async () => {
    const url = agentUrlInput.value.trim();
    if (!url) return;

    //* Disable button and show loading state / Блокируем кнопку и показываем загрузку
    agentCheckBtn.disabled = true;
    agentCheckBtn.textContent = t.agent_checking || "Checking...";
    agentResult.textContent = "";
    agentResult.className = "agent-result";
    agentSaveBtn.style.display = "none";

    try {
        //* POST URL to backend for analysis / Отправляем URL на сервер для анализа
        const r = await fetch("/api/agents/check-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });
        const data = await r.json();
        if (data.success) {
            //* Store checked result for saving later / Сохраняем результат для последующего сохранения
            lastAgentCheck = { name: data.name, model_id: data.model_id, url: data.url, status: data.status };
            const icon = data.status === "free" ? "✅" : data.status === "paid" ? "💰" : "❓";
            agentResult.textContent = icon + " " + data.label;
            agentResult.className = "agent-result " + data.status;
            agentSaveBtn.style.display = "block"; //* Show save button / Показываем кнопку сохранения
        } else {
            agentResult.textContent = "❌ " + (data.error || "Check failed");
            agentResult.className = "agent-result error";
        }
    } catch {
        //* Network error / Ошибка сети
        agentResult.textContent = "❌ " + (t.connection_error || "Connection error");
        agentResult.className = "agent-result error";
    } finally {
        //* Re-enable button / Разблокируем кнопку
        agentCheckBtn.disabled = false;
        agentCheckBtn.textContent = t.agent_check || "Check";
    }
});

//* "Save agent" button — adds model to chat model list / Кнопка "Сохранить агента" — добавляет модель в список чата
agentSaveBtn.addEventListener("click", async () => {
    if (!lastAgentCheck) return;
    try {
        const r = await fetch("/api/agents/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: lastAgentCheck.url }),
        });
        const data = await r.json();
        if (data.success) {
            agentSaveBtn.style.display = "none";
            agentResult.textContent = "✅ " + (t.agent_saved || "Saved!");
            agentUrlInput.value = "";
            //* Add the model to the model-select dropdown / Добавляем модель в выпадающий список
            if (data.model) {
                const opt = document.createElement("option");
                opt.value = data.model.id;
                opt.textContent = data.model.name + " (openrouter)";
                modelSelect.appendChild(opt);
                modelSelect.value = data.model.id;
            }
            lastAgentCheck = null;
            loadSavedAgents(); //* Refresh the saved list / Обновляем список сохранённых
        } else {
            agentResult.textContent = "❌ " + (data.error || "Save failed");
            agentResult.className = "agent-result error";
        }
    } catch (err) {
        agentResult.textContent = "❌ " + (t.connection_error || "Connection error");
        agentResult.className = "agent-result error";
    }
});

//* Fetch saved agents from the server / Загружает сохранённых агентов с сервера
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
//* File upload & drag-drop / Загрузка файлов и drag-and-drop
//* ============================================================

//* Paperclip button to open file picker / Кнопка-скрепка для открытия выбора файла
const fileUploadBtn = document.getElementById("file-upload-btn");
//* Hidden <input type="file> element / Скрытый элемент <input type="file">
const fileInput     = document.getElementById("file-input");
//* Container that shows uploaded file chips / Контейнер с чипсами загруженных файлов
const uploadedFilesEl = document.getElementById("uploaded-files");
//* Fullscreen drop zone overlay (big + sign) / Полноэкранный оверлей дроп-зоны (большой +)
const dropZone      = document.getElementById("drop-zone");
//* In-memory array of uploaded files: {name, data (base64), type} / Массив загруженных файлов в памяти
let uploadedFilesData = [];

//* Clicking the paperclip button triggers the hidden file input / Клик по скрепке открывает скрытый file input
fileUploadBtn.addEventListener("click", () => fileInput.click());

//* When user selects files via the dialog / Когда пользователь выбрал файлы через диалог
fileInput.addEventListener("change", () => {
    handleFiles(fileInput.files);
    fileInput.value = ""; //* Reset so same file can be re-selected / Сброс, чтобы тот же файл можно было выбрать снова
});

//* Process FileList — read each file as base64 data URL / Обрабатывает FileList — читает каждый файл как base64 data URL
function handleFiles(fileList) {
    for (const f of fileList) {
        //* Max 10 files at once / Максимум 10 файлов за раз
        if (uploadedFilesData.length >= 10) break;
        //* Skip duplicates by name / Пропускаем дубликаты по имени
        if (uploadedFilesData.some(x => x.name === f.name)) continue;
        const reader = new FileReader();
        //* When file is read — store it and re-render the chips / Когда файл прочитан — сохраняем и перерисовываем чипсы
        reader.onload = (e) => {
            uploadedFilesData.push({
                name: f.name,
                data: e.target.result.split(",")[1] || e.target.result,
                type: f.type,
            });
            renderUploadedFiles();
        };
        //* Start reading the file as a data URL (base64) / Начинаем чтение файла как data URL (base64)
        reader.readAsDataURL(f);
    }
}

//* Re-render all file chips in the uploaded-files container / Перерисовывает все чипсы файлов в контейнере
function renderUploadedFiles() {
    uploadedFilesEl.innerHTML = "";
    for (const f of uploadedFilesData) {
        const chip = document.createElement("span");
        chip.className = "file-chip";
        //* SVG file icon + filename + remove button / Иконка файла SVG + имя + кнопка удаления
        chip.innerHTML = `
            <svg class="file-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span class="file-chip-name">${escapeHtml(f.name)}</span>
            <button class="file-chip-remove" data-name="${escapeHtml(f.name)}">&times;</button>`;
        uploadedFilesEl.appendChild(chip);
    }
    //* Attach remove handler to each chip's × button / Вешаем обработчик удаления на каждую кнопку ×
    document.querySelectorAll(".file-chip-remove").forEach(btn => {
        btn.addEventListener("click", () => {
            uploadedFilesData = uploadedFilesData.filter(x => x.name !== btn.dataset.name);
            renderUploadedFiles();
        });
    });
}

//* Enhance sendMessage to support files — rewire click listener
//* Расширяем sendMessage поддержкой файлов — переподключаем обработчик клика
sendBtn.removeEventListener("click", sendMessage);

//* Keep reference to original sendMessage / Сохраняем ссылку на оригинальную sendMessage
const __origSend = sendMessage;
//* Replaces the original sendMessage — adds file attachment support
//* Заменяет оригинальную sendMessage — добавляет поддержку файлов
sendMessage = async function() {
    const msg = messageInput.value.trim();
    //* Allow sending when files are present even without text / Разрешаем отправку с файлами даже без текста
    if (!msg && uploadedFilesData.length === 0) return;
    if (isLoading) return;

    //* Temporarily enable to pass the empty-msg guard / Временно включаем кнопку
    sendBtn.disabled = false;

    isLoading = true;
    sendBtn.disabled = true;
    setStatus(t.status_thinking || "Thinking...", "processing");

    //* Default text when only files are sent / Текст по умолчанию, если отправлены только файлы
    const textMsg = msg || "See attached files";
    addMessage(textMsg, "user");

    //* Render each attached file in the chat / Показываем каждый прикреплённый файл в чате
    for (const f of uploadedFilesData) {
        const fileDiv = document.createElement("div");
        fileDiv.className = "message user";
        const fc = document.createElement("div");
        fc.className = "message-content";
        const ext = f.name.split(".").pop().toLowerCase();
        const isImg = ["png","jpg","jpeg","gif","svg","webp"].includes(ext);
        if (isImg) {
            //* Image files — show thumbnail preview / Изображения — показываем миниатюру
            fc.innerHTML = `<img src="data:${f.type};base64,${f.data}" alt="${escapeHtml(f.name)}" style="max-width:200px;border-radius:8px"><br><span style="font-size:11px;color:var(--text-secondary)">${escapeHtml(f.name)}</span>`;
        } else {
            //* Other files — show file icon + name / Остальные файлы — иконка + имя
            fc.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${escapeHtml(f.name)}`;
        }
        fileDiv.appendChild(fc);
        chatMessages.appendChild(fileDiv);
    }

    //* Clear input and file list after sending / Очищаем поле ввода и список файлов после отправки
    messageInput.value = "";
    messageInput.style.height = "auto";
    const filesToSend = [...uploadedFilesData];
    const hadFiles = filesToSend.length > 0;
    uploadedFilesData = [];
    renderUploadedFiles();

    //* Create empty bot message bubble — will be filled by stream / Создаём пустой пузырёк бота — заполнится стримом
    const botDiv = document.createElement("div");
    botDiv.className = "message bot";
    const botContent = document.createElement("div");
    botContent.className = "message-content";
    botDiv.appendChild(botContent);
    chatMessages.appendChild(botDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    let fullText = "", audioB64 = null, ttsError = null;

    //* Branch mode: skip streaming, get 3 variants at once
    //* Режим ветвления: пропускаем стрим, получаем 3 варианта сразу
    if (branchToggle && branchToggle.checked && !hadFiles) {
        try {
            setStatus(t.status_branching || "Generating alternatives...", "processing");
            const br = await fetch("/api/chat/branch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: textMsg, model: modelSelect.value }),
            });
            const bdata = await br.json();
            if (bdata.branches && bdata.branches.length >= 3) {
                showBranchCards(botContent, bdata.branches, botDiv);
            } else {
                botContent.innerHTML = "<em>Branching returned no variants</em>";
            }
        } catch (err) {
            botContent.innerHTML = formatMessage("<span style='color:var(--danger)'>" + (t.connection_error || "Connection error") + ":</span> " + escapeHtml(err.message));
        }
        setStatus(t.status_ready || "Ready", "ready");
        isLoading = false;
        sendBtn.disabled = !messageInput.value.trim();
        return;
    }

    try {
        //* POST to streaming endpoint / POST на стрим-ендпоинт
        const r = await fetch("/api/chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: textMsg,
                model: modelSelect.value,
                voice: hadFiles ? "" : voiceSelect.value,
                muted: hadFiles ? true : isMuted,
                files: filesToSend,
            }),
        });
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        //* Read SSE stream chunk by chunk / Читаем SSE-поток чанк за чанком
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";
            for (const part of parts) {
                if (!part.startsWith("data: ")) continue;
                let data;
                try { data = JSON.parse(part.slice(6)); } catch { continue; }
                if (data.type === "token") {
                    //* Regular AI response token / Обычный токен ответа ИИ
                    fullText += data.content;
                    botContent.innerHTML = formatMessage(fullText);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } else if (data.type === "model_switch") {
                    //* Fallback model was used / Использована запасная модель
                    fullText += "[" + data.content + "]\n";
                    botContent.innerHTML = formatMessage(fullText);
                } else if (data.type === "replace") {
                    //* Full text replacement (e.g. after cleaning) / Полная замена текста (например после очистки)
                    fullText = data.content;
                    botContent.innerHTML = formatMessage(fullText);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } else if (data.type === "done") {
                    //* Stream complete — grab audio or TTS error / Стрим завершён — забираем аудио или ошибку TTS
                    audioB64 = data.audio || null;
                    ttsError = data.tts_error || null;
                } else if (data.type === "error") {
                    //* Server-side error / Ошибка на сервере
                    botContent.innerHTML = formatMessage("<span style='color:var(--danger)'>Error:</span> " + escapeHtml(data.content));
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
        }
        //* Normal: add audio replay button or TTS error / Обычный режим: кнопка повтора или ошибка TTS
        if (audioB64) addAudioRow(botDiv, audioB64);
        if (ttsError) addTtsErrorRow(botDiv, ttsError);
        if (hadFiles && !audioB64) addSpeakButton(botDiv, fullText);
        setStatus(t.status_ready || "Ready", "ready");
    } catch (err) {
        botContent.innerHTML = formatMessage("<span style='color:var(--danger)'>" + (t.connection_error || "Connection error") + ":</span> " + escapeHtml(err.message));
        setStatus(t.status_error || "Error", "error");
    } finally {
        isLoading = false;
        sendBtn.disabled = !messageInput.value.trim();
    }
};

//* Re-attach click handler to the new sendMessage / Переподключаем обработчик клика к новой sendMessage
sendBtn.addEventListener("click", sendMessage);

//* Enable send button when files are added (even without text) / Включаем кнопку отправки, если есть файлы (даже без текста)
function updateSendBtn() {
    sendBtn.disabled = !(messageInput.value.trim() || uploadedFilesData.length > 0);
}
messageInput.addEventListener("input", updateSendBtn);
//* Override renderUploadedFiles to also update send button state / Переопределяем renderUploadedFiles для обновления кнопки
const __origRender = renderUploadedFiles;
renderUploadedFiles = function() {
    __origRender();
    updateSendBtn();
};

//* Drag & drop overlay — shows big + when files are dragged over the page
//* Drag & drop оверлей — показывает большой + при перетаскивании файлов на страницу
let dragCtr = 0;
//* Increment counter on dragenter to handle nested elements / Увеличиваем счётчик при dragenter для вложенных элементов
document.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCtr++;
    if (dragCtr === 1) dropZone.style.display = "flex";
});
document.addEventListener("dragover", (e) => e.preventDefault());
//* Decrement on dragleave — hide when truly left / Уменьшаем при dragleave — прячем когда реально ушли
document.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCtr--;
    if (dragCtr <= 0) { dragCtr = 0; dropZone.style.display = "none"; }
});
//* On drop — hide overlay and process files / При сбросе — прячем оверлей и обрабатываем файлы
document.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCtr = 0;
    dropZone.style.display = "none";
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
});

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
    const map = { ru: "ru-RU", en: "en-US", de: "de-DE", fr: "fr-FR", sr: "sr-RS" };
    return map[CURRENT_LANG] || "en-US";
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
