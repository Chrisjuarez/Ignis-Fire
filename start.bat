@echo off
setlocal enabledelayedexpansion

REM ─── Variables ─────────────────────────────────────────────────────────────
set "BASE_DIR=%~dp0"

REM ─── 1) ML venv & deps ───────────────────────────────────────────────────────
echo 🛠️  Setting up ML environment...
pushd "%BASE_DIR%backend\ml"

if not exist venv (
  echo ▶ Creating Python venv...
  python -m venv venv
)
call venv\Scripts\activate.bat
pip install --upgrade pip
pip install -r requirements.txt
deactivate
popd

REM ─── 2) Load backend .env (except PORT) ─────────────────────────────────────
for /f "usebackq tokens=1* delims==" %%A in (`type "%BASE_DIR%backend\.env" ^| findstr /v "^#"`) do (
  if /I not "%%A"=="PORT" (
    set "%%A=%%B"
  )
)

REM ─── 3) Start backend ───────────────────────────────────────────────────────
echo 📡  Starting backend on port %PORT%...
pushd "%BASE_DIR%backend"
npm install
start "" cmd /k "node app.js"
popd

REM ─── 4) Start frontend ──────────────────────────────────────────────────────
echo 🌐  Starting frontend on port 3000...
pushd "%BASE_DIR%frontend"

REM Ensure CRA picks its default (3000) rather than inheriting PORT=5000
set PORT=

npm install
start "" cmd /k "npm start"
popd

endlocal