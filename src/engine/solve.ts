import { fold } from './fold.ts'
import { checkVertex, creaseVertices } from './local.ts'
import type { Assignment, MV, Paper, Vertex } from './pattern.ts'

/**
 * 未定の山谷を埋めて、紙全体が折れる割り当てを探す（問題の答えが1つに決まるかを確かめるため）。
 * 頂点の折り線がすべて決まった時点で頂点ごとの判定をして枝を刈り、全部決まったら fold で確かめる。
 * global を false にすると fold を省き、頂点ごとの判定だけで通る割り当てを返す
 * （頂点を見るだけでは答えが決まらない問題を見分けるため）。
 */
export function findAssignments(paper: Paper, given: Assignment, limit: number, global = true): MV[][] {
  const E = paper.edges.length
  const vertices = creaseVertices(paper)
  const edgeVertices: Vertex[][] = paper.edges.map(() => [])
  const remaining = new Map<Vertex, number>()
  for (const v of vertices) {
    const edges = new Set(v.rays.map((r) => paper.segs.get(r.seg)!.edge))
    remaining.set(v, [...edges].filter((e) => given[e] === undefined).length)
    for (const e of edges) edgeVertices[e].push(v)
  }

  const cur: (MV | undefined)[] = [...given]
  cur.length = Math.max(cur.length, E)
  for (const v of vertices) {
    if (remaining.get(v) === 0 && checkVertex(paper, cur, v).problem) return []
  }
  const open = paper.edges.map((e) => e.index).filter((e) => cur[e] === undefined)
  const out: MV[][] = []

  const search = (k: number): void => {
    if (out.length >= limit) return
    if (k === open.length) {
      if (!global || fold(paper, cur).ok) out.push([...cur] as MV[])
      return
    }
    const e = open[k]
    for (const x of ['M', 'V'] as const) {
      cur[e] = x
      let ok = true
      for (const v of edgeVertices[e]) {
        const r = remaining.get(v)! - 1
        remaining.set(v, r)
        if (r === 0 && checkVertex(paper, cur, v).problem) ok = false
      }
      if (ok) search(k + 1)
      for (const v of edgeVertices[e]) remaining.set(v, remaining.get(v)! + 1)
      cur[e] = undefined
      if (out.length >= limit) return
    }
  }
  search(0)
  return out
}
