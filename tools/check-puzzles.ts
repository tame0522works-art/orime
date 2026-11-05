/**
 * 全問を確かめる。npm run check:puzzles
 * - 展開図が作れる、手がかりと答えの辺がすべて実在する
 * - 答えが平らに折れて、手がかりから見て唯一の答えである
 * - 最初の盤面に未定の線がある
 * - 頂点を見るだけで答えが決まるか（決まらない問題は「重なりまで考える」と表示する）
 */
import { fold } from '../src/engine/fold.ts'
import { findAssignments } from '../src/engine/solve.ts'
import { PUZZLES } from '../src/puzzles/index.ts'
import { paperOf, toAssignment } from '../src/puzzles/load.ts'

let failed = 0
const ids = new Set<string>()
PUZZLES.forEach((p, i) => {
  const errors: string[] = []
  if (ids.has(p.id)) errors.push('id が重複')
  ids.add(p.id)
  const paper = paperOf(p)
  const edgeIds = new Set(paper.edges.map((e) => e.id))
  for (const id of Object.keys(p.given)) if (!edgeIds.has(id)) errors.push(`手がかりの辺がない: ${id}`)
  for (const id of Object.keys(p.answer)) if (!edgeIds.has(id)) errors.push(`答えの辺がない: ${id}`)
  const answer = toAssignment(paper, p.answer)
  if (answer.some((x) => x === undefined)) errors.push('答えに山谷のない辺がある')
  for (const [id, mv] of Object.entries(p.given)) if (p.answer[id] !== mv) errors.push(`手がかりが答えと違う: ${id}`)
  const open = paper.edges.length - Object.keys(p.given).length
  if (open === 0) errors.push('未定の線がない')
  const start = performance.now()
  if (!fold(paper, answer).ok) errors.push('答えが折れない')
  const given = toAssignment(paper, p.given)
  const found = findAssignments(paper, given, 2)
  if (found.length !== 1) errors.push(`答えが ${found.length} 通り`)
  else if (found[0].some((x, k) => x !== answer[k])) errors.push('見つかった答えが answer と違う')
  const localOnly = findAssignments(paper, given, 2, false).length === 1
  const ms = performance.now() - start
  if (errors.length) failed++
  console.log(
    `${errors.length ? 'NG' : 'OK'}  ${i + 1}. ${p.id}（${p.size}×${p.size}、辺 ${paper.edges.length}、決める ${open}${localOnly ? '' : '、重なりまで考える'}、${ms.toFixed(0)}ms）${errors.length ? '\n    ' + errors.join('\n    ') : ''}`,
  )
})

if (failed) {
  console.error(`\n${failed} 問に問題がある`)
  process.exit(1)
}
console.log(`\n${PUZZLES.length} 問すべて OK`)
