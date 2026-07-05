#* Model tester — checks which AI models are working
#* Тестер моделей — проверяет, какие ИИ модели работают
#? Usage: python test_models.py
#? Использование: python test_models.py
#! Non-working models get commented out in config_manager.py
#! Неработающие модели комментируются в config_manager.py

import sys
import os
import json
import time


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config_manager import ConfigManager, MODELS_OR, MODELS_HF, SYSTEM_PROMPT

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)

config = ConfigManager()



if not config.is_configured():
    print("=" * 60)
    print("  API keys are not configured!")
    print("  First run the app (app.py or desktop.py)")
    print("  and enter keys on the setup page.")
    print("=" * 60)
    sys.exit(1)

OR_KEY     = config.get_or_key()
HF_KEY     = config.get_hf_key()
TEST_MSG   = "Answer briefly: how are you?"



def test_or(model_id, name):
    #! Tests an OpenRouter model with a short request
    #! Тестирует модель OpenRouter коротким запросом
    print(f"  {name}... ", end="", flush=True)
    try:
        r = requests.post(
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OR_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/evgenijlevin/ai_assistant",
            },
            data=json.dumps({
                "model": model_id,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": TEST_MSG}
                ],
                "max_tokens": 50,
            }),
            timeout=30,
        )
        ok = r.status_code == 200
        print("OK" if ok else f"ERR {r.status_code}")
        return ok, r.text[:100] if not ok else ""
    except Exception as ex:
        print(f"ERR {str(ex)[:60]}")
        return False, str(ex)



def test_hf(model_id, name):
    #! Tests a HuggingFace model with a short request
    #! Тестирует модель HuggingFace коротким запросом
    print(f"  {name}... ", end="", flush=True)
    try:
        r = requests.post(
            f"https://api-inference.huggingface.co/models/{model_id}",
            headers={"Authorization": f"Bearer {HF_KEY}", "Content-Type": "application/json"},
            json={
                "inputs": f"<|system|>\n{SYSTEM_PROMPT}\n<|user|>\n{TEST_MSG}\n<|assistant|>\n",
                "parameters": {"max_new_tokens": 50, "return_full_text": False}
            },
            timeout=30,
        )
        ok = r.status_code in (200, 503)
        print("OK" if r.status_code == 200 else "LOADING" if r.status_code == 503 else f"ERR {r.status_code}")
        return ok, r.text[:100] if not ok else ""
    except Exception as ex:
        print(f"ERR {str(ex)[:60]}")
        return False, str(ex)



def main():
    #* Runs tests for all models and updates config_manager.py
    #* Запускает тесты для всех моделей и обновляет config_manager.py
    print("\n" + "=" * 60)
    print("  AI MODEL TESTING")
    print("=" * 60)
    print(f"  OR Key: {OR_KEY[:10]}...{OR_KEY[-4:]}")
    print(f"  HF Key: {HF_KEY[:10]}...{HF_KEY[-4:]}")
    print()

    results = []

    print("--- OpenRouter ---")
    for m in MODELS_OR:
        ok, detail = test_or(m["id"], m["name"])
        results.append({**m, "works": ok})

    print("\n--- HuggingFace ---")
    for m in MODELS_HF:
        ok, detail = test_hf(m["id"], m["name"])
        results.append({**m, "works": ok})

    working = [r for r in results if r["works"]]
    broken  = [r for r in results if not r["works"]]

    print("\n" + "=" * 60)
    print(f"  Working: {len(working)}/{len(results)}")
    print(f"  Broken: {len(broken)}")
    print("=" * 60)

    if working:
        print("\n  Working:")
        for m in working:
            print(f"    [OK] {m['name']}")

    if broken:
        print("\n  Broken (will be commented out):")
        for m in broken:
            print(f"    [--] {m['name']}")

    #! Updates config_manager.py — comments out broken models
    #! Обновляет config_manager.py — комментирует неработающие модели
    cfg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config_manager.py")
    with open(cfg_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    new_lines   = []
    in_or = in_hf = written = False
    or_entries  = hf_entries = []

    for r in results:
        if r["provider"] == "openrouter":
            or_entries.append(r)
        else:
            hf_entries.append(r)

    for line in lines:
        if line.strip().startswith("MODELS_OR = ["):
            in_or = True
            written = False
            new_lines.append(line)
            continue
        if in_or and line.strip() == "]":
            in_or = False
            if not written:
                for e in or_entries:
                    if e["works"]:
                        new_lines.append(f'    {{"provider": "openrouter", "id": "{e["id"]}", "name": "{e["name"]}"}},\n')
                    else:
                        new_lines.append(f'    # {{"provider": "openrouter", "id": "{e["id"]}", "name": "{e["name"]}"}},  # broken\n')
                written = True
            new_lines.append(line)
            continue
        if in_or and not written:
            continue

        if line.strip().startswith("MODELS_HF = ["):
            in_hf = True
            written = False
            new_lines.append(line)
            continue
        if in_hf and line.strip() == "]":
            in_hf = False
            if not written:
                for e in hf_entries:
                    if e["works"]:
                        new_lines.append(f'    {{"provider": "huggingface", "id": "{e["id"]}", "name": "{e["name"]}"}},\n')
                    else:
                        new_lines.append(f'    # {{"provider": "huggingface", "id": "{e["id"]}", "name": "{e["name"]}"}},  # broken\n')
                written = True
            new_lines.append(line)
            continue
        if in_hf and not written:
            continue

        new_lines.append(line)

    with open(cfg_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    print("\n  config_manager.py updated!")
    print("=" * 60 + "\n")



if __name__ == "__main__":
    main()
