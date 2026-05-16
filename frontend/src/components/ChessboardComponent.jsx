import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Chess } from 'chess.js'

const PIECE_URL = (p) => `https://lichess1.org/assets/piece/cburnett/${p}.svg`

const ANNOT = {
  brilliant:  { bg: '#22b9b0', symbol: '!!', small: true },
  great:      { bg: '#5d7ec9', symbol: '!',  small: false },
  book:       { bg: '#c6a87d', symbol: '≡',  small: false },
  best:       { bg: '#5fb454', symbol: '★',  small: false },
  excellent:  { bg: '#5fb454', symbol: '✓✓', small: true },
  good:       { bg: '#7ab648', symbol: '✓',  small: false },
  inaccuracy: { bg: '#f5a623', symbol: '?!', small: true },
  mistake:    { bg: '#e07c20', symbol: '?',  small: false },
  miss:       { bg: '#e05555', symbol: '✕',  small: false },
  blunder:    { bg: '#cc3333', symbol: '??', small: true },
}

function AnnotationIcon({ classification }) {
  const d = ANNOT[classification]
  if (!d) return null
  return (
    <div style={{
      position: 'absolute', bottom: 1, right: 1,
      width: 24, height: 24, borderRadius: '50%',
      background: d.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: d.small ? '0.42rem' : '0.65rem',
      fontWeight: 900, color: '#fff',
      zIndex: 10, pointerEvents: 'none',
      boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
      letterSpacing: 0, lineHeight: 1,
      border: '1.5px solid rgba(0,0,0,0.3)',
    }}>{d.symbol}</div>
  )
}

function fenToPos(fen) {
  const pos = {}
  fen.split(' ')[0].split('/').forEach((row, ri) => {
    let ci = 0
    for (const ch of row) {
      const n = parseInt(ch)
      if (!isNaN(n)) { ci += n; continue }
      const rank = 8 - ri
      const file = String.fromCharCode(97 + ci)
      pos[`${file}${rank}`] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase()
      ci++
    }
  })
  return pos
}

