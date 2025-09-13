import React, { useMemo } from 'react'

type Props = { rows?: number; cols?: number }

function seedRandom(seed = 1337) {
  let s = seed >>> 0
  return () => {
    // xorshift32
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }
}

export function Heatmap({ rows = 8, cols = 14 }: Props) {
  const values = useMemo(() => {
    const rand = seedRandom(2077)
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => Math.pow(rand(), 1.2))
    )
  }, [rows, cols])

  return (
    <div className="heatmap" style={{gridTemplateColumns:`repeat(${cols},1fr)`}}>
      {values.flatMap((row, ri) => row.map((v, ci) => {
        const hue = 200 + v * 80 // bluish -> cyan
        const alpha = 0.3 + v * 0.7
        return (
          <div key={`${ri}-${ci}`} className="cell" style={{
            background: `hsla(${hue}, 90%, 55%, ${alpha})`,
            boxShadow: `0 0 ${6*v}px hsla(${hue},90%,60%,${alpha*0.8}) inset`
          }} />
        )
      }))}
    </div>
  )
}

