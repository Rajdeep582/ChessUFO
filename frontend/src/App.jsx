import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Chess } from 'chess.js'
import { motion, useSpring, useTransform } from 'framer-motion'
import ChessboardComponent from './components/ChessboardComponent'
import ReviewModal from './components/ReviewModal'
import ReviewPanel from './components/ReviewPanel'
import './App.css'

const API = 'http://localhost:8000'
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const CLASSIFY = {
  brilliant:  { symbol: '!!', bg: '#1bada6' },
  great:      { symbol: '!',  bg: '#5c7ec8' },
  best:       { symbol: '★',  bg: '#5fb454' },
  excellent:  { symbol: '👍', bg: '#5fb454' },
  good:       { symbol: '✓',  bg: '#7ab648' },
  inaccuracy: { symbol: '?!', bg: '#f5a623' },
  mistake:    { symbol: '?',  bg: '#e07c20' },
  miss:       { symbol: '✕',  bg: '#e05555' },
  blunder:    { symbol: '??', bg: '#c93636' },
  unknown:    { symbol: '',   bg: '#555'    },
}

function cpToWhitePct(score) {
  if (!score || score === '—') return 50
  if (score.startsWith('+M') || score === 'M0') return 99
  if (score.startsWith('-M')) return 1
  if (score.startsWith('M') && !score.startsWith('M-')) return 99
  const cp = parseFloat(score) * 100
  if (isNaN(cp)) return 50
  return Math.round(50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1))
}

function calcAccuracy(moves) {
  if (!moves.length) return null
  const sum = moves.reduce((a, m) => {
    return a + Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * (m.loss_cp || 0)) - 3.1669))
  }, 0)
  return Math.round(sum / moves.length)
}

