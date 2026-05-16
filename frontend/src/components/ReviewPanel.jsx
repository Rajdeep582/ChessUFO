import { useMemo } from 'react'

const CATS = [
  { key: 'brilliant',  label: 'Brilliant',  bg: '#22b9b0', num: '#22b9b0' },
  { key: 'great',      label: 'Great',      bg: '#5d7ec9', num: '#8aaae8' },
  { key: 'book',       label: 'Book',       bg: '#c4a27d', num: '#c4a27d' },
  { key: 'best',       label: 'Best',       bg: '#5fb454', num: '#5fb454' },
  { key: 'excellent',  label: 'Excellent',  bg: '#5fb454', num: '#5fb454' },
  { key: 'good',       label: 'Good',       bg: '#7ab648', num: '#7ab648' },
  { key: 'inaccuracy', label: 'Inaccuracy', bg: '#f5a623', num: '#f5a623' },
  { key: 'mistake',    label: 'Mistake',    bg: '#e07c20', num: '#e07c20' },
  { key: 'miss',       label: 'Miss',       bg: '#e05555', num: '#e05555' },
  { key: 'blunder',    label: 'Blunder',    bg: '#cc3333', num: '#cc3333' },
]

const CLASSIFY_BAR = {
  brilliant:  '#22b9b0',
  great:      '#5d7ec9',
  book:       '#c4a27d',
  best:       '#5fb454',
  excellent:  '#5fb454',
  good:       '#7ab648',
  inaccuracy: '#f5a623',
  mistake:    '#e07c20',
  miss:       '#e05555',
  blunder:    '#cc3333',
}

const CLASSIFY_SYMBOL = {
  brilliant: '!!', great: '!', book: '≡', best: '★', excellent: '✓✓',
  good: '✓', inaccuracy: '?!', mistake: '?', miss: '✕', blunder: '??',
}

const GRAPH_DOT = new Set(['brilliant','great','book','inaccuracy','mistake','miss','blunder'])

