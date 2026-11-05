import { key, segMid, type Pt } from '../engine/geom.ts'
import { buildPaper, type MV } from '../engine/pattern.ts'
import type { EdgeState, Model } from '../engine/states.ts'
import type { LineSpec, Puzzle } from './types.ts'

/** 線を小三角形の辺の key に分ける（2 倍座標で 1 マスずつ、斜めは半分ずつ） */
function segKeys([x1, y1, x2, y2]: LineSpec): string[] {
  const sx = Math.sign(x2 - x1)
  const sy = Math.sign(y2 - y1)
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))
  const out: string[] = []
  for (let k = 0; k < steps; k++) {
    const from: Pt = [2 * (x1 + k * sx), 2 * (y1 + k * sy)]
    const to: Pt = [from[0] + 2 * sx, from[1] + 2 * sy]
    if (sx !== 0 && sy !== 0) {
      const c: Pt = [from[0] + sx, from[1] + sy]
      out.push(key(segMid(from, c)), key(segMid(c, to)))
    } else out.push(key(segMid(from, to)))
  }
  return out
}

/** 決まった線と候補線を両方引いた紙と、辺ごとに候補線かどうか */
export function modelOf(p: Pick<Puzzle, 'size' | 'lines' | 'ghosts'>): Model {
  const all = [...p.lines, ...(p.ghosts ?? [])]
  const full = buildPaper(
    p.size,
    all.map(([x1, y1, x2, y2]) => ({ a: [x1, y1], b: [x2, y2] })),
  )
  const ghostSegs = new Set((p.ghosts ?? []).flatMap(segKeys))
  const ghost = full.edges.map((e) => ghostSegs.has(e.segs[0]))
  return { full, ghost }
}

/** 辺ごとの初めの状態: 決まった線は手がかりの山谷か未定、候補線は「なし」 */
export function initialStates(m: Model, p: Pick<Puzzle, 'given'>): EdgeState[] {
  return m.full.edges.map((e, i) => p.given[e.id] ?? (m.ghost[i] ? 'N' : undefined))
}

/** 答え（使う辺だけの山谷）を辺ごとの状態に */
export function answerStates(m: Model, p: Pick<Puzzle, 'answer'>): EdgeState[] {
  return m.full.edges.map((e) => p.answer[e.id] ?? 'N')
}

export function toRecord(m: Model, states: readonly EdgeState[]): Record<string, MV> {
  const out: Record<string, MV> = {}
  m.full.edges.forEach((e, i) => {
    const x = states[i]
    if (x === 'M' || x === 'V') out[e.id] = x
  })
  return out
}

/** 候補線の辺が、決まった線と重なっていない（重なると辺が両方の性質を持ってしまう） */
export function ghostOverlap(p: Pick<Puzzle, 'lines' | 'ghosts'>): boolean {
  const solid = new Set(p.lines.flatMap(segKeys))
  return (p.ghosts ?? []).flatMap(segKeys).some((k) => solid.has(k))
}
