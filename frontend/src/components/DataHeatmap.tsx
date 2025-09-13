import React from 'react'

type Props = {
  data: number[][] // rows x cols
  rowLabels?: string[]
  colLabels?: string[]
}

export function DataHeatmap({ data, rowLabels = [], colLabels = [] }: Props) {
  const rows = data.length
  const cols = rows ? data[0].length : 0
  const max = Math.max(1, ...data.flat())
  return (
    <div>
      <div className="heatmap" style={{gridTemplateColumns:`repeat(${cols},1fr)`}}>
        {data.flatMap((row, ri) => row.map((v, ci) => {
          const alpha = max ? (0.15 + 0.85 * (v / max)) : 0.15
          const hue = 200 + (v/max)*80
          return (
            <div key={`${ri}-${ci}`} className="cell" title={`${rowLabels[ri]||ri+1} • ${colLabels[ci]||ci+1}: ${v}`}
              style={{ background:`hsla(${hue},90%,55%,${alpha})`, borderRadius:3, minHeight:18 }} />
          )
        }))}
      </div>
      {colLabels.length>0 && (
        <div className="muted" style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6}}>
          {colLabels.map((c,i)=>(<span key={i}>{c}</span>))}
        </div>
      )}
    </div>
  )
}