function starPoints(cx, cy, R, r, n=5) {
  const pts = []
  for (let i = 0; i < n*2; i++) {
    const a = (i*Math.PI/n) - Math.PI/2
    const rad = i%2===0 ? R : r
    pts.push(`${(cx+rad*Math.cos(a)).toFixed(2)},${(cy+rad*Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

function CatIcon({ catKey, bg, size=46 }) {
  const r = size/2
  const TW = { fill:'#fff', fontFamily:'Inter,system-ui,sans-serif', fontWeight:'900', dominantBaseline:'central', textAnchor:'middle' }
  const fs = f => size * f

  const inner = (() => {
    switch(catKey) {
      case 'brilliant':
        return <text x={r} y={r} fontSize={fs(0.30)} {...TW}>!!</text>
      case 'great':
        return <text x={r} y={r} fontSize={fs(0.48)} {...TW}>!</text>
      case 'book':
        return (
          <g transform={`translate(${size*0.17},${size*0.18}) scale(${size/46})`}>
            <path d="M11.5 4 Q6.5 4 4.5 6 L4.5 19 Q6.5 17.5 11.5 17.5 Z" fill="#fff" opacity="0.95"/>
            <path d="M11.5 4 Q16.5 4 18.5 6 L18.5 19 Q16.5 17.5 11.5 17.5 Z" fill="#fff" opacity="0.95"/>
            <line x1="11.5" y1="4" x2="11.5" y2="17.5" stroke={bg} strokeWidth="1"/>
            <line x1="5.5" y1="8.5"  x2="11"  y2="8.5"  stroke={bg} strokeWidth="0.9" opacity="0.45"/>
            <line x1="5.5" y1="11.5" x2="11"  y2="11.5" stroke={bg} strokeWidth="0.9" opacity="0.45"/>
            <line x1="5.5" y1="14.5" x2="11"  y2="14.5" stroke={bg} strokeWidth="0.9" opacity="0.45"/>
            <line x1="12"  y1="8.5"  x2="17.5" y2="8.5"  stroke={bg} strokeWidth="0.9" opacity="0.45"/>
            <line x1="12"  y1="11.5" x2="17.5" y2="11.5" stroke={bg} strokeWidth="0.9" opacity="0.45"/>
            <line x1="12"  y1="14.5" x2="17.5" y2="14.5" stroke={bg} strokeWidth="0.9" opacity="0.45"/>
          </g>
        )
      case 'best':
        return <polygon points={starPoints(r, r, r*0.66, r*0.28)} fill="#fff"/>
      case 'excellent':
        return (
          <g transform={`translate(${size*0.26}, ${size*0.22}) scale(${size*0.025})`}>
            <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" fill="#fff"/>
          </g>
        )
      case 'good':
        return (
          <path
            d={`M${r*0.28} ${r*1.08} L${r*0.68} ${r*1.52} L${r*1.68} ${r*0.52}`}
            stroke="#fff" strokeWidth={fs(0.085)} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        )
      case 'inaccuracy':
        return <text x={r} y={r} fontSize={fs(0.29)} {...TW}>?!</text>
      case 'mistake':
        return <text x={r} y={r} fontSize={fs(0.48)} {...TW}>?</text>
      case 'miss':
        return <text x={r} y={r} fontSize={fs(0.46)} {...TW}>✕</text>
      case 'blunder':
        return <text x={r} y={r} fontSize={fs(0.29)} {...TW}>??</text>
      default: return null
    }
  })()

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0, display:'block' }}>
      <circle cx={r} cy={r} r={r} fill={bg}/>
      {inner}
    </svg>
  )
}

/* ── Eval graph with cursor line ── */
function EvalGraph({ evalSeries, review, historyIdx }) {
  const W = 500, H = 80, cap = 8
  if (evalSeries.length < 2) return null

  const norm = v => H/2 - (Math.max(-cap, Math.min(cap, v)) / cap) * (H/2 - 5)
  const pts  = evalSeries.map((v,i) => [i / (evalSeries.length-1) * W, norm(v)])
  const line = pts.map(([x,y], i) => `${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const mid  = H / 2
  const x0   = pts[0][0].toFixed(1)
  const xN   = pts[pts.length-1][0].toFixed(1)

  const whiteFill = `${line} L${xN} ${H} L${x0} ${H} Z`
  const blackFill = `${line} L${xN} ${0} L${x0} ${0} Z`

  // Cursor x: historyIdx maps to pts[historyIdx+1] (0 = after move 0)
  const cursorPt = historyIdx >= 0 && historyIdx < pts.length ? pts[historyIdx + 1] : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width:'100%', height:H, display:'block' }}>
      <defs>
        <clipPath id="rp-above"><rect x={0} y={0} width={W} height={mid}/></clipPath>
        <clipPath id="rp-below"><rect x={0} y={mid} width={W} height={mid}/></clipPath>
      </defs>
      <rect width={W} height={H} fill="#1e1c1a"/>
      <path d={whiteFill} fill="rgba(232,224,205,0.92)" clipPath="url(#rp-above)"/>
      <path d={blackFill} fill="rgba(8,6,4,0.97)" clipPath="url(#rp-below)"/>
      <line x1={0} y1={mid} x2={W} y2={mid} stroke="rgba(255,255,255,0.13)" strokeWidth="0.9"/>
      <path d={line} fill="none" stroke="rgba(200,195,185,0.45)" strokeWidth="1.4"/>
      {/* Cursor line */}
      {cursorPt && (
        <line
          x1={cursorPt[0].toFixed(1)} y1={0}
          x2={cursorPt[0].toFixed(1)} y2={H}
          stroke="rgba(120,200,120,0.7)" strokeWidth="1.5"/>
      )}
      {/* Classification dots */}
      {review.map((r,i) => {
        if (!GRAPH_DOT.has(r.classification)) return null
        const pt = pts[i+1]
        if (!pt) return null
        const [x,y] = pt
        return (
          <circle key={i}
            cx={x.toFixed(1)} cy={y.toFixed(1)} r="4.8"
            fill={CLASSIFY_BAR[r.classification]}
            stroke="#1e1c1a" strokeWidth="1.5"/>
        )
      })}
    </svg>
  )
}

function winPct(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

function calcAcc(moves) {
  if (!moves.length) return null
  const valid = moves.filter(m => m.eval_before != null && m.eval_after != null)
  if (!valid.length) return null
  const s = valid.reduce((a, m) => {
    const bcp = m.eval_before * 100   // pawn → cp
    const acp = m.eval_after  * 100
    const winLoss = Math.max(0, winPct(bcp) - winPct(acp))
    return a + Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669))
  }, 0)
  return (s / valid.length).toFixed(1)
}

/* ── Move info bar — shows classification + eval for current move ── */
function MoveInfoBar({ review, historyIdx }) {
  if (historyIdx < 0 || historyIdx >= review.length) return null
  const r = review[historyIdx]
  if (!r) return null
  const cls = r.classification
  const bg = CLASSIFY_BAR[cls]
  const sym = CLASSIFY_SYMBOL[cls]
  const evalPawn = r.eval_after != null ? (Math.abs(r.eval_after)/100).toFixed(2) : null
  const sign = r.eval_after > 0 ? '+' : r.eval_after < 0 ? '−' : ''
  return (
    <div className="rp-moveinfo">
      {bg && sym && (
        <span className="rp-moveinfo-badge" style={{ background: bg }}>{sym}</span>
      )}
      <span className="rp-moveinfo-cls">{cls ? cls.charAt(0).toUpperCase()+cls.slice(1) : ''}</span>
      {evalPawn && (
        <span className="rp-moveinfo-eval">{sign}{evalPawn}</span>
      )}
    </div>
  )
}

