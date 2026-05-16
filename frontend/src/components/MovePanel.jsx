import { useEffect, useRef } from 'react'

export default function MovePanel({ history, currentIdx, onJump }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      const active = scrollRef.current.querySelector('.move-token.active')
      if (active) active.scrollIntoView({ block: 'nearest' })
    }
  }, [currentIdx])

  if (!history.length) {
    return (
      <div className="move-panel">
        <div className="move-panel-title">Moves</div>
        <div className="move-panel-empty">No moves yet</div>
      </div>
    )
  }

  // Pair moves: white + black per row
  const pairs = []
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({ num: Math.floor(i / 2) + 1, w: history[i], b: history[i + 1], wi: i, bi: i + 1 })
  }

  return (
    <div className="move-panel">
      <div className="move-panel-title">Moves</div>
      <div className="move-list" ref={scrollRef}>
        {pairs.map(({ num, w, b, wi, bi }) => (
          <div key={num} className="move-row">
            <span className="move-num">{num}.</span>
            <span
              className={`move-token${currentIdx === wi ? ' active' : ''}`}
              onClick={() => onJump(wi)}
            >{w.san}</span>
            {b && (
              <span
                className={`move-token${currentIdx === bi ? ' active' : ''}`}
                onClick={() => onJump(bi)}
              >{b.san}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
