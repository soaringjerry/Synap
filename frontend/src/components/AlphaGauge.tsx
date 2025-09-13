import React, { useEffect, useMemo, useState } from 'react'

type Props = { value: number; label?: string }

export function AlphaGauge({ value, label }: Props) {
  const clamped = Math.max(0, Math.min(1, value))
  const [progress, setProgress] = useState(0)
  const size = 140
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = useMemo(() => c * progress, [c, progress])

  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const dur = 900
    const from = 0
    const to = clamped
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - k, 3)
      setProgress(from + (to - from) * eased)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [clamped])

  const pct = Math.round(progress * 100)
  const hue = 120 * progress // 0..120 (red->green-ish)

  return (
    <div className="gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="gauge-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size/2}
          cy={size/2}
          r={r}
          stroke="url(#gauge-grad)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
        />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="22" fontWeight={800} fill={`hsl(${hue} 80% 65%)`}>
          {progress.toFixed(2)}
        </text>
      </svg>
      <div className="gauge-label">{label || 'Reliability (α)'}</div>
    </div>
  )
}

