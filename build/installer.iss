;!
;! Inno Setup installer script for AI Assistant
;! Скрипт установщика Inno Setup для AI Assistant
;*
;* Generates a professional installer with:
;*   - Custom icon
;*   - Installation path selection
;*   - Desktop shortcut creation (handles any user desktop path)
;*   - Uninstaller
;*   - Minimal antivirus false positives
;*
;* Генерирует профессиональный установщик с:
;*   - Своей иконкой
;*   - Выбором пути установки
;*   - Ярлыком на рабочем столе (любой путь до рабочего стола)
;*   - Деинсталлятором
;*   - Минимум ложных срабатываний антивируса

#define MyAppName "AI Assistant"
#define MyAppVersion "1.0"
#define MyAppPublisher "AnonimPython"
#define MyAppURL "https://github.com/AnonimPython"
#define MyAppExeName "AI Assistant.exe"

[Setup]
;! App identifier — uniquely identifies this app on the system
;! Идентификатор приложения — уникально идентифицирует приложение в системе
AppId={{B8F4A3D2-1C5E-4A7F-9B6D-3E2F1C8A7D4B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

;*
;* Default installation directory
;* Директория установки по умолчанию
DefaultDirName={autopf}\{#MyAppName}

;*
;* Desktop shortcut is created in [Icons] section
;* Inno Setup uses {userdesktop} which resolves to the correct
;* desktop path for any Windows user configuration.
;*
;* Ярлык на рабочем столе создаётся в секции [Icons]
;* Inno Setup использует {userdesktop}, который резолвится в
;* правильный путь до рабочего стола для любой конфигурации Windows.
DisableProgramGroupPage=yes

;*
;* Custom icon for the installer and the installed app
;* Своя иконка для установщика и установленного приложения
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}

;*
;* Compression settings — smaller exe, faster download
;* Настройки сжатия — меньший exe, быстрее загрузка
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

;*
;* Output
;* Выходной файл
OutputDir=..\dist
OutputBaseFilename=AI_Assistant_Setup

;*
;* Require admin rights — needed to write to Program Files
;* Требуются права админа — нужны для записи в Program Files
PrivilegesRequired=admin

;*
;* Min Windows version
;* Минимальная версия Windows
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: checkedonce

[Files]
;!
;! Source: the compiled exe + all bundled data
;! Источник: скомпилированный exe + все встроенные данные
Source: "..\dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README_EN.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README_RU.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
;*
;* Desktop shortcut — resolves to the correct desktop path
;* Inno Setup uses CSIDL_DESKTOPDIRECTORY / Known Folder API
;* which always returns the right desktop path for any user.
;*
;* Ярлык на рабочем столе — резолвится в правильный путь
;* Inno Setup использует CSIDL_DESKTOPDIRECTORY / Known Folder API
;* который всегда возвращает правильный путь для любого пользователя.
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"

;*
;* Start menu shortcut
;* Ярлык в меню Пуск
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"

[Run]
;*
;* Optionally launch after install
;* Опционально запустить после установки
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: postinstall nowait skipifsilent shellexec

[UninstallRun]
;*
;* Clean up config on uninstall (optional)
;* Очистка конфига при удалении (опционально)
Filename: "{cmd}"; Parameters: "/c rmdir /s /q ""{userappdata}\.ai_assistant"""; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{userappdata}\.ai_assistant"
