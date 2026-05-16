import { useMemo } from 'react'

function parseScore(score) {
  if (!score || score === '—') return 0
  if (score.startsWith('M') || score.startsWith('+M')) {
    // white mating
    return 100
  }
  if (score.startsWith('-M') || score.startsWith('M-')) {
    // black mating
    return -100
  }
  const n = parseFloat(score)
  if (isNaN(n)) return 0
  return n
}

// sigmoid-ish: cp → white win% [0,100]
function cpToWinPct(cp) {
  // clamp
  const clamped = Math.max(-1500, Math.min(1500, cp * 100))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1)
}

export default function EvalBar({ score, flipped }) {
  const cp = parseScore(score)
  let whitePct
  if (cp >= 100) whitePct = 100
  else if (cp <= -100) whitePct = 0
  else whitePct = cpToWinPct(cp)

  // bar fills from bottom (white) upward
  const whiteHeight = `${whitePct}%`
  const blackHeight = `${100 - whitePct}%`

  return (
    <div className="eval-bar-container" title={score}>
      <div className="eval-bar">
        <div
          className="eval-bar-black"
          style={{ height: blackHeight, transition: 'height 0.4s ease' }}
        />
        <div
          className="eval-bar-white"
          style={{ height: whiteHeight, transition: 'height 0.4s ease' }}
        />
      </div>
      <div className="eval-bar-label">{score}</div>
    </div>
  )
}
