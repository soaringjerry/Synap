export type Scale = { id: string; points: number; randomize?: boolean; name_i18n?: Record<string, string>; consent_i18n?: Record<string,string>; collect_email?: 'off'|'optional'|'required'; e2ee_enabled?: boolean; region?: 'auto'|'gdpr'|'pipl'|'pdpa'|'ccpa' }
export type ItemOut = {
  id: string
  stem: string
  reverse_scored?: boolean
  type?: 'likert'|'single'|'multiple'|'dropdown'|'rating'|'short_text'|'long_text'|'numeric'|'date'|'time'|'slider'
  options?: string[]
  min?: number
  max?: number
  step?: number
  required?: boolean
  placeholder?: string
}

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

export async function submitBulk(scaleId: string, email: string, answers: { item_id: string; raw: any }[]) {
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

// --- Admin helpers (simple token-based) ---
function authHeaders(): Record<string,string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return token ? { Authorization: `Bearer ${token}` } : {} as Record<string,string>
}

export async function adminListScales() {
  const res = await fetch(`/api/admin/scales`, { headers: authHeaders() })
  return j<{ scales: Scale[] }>(res)
}
export async function adminGetScale(id: string) {
  const res = await fetch(`/api/admin/scales/${encodeURIComponent(id)}`, { headers: authHeaders() })
  return j<Scale>(res)
}
export async function adminGetScaleItems(id: string) {
  const res = await fetch(`/api/admin/scales/${encodeURIComponent(id)}/items`, { headers: authHeaders() })
  return j<{ items: any[] }>(res)
}
export async function adminCreateScale(input: Partial<Scale> & { name_i18n: Record<string,string>, points: number }) {
  const res = await fetch(`/api/scales`, { method: 'POST', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(input) })
  return j<Scale>(res)
}
export async function adminUpdateScale(id: string, input: Partial<Scale>) {
  const res = await fetch(`/api/admin/scales/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(input) })
  return j<{ok:true}>(res)
}
export async function adminDeleteScale(id: string) {
  const res = await fetch(`/api/admin/scales/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() })
  return j<{ok:true}>(res)
}
export async function adminCreateItem(input: { scale_id: string, reverse_scored?: boolean, stem_i18n: Record<string,string>, type?: ItemOut['type'], options_i18n?: Record<string,string[]>, min?: number, max?: number, step?: number, required?: boolean, placeholder_i18n?: Record<string,string> }) {
  const res = await fetch(`/api/items`, { method: 'POST', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(input) })
  return j<any>(res)
}
export async function adminUpdateItem(id: string, input: { reverse_scored?: boolean, stem_i18n?: Record<string,string>, type?: ItemOut['type'], options_i18n?: Record<string,string[]>, min?: number, max?: number, step?: number, required?: boolean, placeholder_i18n?: Record<string,string> }) {
  const res = await fetch(`/api/admin/items/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(input) })
  return j<{ok:true}>(res)
}
export async function adminDeleteItem(id: string) {
  const res = await fetch(`/api/admin/items/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() })
  return j<{ok:true}>(res)
}

export async function getScaleMeta(id: string) {
  const res = await fetch(`${base}/api/scale/${encodeURIComponent(id)}`)
  return j<{ id:string; name_i18n?: Record<string,string>; points:number; randomize?: boolean; consent_i18n?: Record<string,string>; collect_email?: Scale['collect_email'] }>(res)
}

export type AnalyticsSummary = {
  scale_id: string
  points: number
  total_responses: number
  items: { id:string; stem_i18n?: Record<string,string>; reverse_scored?: boolean; histogram: number[]; total: number }[]
  timeseries: { date: string; count: number }[]
  alpha: number
  n: number
}

export async function adminAnalyticsSummary(scaleId: string) {
  const res = await fetch(`/api/admin/analytics/summary?scale_id=${encodeURIComponent(scaleId)}`, { headers: authHeaders() })
  return j<AnalyticsSummary>(res)
}

// E2EE keys management
export async function adminListProjectKeys(projectId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/keys`, { headers: authHeaders() })
  return j<{ keys: { alg:string; kdf:string; public_key:string; fingerprint:string; created_at:string; disabled?: boolean }[] }>(res)
}
export async function adminAddProjectKey(projectId: string, input: { alg:string; kdf:string; public_key:string; fingerprint:string }) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/keys`, { method:'POST', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(input) })
  return j<{ok:true}>(res)
}

// --- Admin AI config & translation ---
export type AIConfig = { tenant_id: string; openai_key?: string; openai_base?: string; allow_external: boolean; store_logs: boolean }
export async function adminGetAIConfig() {
  const res = await fetch(`/api/admin/ai/config`, { headers: authHeaders() })
  return j<AIConfig>(res)
}
export async function adminUpdateAIConfig(input: Partial<AIConfig>) {
  const res = await fetch(`/api/admin/ai/config`, { method:'PUT', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(input) })
  return j<{ok:true}>(res)
}
export async function adminAITranslatePreview(scale_id: string, target_langs: string[], model?: string) {
  const res = await fetch(`/api/admin/ai/translate/preview`, { method:'POST', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify({ scale_id, target_langs, model }) })
  return j<{ items: Record<string, Record<string,string>>; name_i18n?: Record<string,string>; consent_i18n?: Record<string,string> }>(res)
}
