# ChessUFO — Chess Analysis Website

Stockfish-powered analysis tool. Dark theme, Lichess-style.

## Quick Start

```bash
chmod +x start.sh
./start.sh
```

Opens at **http://localhost:5173**

## Requirements

- Python 3.10+
- Node 18+
- `make`, `g++` (for Stockfish compile, first run only)

## Manual Setup

### 1. Compile Stockfish

```bash
cd Stockfish/src
make -j$(nproc) build ARCH=x86-64-sse41-popcnt
cp stockfish ../../engine/
cp *.nnue ../../engine/
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

## API

| Endpoint | Body | Returns |
|---|---|---|
| `POST /analyze` | `{ fen, depth }` | `{ score, bestmove, pv_lines, depth }` |
| `POST /bestmove` | `{ fen }` | `{ bestmove }` |
| `GET /health` | — | `{ status, engine }` |

## Structure

```
ChessUFO/
├── Stockfish/       ← source
├── engine/          ← binary + nn-*.nnue
├── backend/         ← FastAPI (main.py)
├── frontend/        ← React + Vite
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── ChessboardComponent.jsx
│           ├── EvalBar.jsx
│           ├── PVLines.jsx
│           ├── MovePanel.jsx
│           └── Controls.jsx
└── start.sh
```
