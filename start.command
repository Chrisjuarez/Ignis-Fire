#!/usr/bin/env bash
set -e

# Resolve project root
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1) ML venv & deps
echo "🛠️  Setting up ML environment..."
cd "$BASE_DIR/backend/ml"

# Pick whichever python3 is available
if command -v python3 >/dev/null 2>&1; then
  PY_CMD=python3
elif command -v python >/dev/null 2>&1; then
  PY_CMD=python
else
  echo "❌ No Python interpreter found (python3 or python)" >&2
  exit 1
fi

# Create venv if needed
if [ ! -d venv ]; then
  echo "▶ Creating virtualenv via $PY_CMD"
  $PY_CMD -m venv venv
fi

# Activate & install
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

# 2) Start backend
echo "📡  Starting backend..."
cd "$BASE_DIR/backend"

# Load .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

npm install
node app.js &

# 3) Start frontend
echo "🌐  Starting frontend..."
cd "$BASE_DIR/frontend"
npm install
npm start

wait