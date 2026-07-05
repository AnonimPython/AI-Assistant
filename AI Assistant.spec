# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['source/desktop.py'],
    pathex=[],
    binaries=[],
    datas=[('source/templates', 'templates'), ('source/static', 'static'), ('build/icon.icns', '.')],
    hiddenimports=['flask', 'requests', 'webview', 'PIL', 'ruamel.yaml'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['yt_dlp', 'mutagen', 'brotli', 'websockets', 'curl_cffi', 'secretstorage', 'cryptography'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='AI Assistant',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['build/icon.icns'],
)
app = BUNDLE(
    exe,
    name='AI Assistant.app',
    icon='build/icon.icns',
    bundle_identifier=None,
)
