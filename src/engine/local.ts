import type { Paper, Assignment, MV, Vertex } from './pattern.ts'

/**
 * 頂点ごとの判定。紙全体が折れるかは fold.ts で調べる。ここは画面で頂点に印を付けるためと、
 * 山谷の割り当てを数えるときの枝刈りに使う。
 *
 * 紙の縁の頂点は、両端が開いた扇なので、1次元の折りと同じく「つぶし」と「端の折り返し」で調べる。
 */

export type VertexProblem = 'kawasaki' | 'maekawa' | 'crimp'

export interface VertexCheck {
  readonly vertex: Vertex
  /** 問題。山谷が未定の折り線があって、まだ決められないときは null */
  readonly problem: VertexProblem | null
  /** 山谷が未定の折り線がある */
  readonly pending: boolean
}

/** 頂点のまわりの角（45° 単位）。sectors[i] は rays[i] と rays[i+1] のあいだ */
export function sectors(v: Vertex): number[] {
  const n = v.rays.length
  return v.rays.map((r, i) => ((v.rays[(i + 1) % n].dir - r.dir + 8) % 8) || 8)
}

/** 川崎の定理: 角を1つおきに足すと 180°（= 4 単位） */
export function kawasaki(angles: readonly number[]): boolean {
  if (angles.length % 2 !== 0) return false
  let odd = 0
  for (let i = 0; i < angles.length; i += 2) odd += angles[i]
  return odd === 4
}

/** 前川の定理: 山と谷の本数の差が 2 */
export function maekawa(mv: readonly MV[]): boolean {
  let d = 0
  for (const x of mv) d += x === 'M' ? 1 : -1
  return Math.abs(d) === 2
}

/**
 * 1つの頂点が、この山谷で平らに折れるか（川崎の定理を満たす前提）。
 * 両隣以下の小さい角を挟む2本が山と谷なら、その2本をつぶして（crimp）角を1つにまとめる。
 * これを繰り返して2本だけ残り、その2本が同じ向きなら折れる。
 */
export function crimpable(angles: readonly number[], mv: readonly MV[]): boolean {
  const a = [...angles]
  const c = [...mv]
  while (c.length > 2) {
    const n = c.length
    let done = false
    for (let i = 0; i < n; i++) {
      const prev = (i - 1 + n) % n
      const next = (i + 1) % n
      if (a[i] > a[prev] || a[i] > a[next] || c[i] === c[next]) continue
      // 角 a[i] を挟む折り線 c[i] と c[i+1] をつぶす。前後の角と合わせて1つにする
      const merged = a[prev] - a[i] + a[next]
      if (next === 0) {
        // 末尾と先頭をまたぐ: c[i] と c[0] を消す
        a[prev] = merged
        a.splice(i, 1)
        a.splice(0, 1)
        c.splice(i, 1)
        c.splice(0, 1)
      } else {
        a[prev] = merged
        a.splice(i, 2)
        c.splice(i, 2)
      }
      done = true
      break
    }
    if (!done) return false
  }
  return c[0] === c[1]
}

/**
 * 両端が開いた並び（1次元の折り、紙の縁の頂点の扇）が折れるか。lengths は mv より1つ多い。
 * 端の区間が隣以下なら折り返して消す。両隣以下の区間を挟む2本が山と谷ならつぶす。
 * どちらもできなくなる前に区間が1つになれば折れる。
 */
export function foldable1d(lengths: readonly number[], mv: readonly MV[]): boolean {
  const a = [...lengths]
  const c = [...mv]
  while (c.length > 0) {
    const n = a.length
    if (a[0] <= a[1]) {
      a.splice(0, 1)
      c.splice(0, 1)
      continue
    }
    if (a[n - 1] <= a[n - 2]) {
      a.splice(n - 1, 1)
      c.splice(n - 2, 1)
      continue
    }
    let done = false
    for (let i = 1; i < n - 1; i++) {
      if (a[i] > a[i - 1] || a[i] > a[i + 1] || c[i - 1] === c[i]) continue
      a.splice(i - 1, 3, a[i - 1] - a[i] + a[i + 1])
      c.splice(i - 1, 2)
      done = true
      break
    }
    if (!done) return false
  }
  return true
}

/** 紙の縁の頂点で、縁から反時計回りに測った扇の区間（45° 単位） */
function borderSectors(paper: Paper, v: Vertex): number[] {
  const m = 2 * paper.size
  const [x, y] = v.p
  // 縁の向き（扇の始まり）と扇の広さ
  let start: number
  let span = 4
  if (y === 0 && x === 0) [start, span] = [0, 2]
  else if (y === 0 && x === m) [start, span] = [2, 2]
  else if (y === m && x === m) [start, span] = [4, 2]
  else if (y === m && x === 0) [start, span] = [6, 2]
  else if (y === 0) start = 0
  else if (x === m) start = 2
  else if (y === m) start = 4
  else start = 6
  const rel = v.rays.map((r) => (r.dir - start + 8) % 8).sort((p, q) => p - q)
  const out: number[] = []
  let prev = 0
  for (const r of rel) {
    out.push(r - prev)
    prev = r
  }
  out.push(span - prev)
  return out
}

/** 頂点の折り線の並び（縁の頂点では縁から反時計回り） */
function raysInOrder(paper: Paper, v: Vertex): Vertex['rays'] {
  if (!v.onBorder) return v.rays
  const m = 2 * paper.size
  const [x, y] = v.p
  const start = y === 0 ? (x === m ? 2 : 0) : x === m ? (y === m ? 4 : 2) : y === m ? (x === 0 ? 6 : 4) : 6
  return [...v.rays].sort((r, t) => ((r.dir - start + 8) % 8) - ((t.dir - start + 8) % 8))
}

export function checkVertex(paper: Paper, assignment: Assignment, v: Vertex): VertexCheck {
  const rays = raysInOrder(paper, v)
  const mv: MV[] = []
  let pending = false
  for (const r of rays) {
    const x = assignment[paper.segs.get(r.seg)!.edge]
    if (x === undefined) pending = true
    else mv.push(x)
  }
  if (v.onBorder) {
    if (pending) return { vertex: v, problem: null, pending: true }
    return { vertex: v, problem: foldable1d(borderSectors(paper, v), mv) ? null : 'crimp', pending: false }
  }
  const angles = sectors(v)
  if (!kawasaki(angles)) return { vertex: v, problem: 'kawasaki', pending: false }
  if (pending) return { vertex: v, problem: null, pending: true }
  if (!maekawa(mv)) return { vertex: v, problem: 'maekawa', pending: false }
  if (!crimpable(angles, mv)) return { vertex: v, problem: 'crimp', pending: false }
  return { vertex: v, problem: null, pending: false }
}

/** 折り線が集まる頂点すべて（紙の縁も含む） */
export function creaseVertices(paper: Paper): Vertex[] {
  return [...paper.vertices.values()]
}

export function checkVertices(paper: Paper, assignment: Assignment): VertexCheck[] {
  return creaseVertices(paper).map((v) => checkVertex(paper, assignment, v))
}
