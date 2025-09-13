#!/usr/bin/env node
/*
 Simple i18n consistency check
 - Compares flattened key sets between en and zh for namespaces: common, auth
 - Detects duplicate top-level properties inside each namespace by scanning raw JSON
 - Exits non‑zero on problems
*/
const fs = require('fs')
const path = require('path')

const EN_PATH = path.join(__dirname, '..', 'frontend', 'src', 'i18n', 'locales', 'en.json')
const ZH_PATH = path.join(__dirname, '..', 'frontend', 'src', 'i18n', 'locales', 'zh.json')

function readJson(p) {
  const text = fs.readFileSync(p, 'utf8')
  const obj = JSON.parse(text)
  return { text, obj }
}

function flatten(obj, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flatten(v, key))
    } else {
      out.push(key)
    }
  }
  return out
}

function findObjectSlice(jsonText, objectKey) {
  // returns { start, end, slice } for the substring of the object value braces
  const keyIdx = jsonText.indexOf(`"${objectKey}"`)
  if (keyIdx === -1) return null
  let i = keyIdx + objectKey.length + 2
  // move to first '{' after colon
  while (i < jsonText.length && jsonText[i] !== '{') i++
  if (jsonText[i] !== '{') return null
  const start = i
  let depth = 0, inStr = false, esc = false
  for (; i < jsonText.length; i++) {
    const ch = jsonText[i]
    if (inStr) {
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') { inStr = false; continue }
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') { depth++; continue }
    if (ch === '}') { depth--; if (depth === 0) { const end = i; return { start, end, slice: jsonText.slice(start, end + 1) } } }
  }
  return null
}

function topLevelPropCounts(objSlice) {
  // objSlice includes surrounding braces { ... }
  const s = objSlice.slice(1, -1) // inner only
  let i = 0, depth = 0, inStr = false, esc = false
  const counts = new Map()
  while (i < s.length) {
    const ch = s[i]
    if (inStr) {
      if (esc) { esc = false; i++; continue }
      if (ch === '\\') { esc = true; i++; continue }
      if (ch === '"') { inStr = false; i++; continue }
      i++; continue
    }
    if (ch === '"' && depth === 0) {
      // start of a property name at top level
      let j = i + 1, name = ''
      for (; j < s.length; j++) {
        const c = s[j]
        if (esc) { esc = false; name += c; continue }
        if (c === '\\') { esc = true; continue }
        if (c === '"') break
        name += c
      }
      // move to next ':' at same position
      i = j + 1
      while (i < s.length && s[i] !== ':') i++
      // record
      counts.set(name, (counts.get(name) || 0) + 1)
      i++
      continue
    }
    if (ch === '{') { depth++; i++; continue }
    if (ch === '}') { depth--; i++; continue }
    i++
  }
  return counts
}

function main() {
  const { text: enText, obj: en } = readJson(EN_PATH)
  const { text: zhText, obj: zh } = readJson(ZH_PATH)

  const namespaces = ['common', 'auth']
  let errors = 0

  // Missing keys check
  for (const ns of namespaces) {
    const enKeys = new Set(flatten(en[ns] || {}).map(k => `${ns}.${k}`))
    const zhKeys = new Set(flatten(zh[ns] || {}).map(k => `${ns}.${k}`))
    const onlyEn = [...enKeys].filter(k => !zhKeys.has(k))
    const onlyZh = [...zhKeys].filter(k => !enKeys.has(k))
    if (onlyEn.length) {
      console.error(`[i18n] zh missing keys vs en (${ns}):`)
      for (const k of onlyEn) console.error('  -', k)
      errors++
    }
    if (onlyZh.length) {
      console.error(`[i18n] en missing keys vs zh (${ns}):`)
      for (const k of onlyZh) console.error('  -', k)
      errors++
    }
  }

  // Duplicate top-level keys inside each namespace (text scan)
  for (const [text, lang] of [[enText, 'en'], [zhText, 'zh']]) {
    for (const ns of namespaces) {
      const seg = findObjectSlice(text, ns)
      if (!seg) continue
      const counts = topLevelPropCounts(seg.slice)
      const dups = [...counts.entries()].filter(([_, c]) => c > 1)
      if (dups.length) {
        console.error(`[i18n] duplicate top-level keys in ${lang}.${ns}:`)
        for (const [k, c] of dups) console.error(`  - ${k} (x${c})`)
        errors++
      }
    }
  }

  if (errors) {
    console.error(`i18n check failed with ${errors} issue(s).`)
    process.exit(1)
  } else {
    console.log('i18n check passed: en/zh key sets match and no duplicates found.')
  }
}

main()