export default function App() {
  const [fen, setFen] = useState(() => {
    try { const f = localStorage.getItem('cuf_fen'); return f ? new Chess(f).fen() : START_FEN } catch { return START_FEN }
  })
  const [game, setGame] = useState(() => {
    try { const f = localStorage.getItem('cuf_fen'); return f ? new Chess(f) : new Chess() } catch { return new Chess() }
  })
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cuf_hist') || '[]') } catch { return [] }
  })
  const [historyIdx, setHistoryIdx] = useState(() => {
    const s = localStorage.getItem('cuf_hidx'); return s !== null ? parseInt(s, 10) : -1
  })
  const [flipped, setFlipped] = useState(false)
  const [depth, setDepth] = useState(14)
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [engineOn, setEngineOn] = useState(true)
  const [evalBarOn, setEvalBarOn] = useState(true)
  const [fenInput, setFenInput] = useState('')
  const [review, setReview] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cuf_review') || 'null') } catch { return null }
  })
  const [reviewing, setReviewing] = useState(false)
  const [showReviewPanel, setShowReviewPanel] = useState(() => !!localStorage.getItem('cuf_review'))
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [selectedPVIdx, setSelectedPVIdx] = useState(0)
  const [numArrows, setNumArrows] = useState(1)
  const analyzeTimer = useRef(null)
  const notationRef = useRef(null)

  useEffect(() => { localStorage.setItem('cuf_fen', fen) }, [fen])
  useEffect(() => { localStorage.setItem('cuf_hist', JSON.stringify(history)) }, [history])
  useEffect(() => {
    if (review) localStorage.setItem('cuf_review', JSON.stringify(review))
    else localStorage.removeItem('cuf_review')
  }, [review])
  useEffect(() => { localStorage.setItem('cuf_hidx', historyIdx) }, [historyIdx])

  const analyze = useCallback(async (fenToAnalyze, d) => {
    if (!engineOn) return
    setAnalyzing(true)
    try {
      const res = await fetch(`${API}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: fenToAnalyze, depth: d }),
      })
      if (res.ok) { setAnalysis(await res.json()); setSelectedPVIdx(0) }
      else setAnalysis(null)
    } catch { setAnalysis(null) }
    finally { setAnalyzing(false) }
  }, [engineOn])

  useEffect(() => {
    if (!engineOn) { setAnalysis(null); return }
    if (analyzeTimer.current) clearTimeout(analyzeTimer.current)
    analyzeTimer.current = setTimeout(() => analyze(fen, depth), 100)
    return () => clearTimeout(analyzeTimer.current)
  }, [fen, depth, analyze, engineOn])

  // Auto-scroll notation to active move
  useEffect(() => {
    if (!notationRef.current) return
    const sel = showReviewPanel ? '.rp-move.active' : '.notation-move.active'
    const active = notationRef.current.querySelector(sel)
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [historyIdx, showReviewPanel])

  const onMove = useCallback((from, to, promotion = 'q') => {
    const g = new Chess(fen)
    const move = g.move({ from, to, promotion })
    if (!move) return false
    const newFen = g.fen()
    const uci = move.from + move.to + (move.promotion || '')
    const newEntry = { fen: newFen, san: move.san, uci }
    setHistory(prev => {
      const base = historyIdx === -1 ? [] : prev.slice(0, historyIdx + 1)
      return [...base, newEntry]
    })
    setHistoryIdx(h => (h === -1 ? 0 : h + 1))
    setFen(newFen)
    setGame(g)
    setReview(null)
    return true
  }, [fen, historyIdx])

  const jumpToHistory = useCallback((idx) => {
    if (idx < 0) {
      setFen(START_FEN); setGame(new Chess()); setHistoryIdx(-1)
    } else if (idx < history.length) {
      const e = history[idx]
      setFen(e.fen); setGame(new Chess(e.fen)); setHistoryIdx(idx)
    }
  }, [history])

  // Keyboard arrow nav — must be after jumpToHistory declaration
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft')  { e.preventDefault(); jumpToHistory(historyIdx - 1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); jumpToHistory(historyIdx + 1) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); jumpToHistory(-1) }
      if (e.key === 'ArrowDown') { e.preventDefault(); jumpToHistory(history.length - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [historyIdx, history.length, jumpToHistory])

  const jumpToPV = useCallback((pvMoves) => {
    const g = new Chess(fen)
    for (const uci of pvMoves) {
      try { g.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] || undefined }) } catch {}
    }
    setFen(g.fen()); setGame(g)
  }, [fen])

  const loadFen = (f) => {
    try {
      const src = (f || fenInput).trim()
      const g = new Chess(src)
      setFen(g.fen()); setGame(g); setHistory([]); setHistoryIdx(-1); setFenInput(''); setReview(null)
    } catch { alert('Invalid FEN') }
  }

  const reset = () => {
    localStorage.removeItem('cuf_fen'); localStorage.removeItem('cuf_hist')
    localStorage.removeItem('cuf_hidx'); localStorage.removeItem('cuf_review')
    setFen(START_FEN); setGame(new Chess())
    setHistory([]); setHistoryIdx(-1); setAnalysis(null)
    setReview(null); setShowReviewPanel(false)
  }

  const reviewGame = useCallback(async () => {
    if (history.length === 0 || reviewing) return
    const validMoves = history.filter(h => h.uci)
    if (!validMoves.length) return
    setReviewing(true); setReview(null)
    try {
      const fens  = [START_FEN, ...history.slice(0, -1).map(h => h.fen)]
      const moves = history.map(h => h.uci)
      const res = await fetch(`${API}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fens, moves }),
      })
      if (res.ok) setReview((await res.json()).results)
    } catch (e) { console.error('Review failed:', e) }
    finally { setReviewing(false) }
  }, [history, reviewing])

  const accuracy = useMemo(() => {
    if (!review) return null
    const white = review.filter((_, i) => i % 2 === 0)
    const black = review.filter((_, i) => i % 2 === 1)
    return { white: calcAccuracy(white), black: calcAccuracy(black) }
  }, [review])

  // Board annotation: show classification icon on destination square when reviewing
  const annotation = useMemo(() => {
    if (!review || historyIdx < 0 || historyIdx >= review.length) return null
    const r = review[historyIdx]
    const h = history[historyIdx]
    if (!r || !h?.uci || r.classification === 'best' || r.classification === 'good') return null
    return { toSq: h.uci.slice(2, 4), classification: r.classification }
  }, [review, historyIdx, history])

  const score    = analysis?.score ?? '—'
  const whitePct = cpToWhitePct(score)
  const pvLines  = analysis?.pv_lines ?? []
  const activePVLines = engineOn ? pvLines : []

  const springPct = useSpring(whitePct, { stiffness: 28, damping: 16, mass: 1.2 })
  useEffect(() => { springPct.set(whitePct) }, [whitePct, springPct])
  const blackH = useTransform(springPct, v => `${100 - v}%`)
  const whiteH = useTransform(springPct, v => `${v}%`)

  const pairs = []
  for (let i = 0; i < history.length; i += 2)
    pairs.push({ n: Math.floor(i/2)+1, w: history[i], b: history[i+1], wi: i, bi: i+1 })

  const scoreColor = (s) => {
    if (!s || s === '—') return '#888'
    if (s.startsWith('+')) return '#4caf6e'
    if (s.startsWith('-')) return '#d93c3c'
    return '#aaa'
  }

  return (
    <div className="app">
      {/* Header */}
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="crown">♛</span>
          <span className="game-mode">ChessUFO</span>
        </div>
        <div className="top-bar-right">
          <span className="top-badge">Analysis</span>
        </div>
      </div>

      {/* Main layout */}
      <div className="main-row">
        {/* Board + eval bar */}
        <div className="board-area">
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {engineOn && activePVLines.length > 1 && (
              <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:4 }}>
                <select
                  value={numArrows}
                  onChange={e => setNumArrows(Number(e.target.value))}
                  style={{
                    background:'#1e1c1a', color:'#c9b267',
                    border:'1px solid rgba(201,178,103,0.35)', borderRadius:5,
                    padding:'3px 10px', fontSize:'0.72rem', fontWeight:600,
                    cursor:'pointer', outline:'none',
                  }}>
                  {[1,2,3].filter(n => n <= activePVLines.length).map(n => (
                    <option key={n} value={n}>{n} line{n>1?'s':''}</option>
                  ))}
                </select>
              </div>
            )}
            <ChessboardComponent fen={fen} flipped={flipped} onMove={onMove} pvLines={activePVLines} numArrows={numArrows} annotation={annotation} />
          </div>
          {evalBarOn && (
            <div className="eval-bar-wrap" title={score}>
              <motion.div className="eval-bar-black" style={{ height: blackH }} />
              <motion.div className="eval-bar-white" style={{ height: whiteH }} />
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className={`right-panel${showReviewPanel && review ? ' right-panel--review' : ''}`}>

          {showReviewPanel && review ? (
            /* ── REVIEW RESULTS VIEW ── */
            <ReviewPanel
              review={review}
              history={history}
              historyIdx={historyIdx}
              pairs={pairs}
              jumpToHistory={jumpToHistory}
              notationRef={notationRef}
              onClose={() => setShowReviewPanel(false)}
            />
          ) : (
            /* ── NORMAL ANALYSIS VIEW ── */
            <>
              {/* Engine row */}
              <div className="engine-header">
                <button className={`engine-toggle ${engineOn ? 'on' : 'off'}`}
                  onClick={() => setEngineOn(e => !e)} title="Toggle engine">
                  <span className="toggle-dot" />
                </button>
                <span className="engine-score" style={{ color: scoreColor(engineOn ? score : '—') }}>
                  {engineOn ? score : '—'}
                </span>
                <span className="engine-badge">SF 17 · NNUE</span>
                {analyzing && <span className="engine-pulse" />}
                <span className="engine-depth">{engineOn && analysis ? `d${analysis.depth}` : ''}</span>
                <button className={`evalbar-toggle ${evalBarOn ? 'active' : ''}`}
                  onClick={() => setEvalBarOn(e => !e)} title="Toggle eval bar">▌</button>
              </div>

              {/* PV lines */}
              {engineOn && pvLines.length > 0 && (
                <div className="pv-section">
                  {pvLines.map((line, i) => {
                    const cont = line.san?.slice(0, 2).join(' ') || line.moves?.[0] || ''
                    return (
                      <div key={i}
                        className="pv-line"
                        onClick={() => jumpToPV(line.moves)}>
                        <span className="pv-rank">{i + 1}</span>
                        <span className="pv-cont">{cont}</span>
                        <span className="pv-score" style={{ color: scoreColor(line.score) }}>{line.score}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Move notation */}
              <div className="notation-scroll" ref={notationRef}>
                {pairs.length === 0 && <div className="notation-empty">No moves yet</div>}
                {pairs.map(({ n, w, b, wi, bi }) => {
                  const wr = review?.[wi], br = review?.[bi]
                  return (
                    <div key={n} className="notation-row">
                      <span className="notation-num">{n}.</span>
                      <span className={`notation-move${historyIdx === wi ? ' active' : ''}`} onClick={() => jumpToHistory(wi)}>
                        {w.san}
                        {wr && CLASSIFY[wr.classification]?.symbol && (
                          <span className="move-badge" style={{ background: CLASSIFY[wr.classification]?.bg }}>
                            {CLASSIFY[wr.classification]?.symbol}
                          </span>
                        )}
                      </span>
                      {b && (
                        <span className={`notation-move${historyIdx === bi ? ' active' : ''}`} onClick={() => jumpToHistory(bi)}>
                          {b.san}
                          {br && CLASSIFY[br.classification]?.symbol && (
                            <span className="move-badge" style={{ background: CLASSIFY[br.classification]?.bg }}>
                              {CLASSIFY[br.classification]?.symbol}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Nav controls */}
              <div className="nav-controls">
                <button className="nav-btn" onClick={reset} title="Reset">⊗</button>
                <button className="nav-btn" onClick={() => setFlipped(f => !f)} title="Flip">⇅</button>
                <button className="nav-btn" onClick={() => jumpToHistory(-1)} title="Start" disabled={historyIdx < 0}>⏮</button>
                <button className="nav-btn" onClick={() => jumpToHistory(historyIdx - 1)} title="Back" disabled={historyIdx < 0}>‹</button>
                <button className="nav-btn" onClick={() => jumpToHistory(historyIdx + 1)} title="Fwd" disabled={historyIdx >= history.length - 1}>›</button>
                <button className="nav-btn" onClick={() => jumpToHistory(history.length - 1)} title="End" disabled={historyIdx >= history.length - 1}>⏭</button>
                <div className="depth-wrap">
                  <input type="range" min={8} max={28} value={depth}
                    onChange={e => setDepth(+e.target.value)}
                    className="depth-slider" title={`Depth: ${depth}`} />
                  <span className="depth-val">{depth}</span>
                </div>
              </div>

              {/* Review button */}
              <div className="review-bar">
                {review && !showReviewPanel && (
                  <button className="review-btn" style={{ marginBottom: 6 }}
                    onClick={() => setShowReviewPanel(true)}>
                    📊 Show Review Report
                  </button>
                )}
                <button className="review-btn" onClick={() => setShowReviewModal(true)}
                  disabled={history.length === 0}>
                  🔍 Review Game
                </button>
              </div>
            </>
          )}

        </div>
      </div>

      {/* FEN bar */}
      <div className="fen-bar">
        <span className="fen-label">FEN</span>
        <input
          className="fen-input"
          value={fenInput || fen}
          onChange={e => setFenInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadFen()}
          onFocus={e => { setFenInput(fen); e.target.select() }}
          spellCheck={false}
        />
      </div>
      {showReviewModal && (
        <ReviewModal
          history={history}
          onClose={() => setShowReviewModal(false)}
          onReviewDone={(results) => {
            setReview(results)
            setShowReviewModal(false)
            setShowReviewPanel(true)
          }}
        />
      )}
    </div>
  )
}
