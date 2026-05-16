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

export default function ChessboardComponent({ fen, flipped, onMove, pvLines = [], numArrows = 1, annotation, size = 480 }) {
  const sqSize = size / 8

  // drag = committed drag (piece floating under finger/cursor)
  const [drag, setDrag] = useState(null)
  const [hoverSq, setHoverSq] = useState(null)
  // tap-select state
  const [selectedSq, setSelectedSq] = useState(null)
  const [selectedLegal, setSelectedLegal] = useState(new Set())
  // slide animation
  const [moveAnim, setMoveAnim] = useState(null) // { piece, fromX, fromY, toX, toY, to, active }

  const boardRef = useRef(null)
  const dragRef = useRef(null)
  const pendingRef = useRef(null)
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  // reset selection when position changes
  useEffect(() => { setSelectedSq(null); setSelectedLegal(new Set()) }, [fen])

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

  const doMove = useCallback((from, to, skipAnim = false) => {
    if (!skipAnim) {
      const fci = files.indexOf(from[0]), fri = ranks.indexOf(parseInt(from[1]))
      const tci = files.indexOf(to[0]),   tri = ranks.indexOf(parseInt(to[1]))
      const piece = pos[from]
      if (piece) {
        const anim = {
          piece,
          fromX: fci * sqSize, fromY: fri * sqSize,
          toX:   tci * sqSize, toY:   tri * sqSize,
          to, active: false,
        }
        setMoveAnim(anim)
        requestAnimationFrame(() => requestAnimationFrame(() =>
          setMoveAnim(a => a ? { ...a, active: true } : null)
        ))
        setTimeout(() => setMoveAnim(null), 320)
      }
    }
    onMoveRef.current(from, to, 'q')
  }, [files, ranks, sqSize, pos])

  const onPointerDown = useCallback((e, sq) => {
    if (chess.isGameOver()) return
    e.preventDefault()

    // Case 1: piece selected + tapping legal target → move
    if (selectedSq && selectedLegal.has(sq)) {
      doMove(selectedSq, sq)
      return
    }

    const piece = pos[sq]

    // Case 2: own piece → select + begin potential drag
    if (piece && piece[0] === chess.turn()) {
      const legalTargets = new Set(chess.moves({ square: sq, verbose: true }).map(m => m.to))
      setSelectedSq(sq)
      setSelectedLegal(legalTargets)
      if (legalTargets.size > 0) {
        pendingRef.current = { piece, src: sq, x0: e.clientX, y0: e.clientY, legalTargets }
      }
      return
    }

    // Case 3: clicked elsewhere → deselect
    setSelectedSq(null); setSelectedLegal(new Set())
  }, [pos, chess, selectedSq, selectedLegal, doMove])

  // Global pointer tracking for drag
  useEffect(() => {
    const DRAG_THRESHOLD = 8

    const onPM = (e) => {
      const cx = e.clientX
      const cy = e.clientY
      if (cx == null) return

      if (dragRef.current) {
        const next = { ...dragRef.current, x: cx, y: cy }
        dragRef.current = next; setDrag(next)
        const sq = sqFromPoint(cx, cy)
        setHoverSq(sq && dragRef.current.legalTargets.has(sq) ? sq : null)
      } else if (pendingRef.current) {
        const { x0, y0 } = pendingRef.current
        if (Math.hypot(cx - x0, cy - y0) > DRAG_THRESHOLD) {
          const state = { ...pendingRef.current, x: cx, y: cy }
          dragRef.current = state; setDrag(state)
          pendingRef.current = null
        }
      }
    }

    const onPU = (e) => {
      const cx = e.clientX
      const cy = e.clientY

      if (dragRef.current) {
        if (cx != null) {
          const targetSq = sqFromPoint(cx, cy)
          if (targetSq && dragRef.current.legalTargets.has(targetSq))
            doMove(dragRef.current.src, targetSq, true) // drag: skip slide anim
        }
        dragRef.current = null; setDrag(null); setHoverSq(null)
      }
      pendingRef.current = null
    }

    window.addEventListener('pointermove', onPM, { passive: true })
    window.addEventListener('pointerup', onPU)
    return () => {
      window.removeEventListener('pointermove', onPM)
      window.removeEventListener('pointerup', onPU)
    }
  }, [sqFromPoint, doMove])

  const sc = size / 480
  const ARROW_STYLES = [
    { sw: 9*sc, hw: 22*sc, hl: 24*sc, sg: 18*sc, fill: 'rgba(100,110,200,0.82)' },
    { sw: 5*sc, hw: 14*sc, hl: 20*sc, sg: 18*sc, fill: 'rgba(100,110,200,0.55)' },
    { sw: 3*sc, hw: 10*sc, hl: 17*sc, sg: 18*sc, fill: 'rgba(100,110,200,0.38)' },
  ]

  const arrowPaths = useMemo(() => {
    const half = sqSize / 2
    const getXY = (sq) => {
      const ci = files.indexOf(sq[0])
      const ri = ranks.indexOf(parseInt(sq[1]))
      return [ci * sqSize + half, ri * sqSize + half]
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
  }, [pvLines, numArrows, files, ranks, sqSize])

  return (
    <div className="board-wrapper"
      style={{ position:'relative', width:size, height:size, userSelect:'none', WebkitUserSelect:'none' }}>
      <div ref={boardRef}
        style={{ display:'grid', gridTemplateColumns:`repeat(8,${sqSize}px)`, gridTemplateRows:`repeat(8,${sqSize}px)`, width:size, height:size, touchAction:'none' }}>
        {ranks.flatMap((rank, ri) => files.map((file, ci) => {
          const sq = `${file}${rank}`
          const piece = pos[sq]
          const isDragSrc = drag?.src === sq
          const isAnimTo = moveAnim?.to === sq
          const isSelected = selectedSq === sq
          const isLegal = selectedLegal.has(sq)
          const isHover = hoverSq === sq
          const isLight = (ci + ri) % 2 === 0
          const isAnnotSq = annotation?.toSq === sq
          const canInteract = !chess.isGameOver()

          return (
            <div key={sq}
              onPointerDown={canInteract ? (e) => onPointerDown(e, sq) : undefined}
              style={{
                position:'relative', width:sqSize, height:sqSize,
                backgroundColor: isSelected
                  ? (isLight ? '#f6f67d' : '#baca2b')
                  : (isLight ? '#f0d9b5' : '#b58863'),
                cursor: canInteract
                  ? (drag ? 'grabbing' : (piece?.[0] === chess.turn() || (selectedSq && isLegal) ? 'pointer' : 'default'))
                  : 'default',
              }}>

              {isLegal && (
                <div style={{
                  position:'absolute', top:'50%', left:'50%',
                  transform:'translate(-50%,-50%)', pointerEvents:'none',
                  ...(piece && !isDragSrc
                    ? { width:'88%', height:'88%', border:`${Math.max(3, sqSize*0.08)}px solid rgba(0,0,0,0.22)`, borderRadius:'50%', boxSizing:'border-box' }
                    : { width:'34%', height:'34%', borderRadius:'50%', backgroundColor:'rgba(0,0,0,0.18)' }),
                }} />
              )}

              {isHover && (
                <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(0,0,0,0.2)', pointerEvents:'none' }} />
              )}

              {piece && (
                <img src={PIECE_URL(piece)} alt={piece} draggable={false}
                  style={{
                    width:'100%', height:'100%', display:'block', pointerEvents:'none',
                    opacity: isDragSrc ? 0.15 : (isAnimTo ? 0 : 1),
                    imageRendering: 'auto',
                  }} />
              )}

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

      {/* Slide animation overlay */}
      {moveAnim && (
        <img
          src={PIECE_URL(moveAnim.piece)}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            width: sqSize, height: sqSize,
            left: moveAnim.active ? moveAnim.toX : moveAnim.fromX,
            top:  moveAnim.active ? moveAnim.toY : moveAnim.fromY,
            transition: moveAnim.active
              ? 'left 0.22s cubic-bezier(0.25,0.46,0.45,0.94), top 0.22s cubic-bezier(0.25,0.46,0.45,0.94)'
              : 'none',
            pointerEvents: 'none',
            zIndex: 8,
          }}
        />
      )}

      {arrowPaths.length > 0 && !drag && (
        <svg style={{ position:'absolute', inset:0, width:size, height:size, pointerEvents:'none', zIndex:9 }} viewBox={`0 0 ${size} ${size}`}>
          {[...arrowPaths].reverse().map((a, i) => (
            <path key={i} d={a.path} fill={a.fill} />
          ))}
        </svg>
      )}

      {drag && createPortal(
        <img src={PIECE_URL(drag.piece)} alt={drag.piece} draggable={false}
          style={{ position:'fixed', left:drag.x - sqSize*0.6, top:drag.y - sqSize*0.6, width:sqSize*1.2, height:sqSize*1.2,
            pointerEvents:'none', zIndex:9999, filter:'drop-shadow(0 6px 18px rgba(0,0,0,0.6))' }} />,
        document.body
      )}
    </div>
  )
}
