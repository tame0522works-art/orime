import { apply, compose, flipped, IDENTITY, key, reflection, sameIso, type Iso, type Pt } from './geom.ts'
import type { Assignment, Paper, Seg } from './pattern.ts'

/**
 * 紙全体が平らに折れるかを調べ、折れるなら面の重なり順を1つ返す。
 *
 * 1. 面: 折り線で区切られた小三角形のまとまり
 * 2. 面の写し方: 折り線をまたぐたびに反転する。食い違えば、形の上で折れない
 * 3. 重なり順: 重なる面の組ごとに「どちらが上か」を変数にし、次の制約を満たす割り当てを探す
 *    - 折り線: 山谷から、隣り合う2面の上下が決まる
 *    - taco-tortilla: 折り線の位置を内側に含む面は、その折り線の両側の面のあいだに入れない
 *    - taco-taco: 同じ位置に重なった2本の折り線は、交差して挟み合えない
 *    - 推移律: 同じ位置に重なる3面の上下が輪にならない
 *
 * 紙全体が折れるかの判定は NP 困難（Bern & Hayes 1996）なので、ここは小さい盤面向けの探索。
 */

export interface Face {
  readonly index: number
  readonly tris: number[]
  readonly iso: Iso
  readonly flipped: boolean
}

export interface Faces {
  readonly faces: Face[]
  /** 小三角形ごとの面の番号 */
  readonly triFace: Int32Array
}

export type FoldResult =
  | { readonly ok: true; readonly faces: Faces; readonly stacks: Stack[] }
  | { readonly ok: false; readonly reason: 'geometry' | 'layers'; readonly faces?: Faces }

/** 折ったあとの1か所（小三角形1つ分）に重なる面を、上から順に */
export interface Stack {
  readonly pos: Pt
  readonly faces: number[]
}

/** 面と、その写し方を求める。折り線をまたいだ写し方が食い違えば null */
export function buildFaces(paper: Paper): Faces | null {
  const n = paper.tris.length
  const isos: (Iso | undefined)[] = Array.from({ length: n })
  const triFace = new Int32Array(n).fill(-1)
  const neighbors: { tri: number; seg: Seg }[][] = paper.tris.map(() => [])
  for (const s of paper.segs.values()) {
    if (s.tris[1] === -1) continue
    neighbors[s.tris[0]].push({ tri: s.tris[1], seg: s })
    neighbors[s.tris[1]].push({ tri: s.tris[0], seg: s })
  }

  // 面: 折り線でない辺でつながる小三角形
  const faces: Face[] = []
  for (let t = 0; t < n; t++) {
    if (triFace[t] !== -1) continue
    const index = faces.length
    const tris = [t]
    triFace[t] = index
    for (let k = 0; k < tris.length; k++) {
      for (const { tri, seg } of neighbors[tris[k]]) {
        if (seg.edge !== -1 || triFace[tri] !== -1) continue
        triFace[tri] = index
        tris.push(tri)
      }
    }
    faces.push({ index, tris, iso: IDENTITY, flipped: false })
  }

  // 写し方: 最初の小三角形（左下）をそのままにして広げる
  isos[0] = IDENTITY
  const queue = [0]
  for (let k = 0; k < queue.length; k++) {
    const t = queue[k]
    const s = isos[t]!
    for (const { tri, seg } of neighbors[t]) {
      const next = seg.edge === -1 ? s : compose(s, reflection(seg.line))
      const known = isos[tri]
      if (known) {
        if (!sameIso(known, next)) return null
        continue
      }
      isos[tri] = next
      queue.push(tri)
    }
  }

  return {
    faces: faces.map((f) => ({ ...f, iso: isos[f.tris[0]]!, flipped: flipped(isos[f.tris[0]]!) })),
    triFace,
  }
}

/** 面 f の小三角形 t（4 倍座標の代表点）が、折ったあと来る位置 */
function placed(paper: Paper, faces: Faces, t: number): Pt {
  return apply(faces.faces[faces.triFace[t]].iso, paper.tris[t].rep, 4)
}

// ---- 重なり順の探索 ----

/** 変数（重なる面の組 i < j）。値 1 は「i が上」 */
interface Lit {
  readonly v: number
  /** true なら「i が上」をそのまま、false なら反転 */
  readonly pos: boolean
}

