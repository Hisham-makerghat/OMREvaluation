@echo off
REM Starts the OMR tool on this computer. Needs Python 3.11 or newer installed with "Add to PATH".
cd /d "%~dp0backend"
if not exist .venv (
  echo Creating Python environment ...
  python -m venv .venv || goto :fail
)
call .venv\Scripts\activate.bat
echo Installing packages (first time takes a few minutes) ...
pip install -q -r requirements.txt || goto :fail
set DEV_USER_EMAIL=hisham@makerghat.org
set ADMIN_EMAILS=hisham@makerghat.org
echo.
echo Open http://127.0.0.1:8000 in your browser. Press Ctrl+C here to stop.
echo.
python -m flask --app app run --port 8000
goto :eof
:fail
echo.
echo Something went wrong. Check that Python 3.11+ is installed and on PATH.
pause