export default function ChessboardComponent({ fen, flipped, onMove, pvLines = [], numArrows = 1, annotation }) {
  const [drag, setDrag] = useState(null)
  const [hoverSq, setHoverSq] = useState(null)
  const boardRef = useRef(null)
  const dragRef = useRef(null)
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  const pos = useMemo(() => fenToPos(fen), [fen])
  const chess = useMemo(() => new Chess(fen), [fen])

  const files = useMemo(() =>
    flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'],
  [flipped])
  const ranks = useMemo(() =>
    flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1],
  [flipped])

  const sqFromPoint = useCallback((x, y) => {
    const b = boardRef.current
    if (!b) return null
    const r = b.getBoundingClientRect()
    const sz = r.width / 8
    const ci = Math.floor((x - r.left) / sz)
    const ri = Math.floor((y - r.top) / sz)
    if (ci < 0 || ci > 7 || ri < 0 || ri > 7) return null
    return `${files[ci]}${ranks[ri]}`
  }, [files, ranks])

  const onPointerDown = useCallback((e, sq) => {
    const piece = pos[sq]
    if (!piece || piece[0] !== chess.turn() || chess.isGameOver()) return
    e.preventDefault()
    const legalTargets = new Set(chess.moves({ square: sq, verbose: true }).map(m => m.to))
    if (legalTargets.size === 0) return
    const state = { piece, src: sq, x: e.clientX, y: e.clientY, legalTargets }
    setDrag(state); dragRef.current = state; setHoverSq(null)
  }, [pos, chess])

  useEffect(() => {
    if (!drag) return
    const onPM = (e) => {
      const sq = sqFromPoint(e.clientX, e.clientY)
      const next = { ...dragRef.current, x: e.clientX, y: e.clientY }
      dragRef.current = next; setDrag(next)
      setHoverSq(sq && dragRef.current.legalTargets.has(sq) ? sq : null)
    }
    const onPU = (e) => {
      const targetSq = sqFromPoint(e.clientX, e.clientY)
      if (targetSq && dragRef.current?.legalTargets.has(targetSq))
        onMoveRef.current(dragRef.current.src, targetSq, 'q')
      setDrag(null); setHoverSq(null); dragRef.current = null
    }
    window.addEventListener('pointermove', onPM)
    window.addEventListener('pointerup', onPU)
    return () => { window.removeEventListener('pointermove', onPM); window.removeEventListener('pointerup', onPU) }
  }, [drag, sqFromPoint])

  const ARROW_STYLES = [
    { sw: 9, hw: 22, hl: 24, sg: 18, fill: 'rgba(100,110,200,0.82)' },
    { sw: 5, hw: 14, hl: 20, sg: 18, fill: 'rgba(100,110,200,0.55)' },
    { sw: 3, hw: 10, hl: 17, sg: 18, fill: 'rgba(100,110,200,0.38)' },
  ]

  const arrowPaths = useMemo(() => {
    const getXY = (sq) => {
      const ci = files.indexOf(sq[0])
      const ri = ranks.indexOf(parseInt(sq[1]))
      return [ci * 60 + 30, ri * 60 + 30]
    }
    const makePath = (uci, style) => {
      if (!uci || uci.length < 4) return null
      const from = uci.slice(0,2), to = uci.slice(2,4)
      const [x1,y1] = getXY(from), [x2,y2] = getXY(to)
      if (x1===x2 && y1===y2) return null
      const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)
      const nx=dx/len, ny=dy/len, px=-ny, py=nx
      const { sw, hw, hl, sg } = style
      const sx=x1+nx*sg, sy=y1+ny*sg
      const bx=x2-nx*hl, by=y2-ny*hl
      return [
        `M ${sx+px*sw} ${sy+py*sw}`, `L ${bx+px*sw} ${by+py*sw}`,
        `L ${bx+px*hw} ${by+py*hw}`, `L ${x2} ${y2}`,
        `L ${bx-px*hw} ${by-py*hw}`, `L ${bx-px*sw} ${by-py*sw}`,
        `L ${sx-px*sw} ${sy-py*sw}`, 'Z',
      ].join(' ')
    }
    return pvLines.slice(0, numArrows).map((line, i) => ({
      path: makePath(line?.moves?.[0], ARROW_STYLES[i]),
      fill: ARROW_STYLES[i].fill,
    })).filter(a => a.path)
  }, [pvLines, numArrows, files, ranks])

  return (
    <div className="board-wrapper"
      style={{ position:'relative', width:480, height:480, userSelect:'none', WebkitUserSelect:'none' }}>
      <div ref={boardRef}
        style={{ display:'grid', gridTemplateColumns:'repeat(8,60px)', gridTemplateRows:'repeat(8,60px)', width:480, height:480 }}>
        {ranks.flatMap((rank, ri) => files.map((file, ci) => {
          const sq = `${file}${rank}`
          const piece = pos[sq]
          const isDragSrc = drag?.src === sq
          const isLegal = drag?.legalTargets.has(sq)
          const isHover = hoverSq === sq
          const isLight = (ci + ri) % 2 === 0
          const canPickUp  = piece?.[0] === chess.turn() && !chess.isGameOver() && !drag
          const isAnnotSq  = annotation?.toSq === sq

          return (
            <div key={sq}
              onPointerDown={canPickUp ? (e) => onPointerDown(e, sq) : undefined}
              style={{
                position:'relative', width:60, height:60,
                backgroundColor: isLight ? '#f0d9b5' : '#b58863',
                cursor: piece?.[0] === chess.turn() && !chess.isGameOver()
                  ? (drag ? 'grabbing' : 'grab') : 'default',
              }}>


              {isLegal && (
                <div style={{
                  position:'absolute', top:'50%', left:'50%',
                  transform:'translate(-50%,-50%)', pointerEvents:'none',
                  ...(piece && !isDragSrc
                    ? { width:'88%', height:'88%', border:'5px solid rgba(0,0,0,0.18)', borderRadius:'50%', boxSizing:'border-box' }
                    : { width:'34%', height:'34%', borderRadius:'50%', backgroundColor:'rgba(0,0,0,0.15)' }),
                }} />
              )}

              {isHover && (
                <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(0,0,0,0.2)', pointerEvents:'none' }} />
              )}

              {piece && (
                <img src={PIECE_URL(piece)} alt={piece} draggable={false}
                  style={{ width:'100%', height:'100%', display:'block', pointerEvents:'none', opacity: isDragSrc ? 0.2 : 1,
                    imageRendering: 'auto', WebkitFontSmoothing: 'antialiased' }} />
              )}

              {/* Move classification annotation icon */}
              {isAnnotSq && annotation?.classification && (
                <AnnotationIcon classification={annotation.classification} />
              )}

              {ci === 0 && (
                <span style={{ position:'absolute', top:2, left:3, fontSize:'0.6rem', fontWeight:700,
                  lineHeight:1, color: isLight ? '#b58863' : '#f0d9b5', pointerEvents:'none' }}>{rank}</span>
              )}
              {ri === 7 && (
                <span style={{ position:'absolute', bottom:2, right:3, fontSize:'0.6rem', fontWeight:700,
                  lineHeight:1, color: isLight ? '#b58863' : '#f0d9b5', pointerEvents:'none' }}>{file}</span>
              )}
            </div>
          )
        }))}
      </div>

      {arrowPaths.length > 0 && !drag && (
        <svg style={{ position:'absolute', inset:0, width:480, height:480, pointerEvents:'none' }} viewBox="0 0 480 480">
          {/* draw thinnest first so best is on top */}
          {[...arrowPaths].reverse().map((a, i) => (
            <path key={i} d={a.path} fill={a.fill} />
          ))}
        </svg>
      )}


      {drag && createPortal(
        <img src={PIECE_URL(drag.piece)} alt={drag.piece} draggable={false}
          style={{ position:'fixed', left:drag.x-36, top:drag.y-36, width:72, height:72,
            pointerEvents:'none', zIndex:9999, filter:'drop-shadow(0 6px 18px rgba(0,0,0,0.6))' }} />,
        document.body
      )}
    </div>
  )
}
