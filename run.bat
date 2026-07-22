@echo off
setlocal

:: Settings
set "REPO_URL=https://github.com/calvinwijaya/ClassPoint3D-Web.git"
set "FOLDER_NAME=ClassPoint3D-Web"
set "PORT=5000"

echo =========================================
echo       ClassPoint3D | UGM Geodetic
echo =========================================
echo.

:: 1. Check if Git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed. Please install Git to continue.
    pause
    exit /b
)

:: 2. Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed. Please install Python 3.
    pause
    exit /b
)

:: 3. Clone or update repository
if not exist "%FOLDER_NAME%\" (
    echo [1/4] Folder not found. Cloning from GitHub...
    git clone %REPO_URL%
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to clone. Check your internet or Repo URL.
        pause
        exit /b
    )
) else (
    echo [1/4] Folder exists. Pulling latest updates from GitHub...
    cd %FOLDER_NAME%
    git pull
)

:: Enter directory if we pulled
if exist "%FOLDER_NAME%\" cd %FOLDER_NAME%

:: 4. Set up Virtual Environment
if not exist "venv\" (
    echo [2/4] First-time setup: Creating Python virtual environment...
    python -m venv venv
)

echo [3/4] Activating environment and installing requirements...
call venv\Scripts\activate
pip install --upgrade pip >nul 2>&1
pip install -r requirements.txt

:: 5. Open Browser automatically
echo [4/4] Starting server...
echo.
echo =========================================
echo       Tool ready! Opening browser at:
echo       http://127.0.0.1:%PORT%
echo =========================================
echo.

start "" "http://127.0.0.1:%PORT%"

:: 6. Run the actual App
python app.py

pause
endlocal