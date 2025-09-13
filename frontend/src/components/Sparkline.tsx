import React, { useEffect, useMemo, useRef } from 'react'

type Props = { points?: number[] }

export function Sparkline({ points }: Props) {
  const data = useMemo(() => points ?? [2,3,2,4,3,5,6,5,7,9,8,10], [points])
  const w = 260
  const h = 70
  const pad = 6
  const max = Math.max(...data)
  const min = Math.min(...data)
  const dx = (w - pad * 2) / (data.length - 1)
  const norm = (v: number) => h - pad - ((v - min) / Math.max(1, max - min)) * (h - pad * 2)
  const d = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * dx} ${norm(v)}`).join(' ')
  const pathRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    const el = pathRef.current
    if (!el) return
    const len = el.getTotalLength()
    el.style.strokeDasharray = `${len}`
    el.style.strokeDashoffset = `${len}`
    el.getBoundingClientRect()
    el.style.transition = 'stroke-dashoffset 900ms ease'
    requestAnimationFrame(() => { el.style.strokeDashoffset = '0' })
  }, [d])

  const lastY = norm(data[data.length-1])

  return (
    <svg width={w} height={h} className="spark">
      <defs>
        <linearGradient id="spark-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <path ref={pathRef} d={d} fill="none" stroke="url(#spark-grad)" strokeWidth={2.5} strokeLinecap="round"/>
      <circle cx={w - pad} cy={lastY} r={3.6} fill="#22d3ee" />
    </svg>
  )
}

