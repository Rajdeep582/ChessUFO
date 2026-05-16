import os
import sys
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import chess
import chess.engine

app = FastAPI(title="ChessUFO API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_engine_dir = os.path.join(os.path.dirname(__file__), "..", "engine")
if sys.platform == "win32":
    _local = os.path.join(_engine_dir, "stockfish.exe")
else:
    _local = os.path.join(_engine_dir, "stockfish")

# Prefer env var, then local binary, then system stockfish
ENGINE_PATH = os.environ.get("STOCKFISH_PATH") or (
    _local if os.path.exists(_local) else "stockfish"
)
engine: Optional[chess.engine.SimpleEngine] = None


def get_engine() -> chess.engine.SimpleEngine:
    global engine
    if engine is None:
        try:
            engine = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)
        except FileNotFoundError:
            raise HTTPException(status_code=503, detail=f"Stockfish not found at '{ENGINE_PATH}'. Set STOCKFISH_PATH env var.")
    return engine


class AnalyzeRequest(BaseModel):
    fen: str
    depth: int = 20


class BestMoveRequest(BaseModel):
    fen: str


def format_score(score: chess.engine.Score, turn: chess.Color) -> str:
    """Format score from white's perspective."""
    if score.is_mate():
        m = score.white().mate()
        return f"M{m}" if m > 0 else f"M{m}"
    cp = score.white().score()
    if cp is None:
        return "0.00"
    val = cp / 100.0
    return f"+{val:.2f}" if val > 0 else f"{val:.2f}"


def moves_to_san(board: chess.Board, uci_moves: list[str]) -> list[str]:
    san_moves = []
    b = board.copy()
    for uci in uci_moves:
        try:
            move = chess.Move.from_uci(uci)
            san_moves.append(b.san(move))
            b.push(move)
        except Exception:
            break
    return san_moves


@app.get("/health")
def health():
    return {"status": "ok", "engine": os.path.exists(ENGINE_PATH)}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    try:
        board = chess.Board(req.fen)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid FEN")

    eng = get_engine()

    try:
        info_list = eng.analyse(
            board,
            chess.engine.Limit(depth=req.depth),
            multipv=3,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    pv_lines = []
    bestmove = None
    top_score = None

    for i, info in enumerate(info_list):
        score = info.get("score")
        pv = info.get("pv", [])

        score_str = "0.00"
        if score:
            score_str = format_score(score, board.turn)
            if top_score is None:
                top_score = score_str

        uci_moves = [m.uci() for m in pv]
        san_moves = moves_to_san(board, uci_moves)

        if i == 0 and pv:
            bestmove = pv[0].uci()

        pv_lines.append({
            "score": score_str,
            "moves": uci_moves[:10],
            "san": san_moves[:10],
        })

    return {
        "score": top_score or "0.00",
        "bestmove": bestmove,
        "pv_lines": pv_lines,
        "depth": req.depth,
    }


@app.post("/bestmove")
def bestmove(req: BestMoveRequest):
    try:
        board = chess.Board(req.fen)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid FEN")

    eng = get_engine()

    try:
        result = eng.play(board, chess.engine.Limit(depth=15))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"bestmove": result.move.uci() if result.move else None}


class ReviewRequest(BaseModel):
    fens: list[str]    # FEN before each move (length N)
    moves: list[str]   # UCI moves (length N)
    depth: int = 12

REVIEW_DEPTH = 12

review_engine: Optional[chess.engine.SimpleEngine] = None

def get_review_engine() -> chess.engine.SimpleEngine:
    global review_engine
    if review_engine is None:
        if not os.path.exists(ENGINE_PATH):
            raise HTTPException(status_code=503, detail="Stockfish not found")
        review_engine = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)
    return review_engine

def _classify(is_best: bool, loss_cp: float) -> str:
    if is_best or loss_cp <= 5:   return "best"
    if loss_cp <= 20:              return "excellent"
    if loss_cp <= 60:              return "good"
    if loss_cp <= 120:             return "inaccuracy"
    if loss_cp <= 280:             return "mistake"
    if loss_cp <= 500:             return "miss"
    return "blunder"

def _score_cp(score_obj: chess.engine.Score, color: chess.Color) -> float:
    pov = score_obj.pov(color)
    if pov.is_mate():
        m = pov.mate()
        return 10000.0 if m > 0 else -10000.0
    return float(pov.score() or 0)

def _do_review(fens: list, moves: list, depth: int = 12) -> list:
    eng = get_review_engine()
    results = []
    # Analyze N+1 positions (one extra: after last move)
    all_fens = list(fens)
    try:
        last_board = chess.Board(fens[-1])
        last_board.push(chess.Move.from_uci(moves[-1]))
        all_fens.append(last_board.fen())
    except Exception:
        all_fens.append(fens[-1])

    evals = []
    for fen in all_fens:
        try:
            board = chess.Board(fen)
            info = eng.analyse(board, chess.engine.Limit(depth=depth), multipv=1)
            score = info[0]["score"]
            best_uci = info[0]["pv"][0].uci() if info[0].get("pv") else None
            evals.append({"score": score, "best": best_uci, "turn": board.turn})
        except Exception:
            evals.append({"score": None, "best": None, "turn": chess.WHITE})

    for i, (fen, uci) in enumerate(zip(fens, moves)):
        try:
            board = chess.Board(fen)
            turn = board.turn
            move = chess.Move.from_uci(uci)
            san = board.san(move)

            ev_before = evals[i]
            ev_after  = evals[i + 1]

            if ev_before["score"] is None:
                results.append({"move": uci, "san": san, "classification": "unknown", "loss_cp": 0})
                continue

            before_cp = _score_cp(ev_before["score"], turn)
            after_cp  = -_score_cp(ev_after["score"], not turn) if ev_after["score"] else before_cp
            loss_cp   = max(0.0, before_cp - after_cp)
            is_best   = (uci == ev_before["best"])

            results.append({
                "move": uci,
                "san": san,
                "best_move": ev_before["best"] or uci,
                "eval_before": round(before_cp / 100, 2),
                "eval_after":  round(after_cp  / 100, 2),
                "loss_cp": round(loss_cp, 1),
                "classification": _classify(is_best, loss_cp),
            })
        except Exception as e:
            results.append({"move": uci, "san": uci, "classification": "unknown", "loss_cp": 0, "error": str(e)})
    return results

import asyncio

@app.post("/review")
async def review_game(req: ReviewRequest):
    if not req.fens or not req.moves or len(req.fens) != len(req.moves):
        raise HTTPException(400, "fens and moves must be same length and non-empty")
    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(None, _do_review, req.fens, req.moves, req.depth)
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"results": results}


@app.on_event("shutdown")
def shutdown():
    global engine, review_engine
    if engine:
        engine.quit()
    if review_engine:
        review_engine.quit()
