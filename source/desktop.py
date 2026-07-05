#* Desktop application wrapper using pywebview
#* Обёртка десктопного приложения с использованием pywebview

#? stdlib
import threading
import sys
import os

#? pywebview provides the native GUI chrome around our Flask app
import webview


#? prepend this file's directory to sys.path so `from app import app` works
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))



#* Set macOS dock icon via PyObjC
#* Устанавливает иконку в доке macOS через PyObjC
#! Sets the app icon in the macOS dock using PyObjC
#! Устанавливает иконку приложения в доке macOS через PyObjC
def set_dock_icon():
    if sys.platform != "darwin":
        return
    icon_path = get_icon_path()
    if not icon_path or not os.path.exists(icon_path):
        return
    try:
        import AppKit
        img = AppKit.NSImage.alloc().initWithContentsOfFile_(icon_path)
        if img:
            AppKit.NSApplication.sharedApplication().setApplicationIconImage_(img)
    except ImportError:
        pass


#* Start the Flask backend on a daemon background thread
#* Запускает Flask-сервер в фоновом daemon-потоке
#! Launches Flask server in a separate thread
#! Запускает Flask сервер в отдельном потоке
def start_flask():
    from app import app
    app.run(host="127.0.0.1", port=5066, debug=False, use_reloader=False)


#* Returns path to app icon based on platform
#* Возвращает путь к иконке приложения в зависимости от платформы
def get_icon_path():
    base     = os.path.dirname(os.path.abspath(__file__))
    icon_png = os.path.join(base, "static", "app_img", "icon.png")
    #? PNG fallback on all platforms if the platform-specific format is missing

    if sys.platform == "darwin":
        for p in [os.path.join(os.path.dirname(base), "build", "icon.icns"),
                  os.path.join(base, "static", "app_img", "icon.icns")]:
            if os.path.exists(p):
                return p
        return icon_png
    elif sys.platform == "win32":
        for p in [os.path.join(os.path.dirname(base), "build", "icon.ico"),
                  os.path.join(base, "static", "app_img", "icon.ico")]:
            if os.path.exists(p):
                return p
        return icon_png

    return icon_png



def main():
    #* Creates a native desktop window that wraps the Flask web app
    #* Создаёт нативное десктопное окно, оборачивающее Flask веб-приложение
    #? set dock icon (no-op on non-macOS)
    set_dock_icon()


    #? daemon thread = automatically killed when the main thread exits
    flask_thread = threading.Thread(target=start_flask, daemon=True)
    flask_thread.start()


    #? pywebview opens a chromeless OS window pointed at the local dev server
    window = webview.create_window(
        title="AI Assistant",
        url="http://127.0.0.1:5066",
        width=1200,
        height=800,
        min_size=(800, 600),
        resizable=True,
        text_select=True,
        confirm_close=True,
    )
    webview.start(debug=False, gui=None)


if __name__ == "__main__":
    main()
