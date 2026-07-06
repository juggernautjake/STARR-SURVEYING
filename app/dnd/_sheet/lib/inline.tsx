import React from 'react'

// Tiny inline formatter: **bold** and *italic*. Safe (no raw HTML).
export function md(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) nodes.push(<strong key={key++}>{m[1]}</strong>)
    else if (m[2] !== undefined) nodes.push(<em className="term" key={key++}>{m[2]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}
