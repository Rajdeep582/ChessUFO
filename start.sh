#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Compile Stockfish if binary missing ─────────────────────────────────────
ENGINE_BIN="$SCRIPT_DIR/engine/stockfish"

if [ ! -f "$ENGINE_BIN" ]; then
  echo "[ChessUFO] Stockfish binary not found. Compiling..."
  mkdir -p "$SCRIPT_DIR/engine"
  cd "$SCRIPT_DIR/Stockfish/src"
  make -j"$(nproc 2>/dev/null || echo 2)" build ARCH=x86-64-sse41-popcnt
  cp stockfish "$ENGINE_BIN"
  chmod +x "$ENGINE_BIN"
  cp *.nnue "$SCRIPT_DIR/engine/" 2>/dev/null || true
  echo "[ChessUFO] Stockfish compiled."
else
  echo "[ChessUFO] Stockfish found: $ENGINE_BIN"
fi

# ── Install Python deps ──────────────────────────────────────────────────────
echo "[ChessUFO] Installing backend deps..."
PYTHON="python3"
command -v python3 &>/dev/null || PYTHON="python"
$PYTHON -m pip install -q -r "$SCRIPT_DIR/backend/requirements.txt" || \
  $PYTHON -m pip install -q -r "$SCRIPT_DIR/backend/requirements.txt" --break-system-packages || \
  pip install -q -r "$SCRIPT_DIR/backend/requirements.txt" || true

# ── Install Node deps ────────────────────────────────────────────────────────
echo "[ChessUFO] Installing frontend deps..."
cd "$SCRIPT_DIR/frontend"
npm install --legacy-peer-deps
if [ $? -ne 0 ]; then
  echo "[ChessUFO] npm install failed."
  exit 1
fi
cd "$SCRIPT_DIR"

# ── Launch ──────────────────────────────────────────────────────────────────
echo ""
echo "[ChessUFO] Starting servers..."
echo "[ChessUFO]   Backend  → http://localhost:8000"
echo "[ChessUFO]   Frontend → http://localhost:5173"
echo "[ChessUFO] Press Ctrl+C to stop."
echo ""

cleanup() { kill 0 2>/dev/null; }
trap cleanup EXIT INT TERM

# Backend — always use python -m uvicorn (works on Windows/Git Bash)
cd "$SCRIPT_DIR/backend"
$PYTHON -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | sed 's/^/[backend] /' &
BACKEND_PID=$!

# Frontend
cd "$SCRIPT_DIR/frontend"
npm run dev 2>&1 | sed 's/^/[frontend] /' &
FRONTEND_PID=$!

echo "[ChessUFO] backend PID=$BACKEND_PID  frontend PID=$FRONTEND_PID"
wait
