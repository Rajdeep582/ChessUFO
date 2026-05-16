import { useState, useMemo, useCallback } from 'react'
import { Chess } from 'chess.js'

const API = 'http://localhost:8000'
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/* Exactly matching chess.com categories + colors */
const CATS = [
  { key: 'brilliant',  label: 'Brilliant',  bg: '#22b9b0', num: '#22b9b0' },
  { key: 'great',      label: 'Great',      bg: '#6b8fd4', num: '#6b8fd4' },
  { key: 'book',       label: 'Book',       bg: '#c4a27d', num: '#c4a27d' },
  { key: 'best',       label: 'Best',       bg: '#5fb454', num: '#7dd460' },
  { key: 'excellent',  label: 'Excellent',  bg: '#5fb454', num: '#7dd460' },
  { key: 'good',       label: 'Good',       bg: '#7ab648', num: '#7ab648' },
  { key: 'inaccuracy', label: 'Inaccuracy', bg: '#f5a623', num: '#f5a623' },
  { key: 'mistake',    label: 'Mistake',    bg: '#e07c20', num: '#e07c20' },
  { key: 'miss',       label: 'Miss',       bg: '#e05555', num: '#e05555' },
  { key: 'blunder',    label: 'Blunder',    bg: '#cc3333', num: '#e05050' },
]
const CAT_MAP = Object.fromEntries(CATS.map(c => [c.key, c]))

/* ── Icon SVGs — pixel-matched to chess.com ── */
function starPoints(cx, cy, R, r, n = 5) {
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI / n) - Math.PI / 2
    const rad = i % 2 === 0 ? R : r
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

function CatIcon({ catKey, size = 42 }) {
  const cat = CAT_MAP[catKey]
  if (!cat) return <div style={{ width: size, height: size }} />
  const r = size / 2
  const W = { fill: '#fff', fontFamily: 'Inter,system-ui,sans-serif', fontWeight: '900', dominantBaseline: 'central', textAnchor: 'middle' }

  const inner = (() => {
    switch (catKey) {
      case 'brilliant':
        return <text x={r} y={r} fontSize={size * 0.31} {...W}>!!</text>

      case 'great':
        return <text x={r} y={r} fontSize={size * 0.46} {...W}>!</text>

      case 'book':
        return (
          <g transform={`translate(${r * 0.22},${r * 0.28}) scale(${size / 42})`}>
            <path d="M10 3 Q5 3 3 5 L3 17 Q5 15.5 10 15.5 Z" fill="#fff" opacity="0.92"/>
            <path d="M10 3 Q15 3 17 5 L17 17 Q15 15.5 10 15.5 Z" fill="#fff" opacity="0.92"/>
            <line x1="10" y1="3" x2="10" y2="15.5" stroke={cat.bg} strokeWidth="0.8"/>
            <line x1="4.5" y1="7"  x2="9"  y2="7"  stroke={cat.bg} strokeWidth="0.7" opacity="0.5"/>
            <line x1="4"   y1="9.5"x2="9"  y2="9.5"stroke={cat.bg} strokeWidth="0.7" opacity="0.5"/>
            <line x1="4"   y1="12" x2="9"  y2="12" stroke={cat.bg} strokeWidth="0.7" opacity="0.5"/>
            <line x1="11"  y1="7"  x2="15.5" y2="7" stroke={cat.bg} strokeWidth="0.7" opacity="0.5"/>
            <line x1="11"  y1="9.5"x2="16" y2="9.5"stroke={cat.bg} strokeWidth="0.7" opacity="0.5"/>
            <line x1="11"  y1="12" x2="16" y2="12" stroke={cat.bg} strokeWidth="0.7" opacity="0.5"/>
          </g>
        )

      case 'best':
        return <polygon points={starPoints(r, r, r * 0.64, r * 0.27)} fill="#fff"/>

      case 'excellent':
        // thumbs up
        return (
          <g transform={`translate(${r * 0.5}, ${r * 0.44}) scale(${size * 0.038})`}>
            <path d="M2 20h2V10H2v10zm17.5-9H14V6c0-.55-.45-1-1-1h-.5L9 10.09V20h9.26l2.24-6.17V12c0-.55-.45-1-1-1z" fill="#fff"/>
          </g>
        )

      case 'good':
        return (
          <path d={`M${r*0.33} ${r*1.05} L${r*0.72} ${r*1.46} L${r*1.6} ${r*0.58}`}
            stroke="#fff" strokeWidth={size * 0.076} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        )

      case 'inaccuracy':
        return <text x={r} y={r} fontSize={size * 0.3} {...W}>?!</text>

      case 'mistake':
        return <text x={r} y={r} fontSize={size * 0.46} {...W}>?</text>

      case 'miss':
        return (
          <>
            <line x1={r*0.38} y1={r*0.38} x2={r*1.62} y2={r*1.62} stroke="#fff" strokeWidth={size*0.08} strokeLinecap="round"/>
            <line x1={r*1.62} y1={r*0.38} x2={r*0.38} y2={r*1.62} stroke="#fff" strokeWidth={size*0.08} strokeLinecap="round"/>
          </>
        )

      case 'blunder':
        return <text x={r} y={r} fontSize={size * 0.3} {...W}>??</text>

      default: return null
    }
  })()

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, display: 'block' }}>
      <circle cx={r} cy={r} r={r} fill={cat.bg}/>
      {inner}
    </svg>
  )
}

