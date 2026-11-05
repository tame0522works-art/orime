/**
 * 問題づくりの下調べ。展開図の候補ごとに、折れる山谷を数え、答えを1つ選び、
 * 答えが1つに決まるまで「最初から決まっている山谷（手がかり）」を減らす。
 *
 * npx tsx tools/design.ts            手で並べた候補
 * npx tsx tools/design.ts random 4 6 無作為に、大きさ 4 の紙・端から端までの線を最大 6 本
 */
import type { MV, Paper } from '../src/engine/pattern.ts'
import { findAssignments } from '../src/engine/solve.ts'
import { modelOf, toRecord } from '../src/puzzles/load.ts'
import type { LineSpec, Puzzle } from '../src/puzzles/types.ts'

let seed = 20261105
function rand(n: number): number {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) % n
}
function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

/** 端から端までの線。t: v 縦、h 横、d 右上がり（y = x + c）、a 右下がり（y = -x + c） */
export function fullLine(n: number, t: 'v' | 'h' | 'd' | 'a', c: number): LineSpec {
  if (t === 'v') return [c, 0, c, n]
  if (t === 'h') return [0, c, n, c]
  if (t === 'd') return c >= 0 ? [0, c, n - c, n] : [-c, 0, n, n + c]
  return c <= n ? [0, c, c, 0] : [c - n, n, n, c - n]
}

export interface Designed {
  readonly puzzle: Omit<Puzzle, 'id'>
  readonly edges: number
  readonly foldable: number
  /** 手がかりがあっても、頂点を見るだけでは2通り以上残る（重なりまで考えないと決まらない） */
  readonly needsLayers: boolean
}

/** local: 頂点の判定だけで答えが1つに決まるまで手がかりを残す。global: 重なりまで考えて1つに決まればよい */
export function design(size: number, lines: LineSpec[], pick?: number, by: 'local' | 'global' = 'local'): Designed | null {
  const p = { size, lines, given: {}, answer: {} }
  const model = modelOf(p)
  const paper: Paper = model.full
  const all = findAssignments(paper, [], 5000)
  if (all.length === 0) return null
  const target = all[pick ?? rand(all.length)]
  // 手がかりを全部置いたところから、答えが1つのままなら外す
  const given: (MV | undefined)[] = [...target]
  for (const e of shuffle([...paper.edges.keys()])) {
    const keep = given[e]
    given[e] = undefined
    if (findAssignments(paper, given, 2, by === 'global').length !== 1) given[e] = keep
  }
  const needsLayers = findAssignments(paper, given, 2, false).length > 1
  return {
    puzzle: { size, lines, given: toRecord(model, given), answer: toRecord(model, target) },
    edges: paper.edges.length,
    foldable: all.length,
    needsLayers,
  }
}

function report(name: string, d: Designed | null): void {
  if (!d) {
    console.log(`${name}: 折れる山谷がない`)
    return
  }
  const clues = Object.keys(d.puzzle.given).length
  console.log(`${name}: 辺 ${d.edges}、折れる山谷 ${d.foldable}${d.foldable >= 5000 ? '+' : ''}、手がかり ${clues}、決める ${d.edges - clues}${d.needsLayers ? '、重なりまで考える' : ''}`)
  console.log(`  ${JSON.stringify(d.puzzle)}`)
}

const mode = process.argv[2]
if (mode === 'random') {
  const n = Number(process.argv[3] ?? 4)
  const maxLines = Number(process.argv[4] ?? 5)
  const tries = Number(process.argv[5] ?? 300)
  const by = (process.argv[6] ?? 'local') as 'local' | 'global'
  const seen = new Set<string>()
  for (let k = 0; k < tries; k++) {
    const count = 2 + rand(maxLines - 1)
    const lines: LineSpec[] = []
    for (let c = 0; c < count; c++) {
      const t = (['v', 'h', 'd', 'a'] as const)[rand(4)]
      const off = t === 'v' || t === 'h' ? 1 + rand(n - 1) : t === 'd' ? rand(2 * n - 1) - (n - 1) : 1 + rand(2 * n - 1)
      lines.push(fullLine(n, t, off))
    }
    const keyOf = JSON.stringify([...new Set(lines.map((l) => l.join(',')))].sort())
    if (seen.has(keyOf)) continue
    seen.add(keyOf)
    let d: Designed | null
    try {
      d = design(n, lines, undefined, by)
    } catch {
      continue
    }
    if (d && d.edges >= 4) report(`#${k}`, d)
  }
} else {
  const n4 = 4
  report('十字', design(n4, [fullLine(n4, 'v', 2), fullLine(n4, 'h', 2)]))
  report('ふくらし', design(n4, [fullLine(n4, 'd', 0), fullLine(n4, 'a', 4), fullLine(n4, 'h', 2)]))
  report('正方基本形', design(n4, [fullLine(n4, 'd', 0), fullLine(n4, 'a', 4), fullLine(n4, 'h', 2), fullLine(n4, 'v', 2)]))
  report('大・小・大', design(5, [fullLine(5, 'v', 2), fullLine(5, 'v', 3)]))
  report('段折り4本', design(6, [1, 2, 4, 5].map((c) => fullLine(6, 'v', c))))
}
