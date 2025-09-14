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
  return j<{ ok: boolean; participant_id: string; count: number; self_token?: string; self_export?: string; self_delete?: string }>(res)
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
export async function adminPurgeResponses(scaleId: string) {
  const res = await fetch(`/api/admin/scales/${encodeURIComponent(scaleId)}/responses`, { method: 'DELETE', headers: authHeaders() })
  return j<{ok:true; removed:number}>(res)
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
  return j<{ id:string; name_i18n?: Record<string,string>; points:number; randomize?: boolean; consent_i18n?: Record<string,string>; collect_email?: Scale['collect_email']; e2ee_enabled?: boolean; region?: Scale['region']; consent_config?: { version?: string, signature_required?: boolean, options?: { key:string; label_i18n?: Record<string,string>; required?: boolean }[] } }>(res)
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

export async function listProjectKeysPublic(projectId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/keys`)
  return j<{ keys: { alg:string; kdf:string; public_key:string; fingerprint:string }[] }>(res)
}

export async function submitE2EE(input: { scale_id: string; response_id?: string; ciphertext: string; nonce: string; enc_dek: string[]; aad_hash: string; pmk_fingerprint?: string }) {
  const res = await fetch(`/api/responses/e2ee`, { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(input) })
  return j<{ ok: boolean; response_id: string; self_token?: string; self_export?: string; self_delete?: string }>(res)
}

// Participant self-service (GDPR)
export async function participantSelfExport(pid: string, token: string) {
  const res = await fetch(`/api/self/participant/export?pid=${encodeURIComponent(pid)}&token=${encodeURIComponent(token)}`)
  return j<{ participant: any; responses: any[] }>(res)
}
export async function participantSelfDelete(pid: string, token: string, hard?: boolean) {
  const res = await fetch(`/api/self/participant/delete?pid=${encodeURIComponent(pid)}&token=${encodeURIComponent(token)}${hard?'&hard=true':''}`, { method: 'POST' })
  return j<{ ok: boolean }>(res)
}
export async function e2eeSelfExport(response_id: string, token: string) {
  const res = await fetch(`/api/self/e2ee/export?response_id=${encodeURIComponent(response_id)}&token=${encodeURIComponent(token)}`)
  return j<any>(res)
}
export async function e2eeSelfDelete(response_id: string, token: string) {
  const res = await fetch(`/api/self/e2ee/delete?response_id=${encodeURIComponent(response_id)}&token=${encodeURIComponent(token)}`, { method: 'POST' })
  return j<{ ok: boolean }>(res)
}

// E2EE export (step-up + short URL)
export async function adminCreateE2EEExport(scale_id: string) {
  const res = await fetch(`/api/exports/e2ee`, { method:'POST', headers: { 'Content-Type':'application/json', 'X-Step-Up':'true', ...authHeaders() }, body: JSON.stringify({ scale_id }) })
  return j<{ url: string; expires_at: string }>(res)
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

// Consent signature evidence
export async function postConsentSign(input: { scale_id: string; version?: string; locale?: string; choices: Record<string, boolean>; signed_at?: string; signature_kind?: string; evidence: string }) {
  const res = await fetch(`/api/consent/sign`, { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(input) })
  return j<{ ok: boolean; id: string; hash: string }>(res)
}