/* ── Eval graph ── */
function EvalGraph({ evalSeries, review }) {
  const W = 600, H = 88, cap = 10
  if (evalSeries.length < 2) return null
  const norm = v => H/2 - (Math.max(-cap, Math.min(cap, v)) / cap) * (H/2 - 6)
  const pts = evalSeries.map((v, i) => [i / (evalSeries.length - 1) * W, norm(v)])
  const line = pts.map(([x,y],i) => `${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const mid = H/2, last = pts[pts.length-1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width:'100%', height: H, display:'block', flexShrink:0 }}>
      <rect width={W} height={H} fill="#1a1816"/>
      <path d={`${line} L${last[0]} ${mid} L0 ${mid} Z`} fill="rgba(228,220,198,0.85)"/>
      <path d={`${line} L${last[0]} ${H} L0 ${H} Z`} fill="rgba(12,10,8,0.97)"/>
      <line x1={0} y1={mid} x2={W} y2={mid} stroke="#3a3835" strokeWidth="1"/>
      <path d={line} fill="none" stroke="rgba(195,190,180,0.55)" strokeWidth="1.8"/>
      {review.map((r, i) => {
        const cat = CAT_MAP[r.classification]
        if (!cat || ['best','excellent','good','book'].includes(r.classification)) return null
        const [x,y] = pts[i+1] || []
        if (x === undefined) return null
        return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="4" fill={cat.bg} stroke="#1a1816" strokeWidth="1.2"/>
      })}
    </svg>
  )
}

/* ── Utilities ── */
function winPct(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}
function calcAcc(moves) {
  if (!moves.length) return null
  const valid = moves.filter(m => m.eval_before != null && m.eval_after != null)
  if (!valid.length) return null
  const s = valid.reduce((a, m) => {
    const bcp = m.eval_before * 100
    const acp = m.eval_after  * 100
    const winLoss = Math.max(0, winPct(bcp) - winPct(acp))
    return a + Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669))
  }, 0)
  return (s / valid.length).toFixed(1)
}
function estRating(acc) {
  if (acc === null) return '—'
  return Math.round(Math.max(400, Math.min(2800, parseFloat(acc)**2 * 0.265)))
}
function phaseInfo(acc) {
  if (acc === null) return null
  const a = parseFloat(acc)
  if (a >= 90) return 'best'
  if (a >= 75) return 'good'
  if (a >= 60) return 'inaccuracy'
  if (a >= 45) return 'mistake'
  return 'blunder'
}
function depthLabel(d) {
  if (d <= 10) return 'Fast'
  if (d <= 14) return 'Balanced'
  if (d <= 18) return 'Deep'
  if (d <= 22) return 'Strong'
  return 'Maximum'
}

/* ── Main ── */
export default function ReviewModal({ history, onClose, onReviewDone }) {
  const [phase, setPhase] = useState('setup')
  const [depth, setDepth] = useState(14)
  const [review, setReview] = useState(null)

  const startReview = useCallback(async () => {
    if (!history.length) return
    setPhase('loading')
    try {
      const fens = [START_FEN, ...history.slice(0,-1).map(h => h.fen)]
      const moves = history.map((h,i) => {
        if (h.uci) return h.uci
        try { const g = new Chess(fens[i]); const m = g.move(h.san); return m ? m.from+m.to+(m.promotion||'') : null }
        catch { return null }
      }).filter(Boolean)
      if (!moves.length) { setPhase('setup'); return }
      const res = await fetch(`${API}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fens: fens.slice(0, moves.length), moves, depth }),
      })
      if (res.ok) {
        const data = await res.json()
        onReviewDone?.(data.results)
      } else {
        console.error('Review API error:', res.status)
        setPhase('setup')
      }
    } catch (e) {
      console.error('Review fetch failed:', e)
      alert(`Review failed: ${e.message}\n\nIs the backend running on port 8000?`)
      setPhase('setup')
    }
  }, [history, depth, onReviewDone])

  const wMoves = useMemo(() => review?.filter((_,i) => i%2===0)||[], [review])
  const bMoves = useMemo(() => review?.filter((_,i) => i%2===1)||[], [review])
  const wAcc = useMemo(() => calcAcc(wMoves), [wMoves])
  const bAcc = useMemo(() => calcAcc(bMoves), [bMoves])

  const counts = useMemo(() => {
    if (!review) return null
    const w={}, b={}
    CATS.forEach(c => { w[c.key]=0; b[c.key]=0 })
    review.forEach((r,i) => { const t=i%2===0?w:b; if(r.classification in t) t[r.classification]++ })
    return { w, b }
  }, [review])

  const evalSeries = useMemo(() => {
    if (!review) return []
    return review.flatMap((r,i) => {
      const sign = i%2===0 ? 1 : -1
      return i===0 ? [sign*(r.eval_before??0), sign*(r.eval_after??0)] : [sign*(r.eval_after??0)]
    })
  }, [review])

  const phaseRows = useMemo(() => {
    if (!review) return []
    const acc = (arr,s,e) => calcAcc(arr.slice(s,e))
    return [
      { label:'Opening',    wA: acc(wMoves,0,8),  bA: acc(bMoves,0,8)  },
      { label:'Middlegame', wA: acc(wMoves,8,20), bA: acc(bMoves,8,20) },
      ...(wMoves.length>20||bMoves.length>20
        ? [{label:'Endgame', wA: acc(wMoves,20,999), bA: acc(bMoves,20,999)}] : [])
    ].filter(r => r.wA||r.bA)
  }, [review, wMoves, bMoves])

  return (
    <div className="rm-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="rm-modal">

        <div className="rm-header">
          <span style={{ color:'#c0a35a', fontSize:'1.1rem' }}>★</span>
          <span className="rm-title">Game Review</span>
          <button className="rm-x" onClick={onClose}>✕</button>
        </div>

        {/* SETUP */}
        {phase==='setup' && (
          <div className="rm-body">
            <p className="rm-sub">Analyze {history.length} moves with Stockfish 17 · NNUE</p>
            <div className="rm-slabel">Analysis Depth</div>
            <div className="rm-depth-wrap">
              <div className="rm-depth-top">
                <span className="rm-depth-name">{depthLabel(depth)}</span>
                <span className="rm-depth-val">Depth {depth}</span>
              </div>
              <input type="range" min={8} max={26} step={1} value={depth}
                onChange={e => setDepth(+e.target.value)}
                onInput={e => setDepth(+e.target.value)}
                onPointerDown={e => e.stopPropagation()}
                className="rm-range"/>
              <div className="rm-ticks"><span>Fast</span><span>Balanced</span><span>Deep</span><span>Max</span></div>
            </div>
            <button className="rm-start" onClick={startReview} disabled={!history.length}>
              Start Review
            </button>
          </div>
        )}

        {/* LOADING */}
        {phase==='loading' && (
          <div className="rm-body rm-center">
            <div className="rm-spin"/>
            <p className="rm-load-title">Analyzing {history.length} moves…</p>
            <p className="rm-load-sub">Depth {depth} · This may take a moment</p>
          </div>
        )}

        {/* RESULTS */}
        {phase==='results' && review && (
          <div className="rm-results">
            <EvalGraph evalSeries={evalSeries} review={review}/>

            <div className="rm-scroll">
              {/* Accuracy */}
              <div className="rm-acc-row">
                <div className="rm-acc-side">
                  <div className="rm-acc-label">White</div>
                  <div className="rm-acc-pct white-side">{wAcc??'—'}%</div>
                  <div className="rm-acc-est">≈ {estRating(wAcc)}</div>
                </div>
                <div className="rm-acc-mid">Accuracy</div>
                <div className="rm-acc-side">
                  <div className="rm-acc-label">Black</div>
                  <div className="rm-acc-pct black-side">{bAcc??'—'}%</div>
                  <div className="rm-acc-est">≈ {estRating(bAcc)}</div>
                </div>
              </div>

              <div className="rm-hr"/>

              {/* Classification table — chess.com exact */}
              <table className="rm-cat-table">
                <tbody>
                  {CATS.map(cat => {
                    const wc = counts?.w[cat.key]??0
                    const bc = counts?.b[cat.key]??0
                    return (
                      <tr key={cat.key} className="rm-cat-row">
                        <td className="rm-cat-lbl">{cat.label}</td>
                        <td className="rm-cat-n" style={{ color: cat.num }}>{wc}</td>
                        <td className="rm-cat-icon"><CatIcon catKey={cat.key} size={42}/></td>
                        <td className="rm-cat-n" style={{ color: cat.num }}>{bc}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Phase breakdown */}
              {phaseRows.length > 0 && (
                <>
                  <div className="rm-hr"/>
                  <div className="rm-phase-table">
                    {phaseRows.map(row => (
                      <div key={row.label} className="rm-phase-row">
                        {row.wA ? <CatIcon catKey={phaseInfo(row.wA)} size={36}/> : <div style={{width:36}}/>}
                        <span className="rm-phase-lbl">{row.label}</span>
                        {row.bA ? <CatIcon catKey={phaseInfo(row.bA)} size={36}/> : <div style={{width:36}}/>}
                      </div>
                    ))}
                  </div>
                </>
              )}

              <button className="rm-again" onClick={() => { setPhase('setup'); setReview(null) }}>
                Review Again
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
