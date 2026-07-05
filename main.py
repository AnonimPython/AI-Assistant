#* Entry point for the desktop application
#* Точка входа для десктопного приложения

#! WARNING: changing sys.path can break imports if structure changes
#! ВНИМАНИЕ: изменение sys.path может сломать импорты при смене структуры
import sys
import os


#? TODO: consider switching to a proper package install instead of sys.path hack
#? НАДО: подумать о переходе на нормальную установку пакета вместо трюка с sys.path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "source"))

#* Import the main desktop application entry function
#* Импортируем главную функцию запуска десктопного приложения
from desktop import main

# regular guard for direct execution
# стандартная защита от запуска при импорте
if __name__ == "__main__":
    main()
