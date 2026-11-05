import { buildPaper, type Assignment, type MV, type Paper } from '../engine/pattern.ts'
import type { Puzzle } from './types.ts'

export function paperOf(p: Pick<Puzzle, 'size' | 'lines'>): Paper {
  return buildPaper(
    p.size,
    p.lines.map(([x1, y1, x2, y2]) => ({ a: [x1, y1], b: [x2, y2] })),
  )
}

/** 辺の id ごとの山谷を、辺の番号順の配列に */
export function toAssignment(paper: Paper, byId: Readonly<Record<string, MV>>): Assignment {
  return paper.edges.map((e) => byId[e.id])
}

export function toRecord(paper: Paper, a: Assignment): Record<string, MV> {
  const out: Record<string, MV> = {}
  paper.edges.forEach((e, i) => {
    const x = a[i]
    if (x) out[e.id] = x
  })
  return out
}
