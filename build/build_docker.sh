#!/bin/bash
set -e

echo "============================================"
echo "  Сборка Docker образа AI Assistant"
echo "============================================"
echo ""

cd "$(dirname "$0")/.."

echo "[*] Сборка Docker образа..."
docker build -t ai-assistant:latest .

echo ""
echo "[*] Запуск контейнера:"
echo "  docker run -d -p 5066:5066 --name ai-assistant ai-assistant:latest"
echo ""
echo "  Приложение будет доступно по адресу:"
echo "  http://localhost:5066"
echo ""
echo "============================================"
echo "  Готово!"
echo "============================================"
