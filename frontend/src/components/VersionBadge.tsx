import React, { useEffect, useState } from 'react'

type Version = { commit?: string; build_time?: string }

function fmtTime(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const pad = (n: number) => n.toString().padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

export function VersionBadge() {
  const [v, setV] = useState<Version>({})
  useEffect(() => {
    fetch('/version').then(r => r.json()).then(setV).catch(() => setV({}))
  }, [])
  const short = (v.commit || '').slice(0, 6)
  const stamp = fmtTime(v.build_time)
  if (!short && !stamp) return null
  return (
    <div className="version-badge" title={`${short || 'dev'} @ ${stamp}`}>
      Commit {short || 'dev'} · {stamp}
    </div>
  )
}
