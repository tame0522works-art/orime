/**
 * 全問を確かめる。npm run check:puzzles
 * - 手がかりと答えの辺がすべて実在し、候補線が決まった線と重ならない
 * - 答えが平らに折れて、手がかりから見て唯一の答えである
 * - 最初の盤面のままでは折れない（決める線か、足す線がある）
 * - 頂点を見るだけで答えが決まるか（決まらない問題は「重なりまで考える」）
 */
import { fold } from '../src/engine/fold.ts'
import { activePaper, findStates } from '../src/engine/states.ts'
import { PUZZLES } from '../src/puzzles/index.ts'
import { answerStates, ghostOverlap, initialStates, modelOf } from '../src/puzzles/load.ts'

let failed = 0
const ids = new Set<string>()
PUZZLES.forEach((p, i) => {
  const errors: string[] = []
  if (ids.has(p.id)) errors.push('id が重複')
  ids.add(p.id)
  if (ghostOverlap(p)) errors.push('候補線が決まった線と重なっている')
  const m = modelOf(p)
  const edgeIds = new Set(m.full.edges.map((e) => e.id))
  for (const id of Object.keys(p.given)) if (!edgeIds.has(id)) errors.push(`手がかりの辺がない: ${id}`)
  for (const id of Object.keys(p.answer)) if (!edgeIds.has(id)) errors.push(`答えの辺がない: ${id}`)
  for (const [id, mv] of Object.entries(p.given)) if (p.answer[id] !== mv) errors.push(`手がかりが答えと違う: ${id}`)
  m.full.edges.forEach((e, k) => {
    if (!m.ghost[k] && !p.answer[e.id]) errors.push(`決まった線の答えがない: ${e.id}`)
    if (m.ghost[k] && p.given[e.id]) errors.push(`候補線に手がかりがある: ${e.id}`)
  })
  const start = performance.now()
  const answer = answerStates(m, p)
  const { paper, assignment } = activePaper(m, answer)
  if (!fold(paper, assignment).ok) errors.push('答えが折れない')
  const given = initialStates(m, p)
  // 候補線は「なし」で始まるが、遊ぶ人が変えられるので未定として探す
  const open = m.full.edges.map((_, k) => k).filter((k) => m.ghost[k] || given[k] === undefined)
  for (const k of open) given[k] = undefined
  if (open.length === 0) errors.push('決める線がない')
  const found = findStates(m, given, open, 2)
  if (found.length !== 1) errors.push(`答えが ${found.length} 通り`)
  else if (found[0].some((x, k) => x !== answer[k])) errors.push('見つかった答えが answer と違う')
  const localOnly = findStates(m, given, open, 2, false).length === 1
  const ghosts = m.ghost.filter(Boolean).length
  const used = m.full.edges.filter((e, k) => m.ghost[k] && p.answer[e.id]).length
  const ms = performance.now() - start
  if (errors.length) failed++
  const kind = ghosts ? `候補 ${ghosts}・足す ${used}` : `決める ${open.length}`
  console.log(
    `${errors.length ? 'NG' : 'OK'}  ${i + 1}. ${p.id}（${p.size}×${p.size}、辺 ${m.full.edges.length}、${kind}${localOnly ? '' : '、重なりまで考える'}、${ms.toFixed(0)}ms）${errors.length ? '\n    ' + errors.join('\n    ') : ''}`,
  )
})

if (failed) {
  console.error(`\n${failed} 問に問題がある`)
  process.exit(1)
}
console.log(`\n${PUZZLES.length} 問すべて OK`)
