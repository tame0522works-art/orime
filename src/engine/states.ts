import { fold, type FoldResult } from './fold.ts'
import { checkVertex, type VertexProblem } from './local.ts'
import { buildPaperFromSegs, type Assignment, type MV, type Paper, type Vertex } from './pattern.ts'

/**
 * 候補線（足してもよい折り線）を含めた盤面の状態。
 *
 * 紙は、決まった線と候補線をすべて引いた形で作る（full）。山谷を決める単位はその辺。
 * 決まった線の辺は 山・谷・未定（undefined）、候補線の辺は なし（'N'）・山・谷 のどれか。
 * 「なし」の辺を除いた線だけで紙を作り直したもの（active）を fold で確かめる。
 */
export type EdgeState = MV | 'N' | undefined

export interface Model {
  readonly full: Paper
  /** 辺ごとに、候補線か */
  readonly ghost: readonly boolean[]
}

export type Problem = VertexProblem | 'switch'

export interface Mark {
  readonly vertex: Vertex
  readonly problem: Problem
}

export interface Evaluation {
  /** 決まった線のうち、山谷が未定の辺の数 */
  readonly pending: number
  readonly marks: Mark[]
  /** 未定がなく、頂点の印もないときだけ作る */
  readonly result: FoldResult | null
  readonly active: Paper | null
}

/** 頂点のうち、使われている（なしでない）折り線だけを残したもの */
function activeVertex(full: Paper, states: readonly EdgeState[], v: Vertex): Vertex {
  return { ...v, rays: v.rays.filter((r) => states[full.segs.get(r.seg)!.edge] !== 'N') }
}

/** 頂点を1つ調べる。折り線がなければ null、未定があれば 'pending' */
export function checkFullVertex(full: Paper, states: readonly EdgeState[], v: Vertex): Problem | 'pending' | null {
  const a = activeVertex(full, states, v)
  if (a.rays.length === 0) return null
  const assignment = states as Assignment
  const c = checkVertex(full, assignment, a)
  if (c.problem) {
    // まっすぐ通り抜ける点で山谷が入れ替わるのは、前川の定理より「線の途中で入れ替わる」と言うほうが分かりやすい
    const straight = !a.onBorder && a.rays.length === 2 && a.rays[1].dir - a.rays[0].dir === 4
    return straight && c.problem === 'maekawa' ? 'switch' : c.problem
  }
  return c.pending ? 'pending' : null
}

export function activePaper(m: Model, states: readonly EdgeState[]): { paper: Paper; assignment: MV[] } {
  const segs = new Set<string>()
  m.full.edges.forEach((e, i) => {
    const s = states[i]
    if (s === 'M' || s === 'V') for (const k of e.segs) segs.add(k)
  })
  const paper = buildPaperFromSegs(m.full.size, segs)
  const assignment = paper.edges.map((e) => states[m.full.segs.get(e.segs[0])!.edge] as MV)
  return { paper, assignment }
}

export function evaluate(m: Model, states: readonly EdgeState[]): Evaluation {
  let pending = 0
  m.full.edges.forEach((_, i) => {
    if (!m.ghost[i] && states[i] === undefined) pending++
  })
  const marks: Mark[] = []
  for (const v of m.full.vertices.values()) {
    const r = checkFullVertex(m.full, states, v)
    if (r && r !== 'pending') marks.push({ vertex: v, problem: r })
  }
  if (pending > 0 || marks.length > 0) return { pending, marks, result: null, active: null }
  const { paper, assignment } = activePaper(m, states)
  return { pending, marks, result: fold(paper, assignment), active: paper }
}

/**
 * 決まっていない辺を埋めて、平らに折れる状態を探す。候補線の辺は「なし」も選べる。
 * 頂点の辺がすべて決まった時点で頂点を調べて枝を刈り、全部決まったら fold で確かめる。
 */
export function findStates(m: Model, given: readonly EdgeState[], open: readonly number[], limit: number, global = true): EdgeState[][] {
  const { full } = m
  const vertices = [...full.vertices.values()]
  const edgeVertices: Vertex[][] = full.edges.map(() => [])
  const remaining = new Map<Vertex, number>()
  const isOpen = new Set(open)
  for (const v of vertices) {
    const edges = new Set(v.rays.map((r) => full.segs.get(r.seg)!.edge))
    remaining.set(v, [...edges].filter((e) => isOpen.has(e)).length)
    for (const e of edges) edgeVertices[e].push(v)
  }
  const cur: EdgeState[] = [...given]
  cur.length = full.edges.length
  for (const v of vertices) {
    if (remaining.get(v) === 0) {
      const r = checkFullVertex(full, cur, v)
      if (r && r !== 'pending') return []
    }
  }
  const out: EdgeState[][] = []
  const search = (k: number): void => {
    if (out.length >= limit) return
    if (k === open.length) {
      if (!global) {
        out.push([...cur])
        return
      }
      const { paper, assignment } = activePaper(m, cur)
      if (fold(paper, assignment).ok) out.push([...cur])
      return
    }
    const e = open[k]
    const options: EdgeState[] = m.ghost[e] ? ['N', 'M', 'V'] : ['M', 'V']
    for (const x of options) {
      cur[e] = x
      let ok = true
      for (const v of edgeVertices[e]) {
        const r = remaining.get(v)! - 1
        remaining.set(v, r)
        if (r === 0 && ok) {
          const c = checkFullVertex(full, cur, v)
          if (c && c !== 'pending') ok = false
        }
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