interface Constraint {
  readonly lits: Lit[]
  /** 許される真偽の組を、lits の順の 2 進でビットに立てたもの */
  readonly allowed: number
}

class Layers {
  readonly pairIndex = new Map<number, number>()
  readonly pairs: [number, number][] = []
  readonly constraints: Constraint[] = []
  readonly fixed: { v: number; value: boolean }[] = []

  readonly faceCount: number
  constructor(faceCount: number) {
    this.faceCount = faceCount
  }

  private varOf(i: number, j: number): number {
    const a = Math.min(i, j)
    const b = Math.max(i, j)
    const k = a * this.faceCount + b
    let v = this.pairIndex.get(k)
    if (v === undefined) {
      v = this.pairs.length
      this.pairs.push([a, b])
      this.pairIndex.set(k, v)
    }
    return v
  }

  /** 「i が j の上」 */
  above(i: number, j: number): Lit {
    return { v: this.varOf(i, j), pos: i < j }
  }

  fix(l: Lit, value: boolean): void {
    this.fixed.push({ v: l.v, value: l.pos ? value : !value })
  }

  add(lits: Lit[], pred: (vals: boolean[]) => boolean): void {
    let allowed = 0
    for (let m = 0; m < 1 << lits.length; m++) {
      const vals = lits.map((_, k) => ((m >> k) & 1) === 1)
      if (pred(vals)) allowed |= 1 << m
    }
    this.constraints.push({ lits, allowed })
  }
}

/** 制約の伝播つきの深さ優先探索。満たす割り当てがなければ null */
function solveLayers(L: Layers, nodeLimit: number): Int8Array | null {
  const n = L.pairs.length
  const value = new Int8Array(n).fill(-1)
  const watch: number[][] = Array.from({ length: n }, () => [])
  L.constraints.forEach((c, ci) => {
    for (const l of c.lits) watch[l.v].push(ci)
  })
  const trail: number[] = []

  const litValue = (l: Lit): number => {
    const x = value[l.v]
    if (x === -1) return -1
    return (x === 1) === l.pos ? 1 : 0
  }
  const assign = (v: number, x: number, queue: number[]): boolean => {
    if (value[v] !== -1) return value[v] === x
    value[v] = x
    trail.push(v)
    queue.push(v)
    return true
  }
  const propagate = (queue: number[]): boolean => {
    for (let k = 0; k < queue.length; k++) {
      for (const ci of watch[queue[k]]) {
        const c = L.constraints[ci]
        const cur = c.lits.map(litValue)
        let canTrue = 0
        let canFalse = 0
        let any = false
        for (let m = 0; m < 1 << c.lits.length; m++) {
          if (((c.allowed >> m) & 1) === 0) continue
          let match = true
          for (let t = 0; t < cur.length; t++) {
            const bit = (m >> t) & 1
            if (cur[t] !== -1 && cur[t] !== bit) {
              match = false
              break
            }
          }
          if (!match) continue
          any = true
          canTrue |= m
          canFalse |= ~m
        }
        if (!any) return false
        for (let t = 0; t < cur.length; t++) {
          if (cur[t] !== -1) continue
          const mayBeTrue = ((canTrue >> t) & 1) === 1
          const mayBeFalse = ((canFalse >> t) & 1) === 1
          if (mayBeTrue && mayBeFalse) continue
          const l = c.lits[t]
          const litX = mayBeTrue ? 1 : 0
          if (!assign(l.v, (litX === 1) === l.pos ? 1 : 0, queue)) return false
        }
      }
    }
    return true
  }
  const undo = (mark: number) => {
    while (trail.length > mark) value[trail.pop()!] = -1
  }

  const q0: number[] = []
  for (const f of L.fixed) {
    if (!assign(f.v, f.value ? 1 : 0, q0)) return null
  }
  // 制約の少ない変数も一度は確かめる
  for (let v = 0; v < n; v++) q0.push(v)
  if (!propagate(q0)) return null

  let nodes = 0
  const search = (from: number): boolean => {
    let v = from
    while (v < n && value[v] !== -1) v++
    if (v === n) return true
    if (++nodes > nodeLimit) throw new Error('重なり順の探索が上限を超えた')
    for (const x of [1, 0]) {
      const mark = trail.length
      const q: number[] = []
      assign(v, x, q)
      if (propagate(q) && search(v + 1)) return true
      undo(mark)
    }
    return false
  }
  return search(0) ? value : null
}

