// Minimal Markdown to HTML converter with HTML escaping
// Supports: headings (#, ##), lists (-/*), bold **, italic *, inline code ``, links [text](https://)
// Escapes all HTML by default. Only outputs a small set of safe tags.

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(md: string): string {
  let s = esc(md)
  // inline code
  s = s.replace(/`([^`]+)`/g, (_m, p1) => `<code>${p1}</code>`)
  // bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // italic (single asterisks; naive)
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  // links [text](http(s)://...)
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_m, p1, p2) => `<a href="${esc(p2)}" target="_blank" rel="noreferrer">${esc(p1)}</a>`)
  // line breaks
  s = s.replace(/\n/g, '<br/>')
  return s
}

export function mdToHtml(md: string): string {
  if (!md) return ''
  // code blocks ```...```
  const codeBlockRegex = /```([\s\S]*?)```/g
  const codeBlocks: string[] = []
  let tmp = md
  tmp = tmp.replace(codeBlockRegex, (_m, p1) => {
    const i = codeBlocks.length
    codeBlocks.push(`<pre><code>${esc(p1)}</code></pre>`)
    return `@@CODE${i}@@`
  })
  const parts = tmp.split(/\n\n+/)
  const out: string[] = []
  for (const p of parts) {
    const lines = p.split(/\n/)
    if (lines.every(l => /^\s*[-*]\s+/.test(l))) {
      const items = lines.map(l => l.replace(/^\s*[-*]\s+/, ''))
      out.push(`<ul>${items.map(li => `<li>${inline(li)}</li>`).join('')}</ul>`) 
      continue
    }
    if (/^\s*#\s+/.test(p)) {
      out.push(`<h3>${inline(p.replace(/^\s*#\s+/, ''))}</h3>`) 
      continue
    }
    if (/^\s*##\s+/.test(p)) {
      out.push(`<h4>${inline(p.replace(/^\s*##\s+/, ''))}</h4>`) 
      continue
    }
    out.push(`<p>${inline(p)}</p>`)
  }
  let html = out.join('\n')
  html = html.replace(/@@CODE(\d+)@@/g, (_m, idx) => codeBlocks[Number(idx)] || '')
  return html
}

