.PHONY: install run-web run-desktop test docker-build clean build-exe build-installer

#* Install Python dependencies
#* Установка Python зависимостей
install:
	pip install -r requirements.txt

run-web:
	python3 source/app.py

run-desktop:
	python3 main.py

test:
	python3 source/test_models.py

docker-build:
	docker build -t ai-assistant .

docker-run:
	docker run -d -p 5066:5066 --name ai-assistant ai-assistant

#* Build all standalone executables with PyInstaller
#* Сборка всех самостоятельных исполняемых файлов через PyInstaller
build-exe:
	pip install pyinstaller
	pyinstaller --onefile --windowed --name "AI Assistant" \
		--add-data "source/templates:templates" \
		--add-data "source/static:static" \
		--icon "build/icon.ico" \
		source/desktop.py
	pyinstaller --onefile --name "ai-web" \
		--add-data "source/templates:templates" \
		--add-data "source/static:static" \
		source/app.py

#* Build Windows installer (requires Inno Setup)
#* Сборка Windows установщика (требует Inno Setup)
build-installer: build-exe
	"$(PROGRAMFILES)\\Inno Setup 6\\iscc.exe" build\\installer.iss || \
	echo "Install iscc.exe from https://jrsoftware.org/isdl.php"

clean:
	rm -rf build/ dist/ __pycache__/ *.spec
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
