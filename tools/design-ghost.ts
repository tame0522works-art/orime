/**
 * 線を足す問題の下調べ。折れる展開図から線を何本か隠して候補線にし、紛らわしい候補線（使わない線）も足す。
 * 候補線のどれを使い、どの山谷にするかが1つに決まるものだけを残し、決まった線の手がかりも減らす。
 *
 * npx tsx tools/design-ghost.ts 4 6 200   大きさ 4、線は最大 6 本、200 回試す
 */
import { findAssignments } from '../src/engine/solve.ts'
import { findStates, type EdgeState } from '../src/engine/states.ts'
import { answerStates, ghostOverlap, modelOf, toRecord } from '../src/puzzles/load.ts'
import type { LineSpec, Puzzle } from '../src/puzzles/types.ts'

let seed = Number(process.env.SEED ?? 20261106)
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
function fullLine(n: number): LineSpec {
  const t = rand(4)
  if (t === 0) {
    const c = 1 + rand(n - 1)
    return [c, 0, c, n]
  }
  if (t === 1) {
    const c = 1 + rand(n - 1)
    return [0, c, n, c]
  }
  if (t === 2) {
    const c = rand(2 * n - 1) - (n - 1)
    return c >= 0 ? [0, c, n - c, n] : [-c, 0, n, n + c]
  }
  const c = 1 + rand(2 * n - 1)
  return c <= n ? [0, c, c, 0] : [c - n, n, n, c - n]
}

const n = Number(process.argv[2] ?? 4)
const maxLines = Number(process.argv[3] ?? 6)
const tries = Number(process.argv[4] ?? 200)
const seen = new Set<string>()
for (let k = 0; k < tries; k++) {
  const count = 3 + rand(maxLines - 2)
  const lines = [...new Map(Array.from({ length: count }, () => fullLine(n)).map((l) => [l.join(','), l])).values()]
  const sig = JSON.stringify(lines.map((l) => l.join(',')).sort())
  if (seen.has(sig)) continue
  seen.add(sig)
  const base = modelOf({ size: n, lines }).full
  const sols = findAssignments(base, [], 200)
  if (sols.length === 0) continue
  const target = sols[rand(sols.length)]
  // 元の展開図の山谷を、辺の小三角形の辺ごとに
  const segMV = new Map<string, 'M' | 'V'>()
  base.edges.forEach((e, i) => e.segs.forEach((s) => segMV.set(s, target[i])))

  const hideCount = 1 + rand(Math.min(2, lines.length - 2))
  const order = shuffle([...lines.keys()])
  const hidden = order.slice(0, hideCount).map((i) => lines[i])
  const solid = lines.filter((l) => !hidden.includes(l))
  const decoys: LineSpec[] = []
  for (let d = 0, want = 1 + rand(3); d < 20 && decoys.length < want; d++) {
    const l = fullLine(n)
    const p = { lines: solid, ghosts: [...hidden, ...decoys, l] }
    if (lines.some((x) => x.join() === l.join()) || decoys.some((x) => x.join() === l.join()) || ghostOverlap(p)) continue
    decoys.push(l)
  }
  const ghosts = [...hidden, ...decoys]
  const shape = { size: n, lines: solid, ghosts }
  const m = modelOf(shape)
  // 元の線（決まった線・隠した線）の辺は元の山谷、使わない候補線は「なし」
  const answer: EdgeState[] = m.full.edges.map((e) => segMV.get(e.segs[0]) ?? 'N')
  const draft: Omit<Puzzle, 'id'> = { ...shape, given: {}, answer: toRecord(m, answer) }
  const ans = answerStates(m, draft)
  const given: EdgeState[] = m.full.edges.map((_, i) => (m.ghost[i] ? undefined : ans[i]))
  const ghostEdges = m.full.edges.map((_, i) => i).filter((i) => m.ghost[i])
  const unique = (g: EdgeState[], local: boolean) => {
    const open = m.full.edges.map((_, i) => i).filter((i) => g[i] === undefined)
    return findStates(m, g, open, 2, !local).length === 1
  }
  if (!unique(given, false)) continue
  // 決まった線の手がかりを、頂点の判定だけで1つに決まる範囲で減らす
  const local = unique(given, true)
  for (const i of shuffle(m.full.edges.map((_, j) => j).filter((j) => !m.ghost[j]))) {
    const keep = given[i]
    given[i] = undefined
    if (!unique(given, local)) given[i] = keep
  }
  const record = toRecord(m, given)
  const open = m.full.edges.length - Object.keys(record).length
  const used = ghostEdges.filter((i) => ans[i] !== 'N').length
  console.log(`#${k}: 辺 ${m.full.edges.length}、候補 ${ghostEdges.length}（足す ${used}）、決める ${open - ghostEdges.length}${local ? '' : '、重なりまで考える'}`)
  console.log(`  ${JSON.stringify({ ...shape, given: record, answer: draft.answer })}`)
}
