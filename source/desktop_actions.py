#* Desktop actions executor — safe OS-level commands triggered by the AI
#* Исполнитель действий на компьютере — безопасные системные команды от ИИ
import re
import sys
import subprocess
import webbrowser
import urllib.parse

#* Common site name → URL map / Карта распространённых названий сайтов → URL
SITES = {
    "youtube":    "https://youtube.com",
    "ютуб":       "https://youtube.com",
    "google":     "https://google.com",
    "гугл":       "https://google.com",
    "gmail":      "https://mail.google.com",
    "почта":      "https://mail.google.com",
    "github":     "https://github.com",
    "гитхаб":     "https://github.com",
    "yandex":     "https://yandex.ru",
    "яндекс":     "https://yandex.ru",
    "ya":         "https://ya.ru",
    "vk":         "https://vk.com",
    "вк":         "https://vk.com",
    "telegram":   "https://web.telegram.org",
    "телеграм":   "https://web.telegram.org",
    "twitter":    "https://x.com",
    "твиттер":    "https://x.com",
    "x":          "https://x.com",
    "facebook":   "https://facebook.com",
    "instagram":  "https://instagram.com",
    "инстаграм":  "https://instagram.com",
    "netflix":    "https://netflix.com",
    "нетфликс":   "https://netflix.com",
    "amazon":     "https://amazon.com",
    "wikipedia":  "https://wikipedia.org",
    "википедия":  "https://ru.wikipedia.org",
    "habr":       "https://habr.com",
    "хабр":       "https://habr.com",
    "twitch":     "https://twitch.tv",
    "steam":      "https://store.steampowered.com",
    "discord":    "https://discord.com",
    "figma":      "https://figma.com",
    "spotify":    "https://open.spotify.com",
    "спотифай":   "https://open.spotify.com",
}

#* Turns a name/URL from the AI into a real URL / Превращает имя/URL от ИИ в реальный URL
def resolve_url(name):
    name = (name or "").strip().lower().rstrip(".,;:!?")
    if not name:
        return None
    if name.startswith("http://") or name.startswith("https://"):
        return name
    if name in SITES:
        return SITES[name]
    #? Bare domain like "example.com" / Голый домен вида example.com
    if re.fullmatch(r'[a-z0-9\-]+(?:\.[a-z0-9\-]+)+', name):
        return "https://" + name
    return None


#* Opens a website in the default browser / Открывает сайт в браузере по умолчанию
#* Returns (ok, detail) / Возвращает (ok, detail)
def open_website(name):
    url = resolve_url(name)
    if not url:
        return False, (name or "").strip()
    webbrowser.open(url, new=2)
    return True, url


#* Opens a web search for the given query / Открывает поиск по запросу в браузере
def search_web(query):
    query = (query or "").strip().rstrip(".,;:!?")
    url = "https://www.google.com/search?q=" + urllib.parse.quote(query)
    webbrowser.open(url, new=2)
    return True, query


#* Opens an image search for the given query / Открывает поиск картинок по запросу
def search_images(query):
    query = (query or "").strip().rstrip(".,;:!?")
    if not query:
        return False, ""
    url = "https://www.google.com/search?tbm=isch&q=" + urllib.parse.quote(query)
    webbrowser.open(url, new=2)
    return True, query


#* Hides/minimizes all application windows (show desktop)
#* Сворачивает все окна приложений (показывает рабочий стол)
def minimize_all():
    if sys.platform == "darwin":
        script = (
            'tell application "System Events"\n'
            '    set visible of every process whose visible is true '
            'and name is not "Finder" to false\n'
            'end tell'
        )
        subprocess.run(["osascript", "-e", script], check=True,
                       capture_output=True, timeout=10)
        return True, ""
    #? Windows / Linux fallback: show desktop hotkey
    try:
        import pyautogui
        if sys.platform == "win32":
            pyautogui.hotkey("win", "d")
        else:
            pyautogui.hotkey("ctrl", "alt", "d")
        return True, ""
    except Exception:
        return False, ""


#* Dispatches a command type to its handler / Раздаёт команду нужному обработчику
#* Returns (ok, detail) / Возвращает (ok, detail)
def execute_command(kind, value):
    if kind == "open":
        return open_website(value)
    if kind == "search":
        return search_web(value)
    if kind == "images":
        return search_images(value)
    if kind == "minimize_all":
        return minimize_all()
    return False, ""
