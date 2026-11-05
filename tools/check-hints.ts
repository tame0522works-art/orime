/**
 * ヒントをたどるだけで解けるかを確かめる。npm run check:hints
 * 全問について、最初の盤面と、線を無作為に決めた途中の盤面（各200通り）から、
 * ヒントの線を目当ての状態にすることを繰り返し、線の数以内の手で折れる状態に着くこと。
 */
import { evaluate, type EdgeState } from '../src/engine/states.ts'
import { nextHint } from '../src/puzzles/hint.ts'
import { PUZZLES } from '../src/puzzles/index.ts'
import { initialStates, modelOf } from '../src/puzzles/load.ts'

let seed = 20261105
function rand(n: number): number {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) % n
}

let failed = 0
let boards = 0
PUZZLES.forEach((p, idx) => {
  const m = modelOf(p)
  const start = initialStates(m, p)
  const free = m.full.edges.map((e, i) => i).filter((i) => p.given[m.full.edges[i].id] === undefined)
  const errors: string[] = []
  for (let trial = 0; trial <= 200; trial++) {
    const s: EdgeState[] = [...start]
    if (trial > 0) {
      for (const i of free) {
        const options: EdgeState[] = m.ghost[i] ? ['N', 'M', 'V'] : [undefined, 'M', 'V']
        s[i] = options[rand(3)]
      }
    }
    boards++
    let steps = 0
    for (;;) {
      const h = nextHint(m, p, s)
      if (!h) break
      if (p.given[m.full.edges[h.edge].id] !== undefined) {
        errors.push(`手がかりの線を指した（${trial}）`)
        break
      }
      if (s[h.edge] === h.target) {
        errors.push(`すでに目当ての状態の線を指した（${trial}）`)
        break
      }
      s[h.edge] = h.target
      if (++steps > free.length) {
        errors.push(`線の数（${free.length}）を超えても終わらない（${trial}）`)
        break
      }
    }
    if (!evaluate(m, s).result?.ok) errors.push(`ヒントが尽きても折れない（${trial}）`)
    if (errors.length) break
  }
  if (errors.length) failed++
  console.log(`${errors.length ? 'NG' : 'OK'}  ${idx + 1}. ${p.id}${errors.length ? '\n    ' + errors.join('\n    ') : ''}`)
})

if (failed) {
  console.error(`\n${failed} 問に問題がある`)
  process.exit(1)
}
console.log(`\n${PUZZLES.length} 問 × 201 盤面（計 ${boards}）すべて OK`)
