export default function Controls({
  flipped, setFlipped,
  depth, setDepth,
  goBack, goForward, canBack, canForward,
  fenInput, setFenInput, loadFen, resetBoard,
}) {
  return (
    <div className="controls">
      <div className="controls-row">
        <button className="btn" onClick={goBack} disabled={!canBack} title="Previous move">◀</button>
        <button className="btn" onClick={goForward} disabled={!canForward} title="Next move">▶</button>
        <button className="btn" onClick={() => setFlipped(f => !f)} title="Flip board">⇅</button>
        <button className="btn btn-reset" onClick={resetBoard} title="Reset board">↺</button>
      </div>

      <div className="controls-row depth-row">
        <label className="depth-label-text">Depth: {depth}</label>
        <input
          type="range"
          min={10} max={30} step={1}
          value={depth}
          onChange={e => setDepth(Number(e.target.value))}
          className="depth-slider"
        />
      </div>

      <div className="controls-row fen-row">
        <input
          className="fen-input"
          type="text"
          placeholder="Paste FEN…"
          value={fenInput}
          onChange={e => setFenInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadFen()}
        />
        <button className="btn" onClick={loadFen}>Load</button>
      </div>
    </div>
  )
}
