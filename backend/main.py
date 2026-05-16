import os
import sys
import math
import asyncio
import logging
from typing import Optional

logging.basicConfig(level=logging.INFO)
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import chess
import chess.engine

# ── Engine tuning ──────────────────────────────────────────────
THREADS = int(os.environ.get("STOCKFISH_THREADS", max(1, (os.cpu_count() or 2) - 1)))
HASH_MB  = int(os.environ.get("STOCKFISH_HASH_MB", 128))
# UCI_AnalyseMode omitted — not supported by older apt Stockfish builds
ENGINE_OPTIONS = {"Threads": THREADS, "Hash": HASH_MB}
# ───────────────────────────────────────────────────────────────

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
            logging.info(f"Starting Stockfish at: {ENGINE_PATH}")
            engine = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)
            # Apply options one by one so a bad option doesn't kill init
            for k, v in ENGINE_OPTIONS.items():
                try:
                    engine.configure({k: v})
                except Exception as e:
                    logging.warning(f"Engine option {k}={v} rejected: {e}")
            logging.info(f"Engine ready. Threads={THREADS} Hash={HASH_MB}MB")
        except FileNotFoundError:
            raise RuntimeError(f"Stockfish not found at '{ENGINE_PATH}'. Set STOCKFISH_PATH env var.")
        except Exception as e:
            raise RuntimeError(f"Engine init failed: {e}")
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


def _do_analyze(fen: str, depth: int) -> dict:
    board = chess.Board(fen)
    eng = get_engine()
    info_list = eng.analyse(board, chess.engine.Limit(depth=depth), multipv=3)

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
        pv_lines.append({"score": score_str, "moves": uci_moves[:10], "san": san_moves[:10]})

    return {"score": top_score or "0.00", "bestmove": bestmove, "pv_lines": pv_lines, "depth": depth}


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    try:
        chess.Board(req.fen)  # validate
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid FEN")
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _do_analyze, req.fen, req.depth)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        try:
            review_engine = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)
            for k, v in ENGINE_OPTIONS.items():
                try:
                    review_engine.configure({k: v})
                except Exception as e:
                    logging.warning(f"Review engine option {k}={v} rejected: {e}")
        except Exception as e:
            raise RuntimeError(f"Review engine init failed: {e}")
    return review_engine

# ── Expected Points helpers (chess.com model) ──────────────────
def _cp_to_ep(cp: float) -> float:
    """Centipawns → win probability [0,1]. k≈1/272 matches chess.com logistic."""
    return 1.0 / (1.0 + math.exp(-cp / 272.0))

PIECE_VAL = {
    chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
    chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0,
}

def _is_sacrifice(board: chess.Board, move: chess.Move) -> bool:
    """True if move gives up material — captures lower-value piece, or moves into attack by lower-value piece."""
    piece = board.piece_at(move.from_square)
    if piece is None:
        return False
    mover_val = PIECE_VAL.get(piece.piece_type, 0)
    captured = board.piece_at(move.to_square)
    if captured:
        # Capturing cheaper piece = sacrifice
        return mover_val > PIECE_VAL.get(captured.piece_type, 0) + 1
    # Non-capture: moving into square attacked by cheaper opponent piece
    b2 = board.copy()
    b2.push(move)
    for sq in b2.attackers(not board.turn, move.to_square):
        att = b2.piece_at(sq)
        if att and PIECE_VAL.get(att.piece_type, 0) < mover_val:
            return True
    return False

def _classify_move(
    is_best: bool, loss_ep: float,
    ep_before: float, ep_after: float,
    is_sac: bool,
) -> str:
    """
    Chess.com EP-based classification:
      Best        loss = 0.00
      Excellent   loss ≤ 0.02
      Good        loss ≤ 0.05
      Inaccuracy  loss ≤ 0.10
      Mistake     loss ≤ 0.20
      Blunder     loss > 0.20
    Plus special:
      Brilliant   sacrifice + best/excellent + not losing after + wasn't already crushing
      Great       game-turning (equal/losing → winning) + excellent move
      Miss        had winning pos (ep_before > 0.70) + lost major advantage (loss_ep > 0.10)
    """
    # Brilliant: piece sac, nearly best, still safe after, position wasn't already won
    if is_sac and loss_ep <= 0.02 and ep_after >= 0.45 and ep_before <= 0.88:
        return "brilliant"
    # Great: game-turning move (not winning → winning, excellent quality)
    if ep_before <= 0.46 and ep_after >= 0.54 and loss_ep <= 0.02:
        return "great"
    # Miss: had winning advantage, failed to capitalise
    if ep_before >= 0.70 and loss_ep > 0.10:
        return "miss"
    # Standard EP thresholds
    if is_best or loss_ep <= 0.001:  return "best"
    if loss_ep <= 0.02:              return "excellent"
    if loss_ep <= 0.05:              return "good"
    if loss_ep <= 0.10:              return "inaccuracy"
    if loss_ep <= 0.20:              return "mistake"
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

            # Convert to Expected Points (chess.com model)
            ep_before = _cp_to_ep(before_cp)
            ep_after  = _cp_to_ep(after_cp)
            loss_ep   = max(0.0, ep_before - ep_after)

            is_sac = _is_sacrifice(board, move)
            classification = _classify_move(is_best, loss_ep, ep_before, ep_after, is_sac)

            results.append({
                "move": uci,
                "san": san,
                "best_move": ev_before["best"] or uci,
                "eval_before": round(before_cp / 100, 2),
                "eval_after":  round(after_cp  / 100, 2),
                "loss_cp": round(loss_cp, 1),
                "loss_ep": round(loss_ep, 4),
                "classification": classification,
            })
        except Exception as e:
            results.append({"move": uci, "san": uci, "classification": "unknown", "loss_cp": 0, "error": str(e)})
    return results

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
