import type { EdgeState, Model } from '../engine/states.ts'
import { answerStates } from './load.ts'
import type { Puzzle } from './types.ts'

export interface Hint {
  readonly edge: number
  /** その線をどの状態にするか（山・谷・なし） */
  readonly target: EdgeState
  /** 答えと違う向きに決めてある線を直すヒントか */
  readonly fix: boolean
}

/**
 * 次の1手。答えは問題に持っているので、答えと違う線を1本選んで、どうするかを示す。
 * 1. 答えと違う向きに決めてある線（山・谷・使っている候補線）があれば、それを直す
 * 2. なければ、まだ答えになっていない線のうち、頂点で決めやすいもの
 *    （両端の頂点に残っている「答えでない線」が少ないもの）を選ぶ
 * 答えどおりになっていれば null。
 */
export function nextHint(m: Model, p: Puzzle, states: readonly EdgeState[]): Hint | null {
  const answer = answerStates(m, p)
  const wrong: number[] = []
  const open: number[] = []
  m.full.edges.forEach((_, i) => {
    const s = states[i]
    if (s === answer[i]) return
    if (s === 'M' || s === 'V') wrong.push(i)
    else open.push(i)
  })
  if (wrong.length) return { edge: wrong[0], target: answer[wrong[0]], fix: true }
  if (!open.length) return null

  // 頂点ごとに、まだ答えになっていない辺の数
  const pendingAt = new Map<string, number>()
  const ends = (i: number) => m.full.edges[i].ends.map((q) => `${q[0]},${q[1]}`)
  for (const i of open) for (const k of ends(i)) pendingAt.set(k, (pendingAt.get(k) ?? 0) + 1)
  // 紙の縁の頂点は、内側の頂点ほど手がかりにならないので後回し
  const onBorder = (k: string) => {
    const [x, y] = k.split(',').map(Number)
    const n = 2 * m.full.size
    return x === 0 || y === 0 || x === n || y === n
  }
  const score = (i: number) => Math.min(...ends(i).map((k) => (onBorder(k) ? 100 : 0) + pendingAt.get(k)!))
  let best = open[0]
  for (const i of open) if (score(i) < score(best)) best = i
  return { edge: best, target: answer[best], fix: false }
}
