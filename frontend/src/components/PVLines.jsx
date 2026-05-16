export default function PVLines({ lines, onJump }) {
  if (!lines.length) return null

  return (
    <div className="pv-container">
      <div className="pv-title">Principal Variations</div>
      {lines.map((line, i) => (
        <div
          key={i}
          className="pv-line"
          onClick={() => onJump(line.moves)}
          title="Jump to this line"
        >
          <span className="pv-score">{line.score}</span>
          <span className="pv-moves">
            {line.san?.slice(0, 6).join(' ') || line.moves?.slice(0, 6).join(' ')}
          </span>
        </div>
      ))}
    </div>
  )
}
