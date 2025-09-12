export type Scale = { id: string; points: number; randomize?: boolean; name_i18n?: Record<string, string> }
export type ItemOut = { id: string; stem: string; reverse_scored?: boolean }

const base = '' // relative to same origin

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export async function seedSample() {
  const res = await fetch(`${base}/api/seed`, { method: 'POST' })
  return j<{ ok: boolean; scale_id: string }>(res)
}

export async function listItems(scaleId: string, lang: string) {
  const res = await fetch(`${base}/api/scales/${encodeURIComponent(scaleId)}/items?lang=${encodeURIComponent(lang)}`)
  return j<{ scale_id: string; items: ItemOut[] }>(res)
}

export async function submitBulk(scaleId: string, email: string, answers: { item_id: string; raw_value: number }[]) {
  const res = await fetch(`${base}/api/responses/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participant: { email }, scale_id: scaleId, answers })
  })
  return j<{ ok: boolean; participant_id: string; count: number }>(res)
}

export async function getAlpha(scaleId: string) {
  const res = await fetch(`${base}/api/metrics/alpha?scale_id=${encodeURIComponent(scaleId)}`)
  return j<{ alpha: number; n: number }>(res)
}