export interface FoldOptions {
  readonly nodeLimit?: number
}

/** 山谷がすべて決まった展開図が平らに折れるか */
export function fold(paper: Paper, assignment: Assignment, options: FoldOptions = {}): FoldResult {
  const faces = buildFaces(paper)
  if (!faces) return { ok: false, reason: 'geometry' }
  const F = faces.faces
  const L = new Layers(F.length)

  // 折ったあとの位置ごとに重なる面
  const at = new Map<string, number[]>()
  const posOf = new Map<string, Pt>()
  for (let t = 0; t < paper.tris.length; t++) {
    const p = placed(paper, faces, t)
    const k = key(p)
    let list = at.get(k)
    if (!list) {
      list = []
      at.set(k, list)
      posOf.set(k, p)
    }
    list.push(faces.triFace[t])
  }

  // 推移律（同じ位置に重なる3面）
  const seenTriple = new Set<string>()
  for (const list of at.values()) {
    const s = [...new Set(list)].sort((x, y) => x - y)
    for (let x = 0; x < s.length; x++) {
      for (let y = x + 1; y < s.length; y++) {
        L.above(s[x], s[y])
        for (let z = y + 1; z < s.length; z++) {
          const k = `${s[x]},${s[y]},${s[z]}`
          if (seenTriple.has(k)) continue
          seenTriple.add(k)
          L.add([L.above(s[x], s[y]), L.above(s[y], s[z]), L.above(s[x], s[z])], ([a, b, c]) => !((a && b && !c) || (!a && !b && c)))
        }
      }
    }
  }

  // 折り線ごと
  interface Taco {
    readonly f: number
    readonly g: number
    /** 折ったあと、2面が乗る側の位置 */
    readonly side: string
  }
  const tacos = new Map<string, Taco[]>()
  for (const s of paper.segs.values()) {
    if (s.edge === -1) continue
    const mv = assignment[s.edge]
    if (mv === undefined) throw new Error('山谷が未定の折り線がある')
    const [t0, t1] = s.tris
    const f = faces.triFace[t0]
    const g = faces.triFace[t1]
    // 隣り合う2面の上下: 表を向いた面に対して、谷折りなら相手が上、山折りなら下
    const up = F[f].flipped ? g : f
    const other = up === f ? g : f
    L.fix(L.above(other, up), mv === 'V')

    const side = key(placed(paper, faces, t0))
    const across = key(apply(F[f].iso, paper.tris[t1].rep, 4))
    // taco-tortilla
    const here = new Set(at.get(side))
    for (const h of new Set(at.get(across) ?? [])) {
      if (h === f || h === g || !here.has(h)) continue
      L.add([L.above(f, h), L.above(g, h)], ([a, b]) => a === b)
    }
    const folded = key(apply(F[f].iso, s.mid, 4))
    let list = tacos.get(folded)
    if (!list) {
      list = []
      tacos.set(folded, list)
    }
    list.push({ f, g, side })
  }

  // taco-taco
  for (const list of tacos.values()) {
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const A = list[x]
        const B = list[y]
        const lits = [L.above(A.f, B.f), L.above(A.g, B.f), L.above(A.f, B.g), L.above(A.g, B.g)]
        if (A.side === B.side) {
          // 同じ側: 入れ子か、重ならないか。B の片方だけが A のあいだに入るのは交差
          L.add(lits, ([a, b, c, d]) => (a !== b) === (c !== d))
        } else {
          // 反対側: どちらかがまるごと上
          L.add(lits, ([a, b, c, d]) => a === b && b === c && c === d)
        }
      }
    }
  }

  const value = solveLayers(L, options.nodeLimit ?? 200_000)
  if (!value) return { ok: false, reason: 'layers', faces }

  const isAbove = (i: number, j: number): boolean => {
    const v = L.pairIndex.get(Math.min(i, j) * F.length + Math.max(i, j))!
    return (value[v] === 1) === i < j
  }
  const stacks: Stack[] = []
  for (const [k, list] of at) {
    const s = [...new Set(list)].sort((i, j) => (i === j ? 0 : isAbove(i, j) ? -1 : 1))
    stacks.push({ pos: posOf.get(k)!, faces: s })
  }
  return { ok: true, faces, stacks }
}
