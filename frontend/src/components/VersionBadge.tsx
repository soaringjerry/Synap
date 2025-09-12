import React, { useEffect, useState } from 'react'

type Version = { commit?: string; build_time?: string }

export function VersionBadge() {
  const [v, setV] = useState<Version>({})
  useEffect(() => {
    fetch('/version').then(r => r.json()).then(setV).catch(() => setV({}))
  }, [])
  const commit = (v.commit || '').slice(0, 7)
  const time = v.build_time || ''
  if (!commit && !time) return null
  return (
    <div className="version-badge" title={`${commit} @ ${time}`}>Commit {commit || 'dev'} · {time || ''}</div>
  )
}