export default function ReviewPanel({ review, history, historyIdx, pairs, jumpToHistory, onClose, notationRef }) {
  const wMoves = useMemo(() => review.filter((_, i) => i%2===0), [review])
  const bMoves = useMemo(() => review.filter((_, i) => i%2===1), [review])
  const wAcc   = useMemo(() => calcAcc(wMoves), [wMoves])
  const bAcc   = useMemo(() => calcAcc(bMoves), [bMoves])

  const counts = useMemo(() => {
    const w={}, b={}
    CATS.forEach(c => { w[c.key]=0; b[c.key]=0 })
    review.forEach((r, i) => {
      const t = i%2===0 ? w : b
      if (r.classification in t) t[r.classification]++
    })
    return { w, b }
  }, [review])

  const evalSeries = useMemo(() => {
    const s = []
    review.forEach((r, i) => {
      const sign = i%2===0 ? 1 : -1
      if (i===0) s.push(sign * (r.eval_before ?? 0))
      s.push(sign * (r.eval_after ?? 0))
    })
    return s
  }, [review])

  const total = review.length

  const goFirst = () => jumpToHistory(0)
  const goPrev  = () => jumpToHistory(Math.max(0, historyIdx - 1))
  const goNext  = () => jumpToHistory(Math.min(total - 1, historyIdx + 1))
  const goLast  = () => jumpToHistory(total - 1)

  return (
    <div className="rp-wrap">

      {/* Eval graph */}
      <div className="rp-graph">
        <EvalGraph evalSeries={evalSeries} review={review} historyIdx={historyIdx}/>
      </div>

      {/* Move info for current position */}
      <MoveInfoBar review={review} historyIdx={historyIdx}/>

      {/* Accuracy */}
      <div className="rp-acc-row">
        <div className="rp-acc-side">
          <span className="rp-acc-who">White</span>
          <span className="rp-acc-pct">{wAcc ?? '—'}%</span>
        </div>
        <div className="rp-acc-bars">
          <div className="rp-acc-bar-track">
            <div className="rp-acc-bar-fill" style={{ width:`${wAcc??0}%`, background:'#e4dcca' }}/>
          </div>
          <div className="rp-acc-label-center">Accuracy</div>
          <div className="rp-acc-bar-track">
            <div className="rp-acc-bar-fill" style={{ width:`${bAcc??0}%`, background:'#6e6e6e' }}/>
          </div>
        </div>
        <div className="rp-acc-side rp-acc-right">
          <span className="rp-acc-who">Black</span>
          <span className="rp-acc-pct">{bAcc ?? '—'}%</span>
        </div>
      </div>

      {/* Scrollable: cat table + notation */}
      <div className="rp-scroll-body">

        <div className="rp-cat-section">
          {CATS.map(cat => {
            const wc = counts.w[cat.key] ?? 0
            const bc = counts.b[cat.key] ?? 0
            return (
              <div key={cat.key} className="rp-cat-row">
                <span className="rp-cat-lbl">{cat.label}</span>
                <span className="rp-cat-n" style={{ color: cat.num }}>{wc}</span>
                <CatIcon catKey={cat.key} bg={cat.bg} size={46}/>
                <span className="rp-cat-n" style={{ color: cat.num }}>{bc}</span>
              </div>
            )
          })}
        </div>

        <div className="rp-hr"/>

        {/* Move notation — badge BEFORE san, matching chess.com */}
        <div className="rp-notation" ref={notationRef}>
          {pairs.map(({ n, w, b, wi, bi }) => {
            const wr   = review[wi], br  = review[bi]
            const wbg  = wr ? CLASSIFY_BAR[wr.classification] : null
            const bbg  = br ? CLASSIFY_BAR[br.classification] : null
            const wsym = wr ? CLASSIFY_SYMBOL[wr.classification] : null
            const bsym = br ? CLASSIFY_SYMBOL[br.classification] : null
            return (
              <div key={n} className="rp-move-row">
                <span className="rp-move-num">{n}.</span>

                <span
                  className={`rp-move${historyIdx===wi?' active':''}`}
                  onClick={() => jumpToHistory(wi)}>
                  {wsym && wbg && (
                    <span className="rp-badge" style={{ background: wbg }}>{wsym}</span>
                  )}
                  {w.san}
                </span>

                {b && (
                  <span
                    className={`rp-move${historyIdx===bi?' active':''}`}
                    onClick={() => jumpToHistory(bi)}>
                    {bsym && bbg && (
                      <span className="rp-badge" style={{ background: bbg }}>{bsym}</span>
                    )}
                    {b.san}
                  </span>
                )}
              </div>
            )
          })}
        </div>

      </div>

      {/* Nav controls */}
      <div className="rp-nav-row">
        <button className="rp-nav-btn" onClick={goFirst} title="First move">⏮</button>
        <button className="rp-nav-btn" onClick={goPrev}  title="Previous move">◀</button>
        <button className="rp-nav-btn" onClick={goNext}  title="Next move">▶</button>
        <button className="rp-nav-btn" onClick={goLast}  title="Last move">⏭</button>
      </div>

      <button className="rp-back-btn" onClick={onClose}>← Back to Analysis</button>
    </div>
  )
}
