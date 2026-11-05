import { dirIndex, key, lineOf, segMid, triRep, triSides, type Line, type Pt, type TriRep } from './geom.ts'

/** 折り線（元の単位の格子点 a から b まで） */
export interface Crease {
  readonly a: Pt
  readonly b: Pt
}

export type MV = 'M' | 'V'

export interface Tri {
  readonly index: number
  readonly rep: TriRep
}

/** 小三角形の辺（これ以上分けない線分） */
export interface Seg {
  readonly key: string
  /** 端（2 倍座標） */
  readonly p: Pt
  readonly q: Pt
  /** 中点（4 倍座標） */
  readonly mid: Pt
  readonly line: Line
  /** 両側の小三角形。紙の縁なら片方は -1 */
  readonly tris: readonly [number, number]
  /** 折り線なら、それを含む辺（Edge）の番号。折り線でなければ -1 */
  edge: number
}

export interface Ray {
  readonly dir: number
  readonly seg: string
}

export interface Vertex {
  readonly p: Pt
  readonly onBorder: boolean
  readonly rays: Ray[]
}

/**
 * 山谷を1つ決める単位。まっすぐ通り抜けるだけの点では切らずに、折り線をつなげたもの。
 * 交わる点・曲がる点・紙の縁で切れる。
 */
export interface Edge {
  readonly index: number
  readonly id: string
  readonly segs: string[]
  /** 端（2 倍座標） */
  readonly ends: readonly [Pt, Pt]
}

export interface Paper {
  readonly size: number
  readonly tris: Tri[]
  readonly triIndex: Map<string, number>
  readonly segs: Map<string, Seg>
  readonly vertices: Map<string, Vertex>
  readonly edges: Edge[]
}

export class PatternError extends Error {}

/** 折り線を小三角形の辺に分ける。端は 2 倍座標 */
function splitCrease(size: number, c: Crease): [Pt, Pt][] {
  const [x1, y1] = c.a
  const [x2, y2] = c.b
  for (const v of [x1, y1, x2, y2]) {
    if (!Number.isInteger(v) || v < 0 || v > size) throw new PatternError(`紙の外か格子点でない: ${key(c.a)} → ${key(c.b)}`)
  }
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) throw new PatternError(`長さがない: ${key(c.a)}`)
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) throw new PatternError(`0°・45°・90° 以外: ${key(c.a)} → ${key(c.b)}`)
  if ((dx === 0 && (x1 === 0 || x1 === size)) || (dy === 0 && (y1 === 0 || y1 === size))) {
    throw new PatternError(`紙の縁の上: ${key(c.a)} → ${key(c.b)}`)
  }
  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  const out: [Pt, Pt][] = []
  for (let k = 0; k < steps; k++) {
    const from: Pt = [2 * (x1 + k * sx), 2 * (y1 + k * sy)]
    const to: Pt = [from[0] + 2 * sx, from[1] + 2 * sy]
    if (sx !== 0 && sy !== 0) {
      const center: Pt = [from[0] + sx, from[1] + sy]
      out.push([from, center], [center, to])
    } else {
      out.push([from, to])
    }
  }
  return out
}

export function buildPaper(size: number, creases: readonly Crease[]): Paper {
  const creaseSegs = new Set<string>()
  for (const c of creases) {
    for (const [a, b] of splitCrease(size, c)) creaseSegs.add(key(segMid(a, b)))
  }
  return buildPaperFromSegs(size, creaseSegs)
}

/** 折り線を小三角形の辺の key（中点の 4 倍座標）の集まりで渡す。候補線のうち使うものだけで紙を作り直すときに使う */
export function buildPaperFromSegs(size: number, creaseSegs: ReadonlySet<string>): Paper {
  const tris: Tri[] = []
  const triIndex = new Map<string, number>()
  const sides = new Map<string, { p: Pt; q: Pt; tris: number[] }>()
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      for (let q = 0; q < 4; q++) {
        const rep = triRep(i, j, q)
        const index = tris.length
        tris.push({ index, rep })
        triIndex.set(key(rep), index)
        for (const [a, b] of triSides(i, j, q)) {
          const k = key(segMid(a, b))
          const s = sides.get(k)
          if (s) s.tris.push(index)
          else sides.set(k, { p: a, q: b, tris: [index] })
        }
      }
    }
  }

  const segs = new Map<string, Seg>()
  for (const [k, s] of sides) {
    segs.set(k, { key: k, p: s.p, q: s.q, mid: segMid(s.p, s.q), line: lineOf(s.p, s.q), tris: [s.tris[0], s.tris[1] ?? -1], edge: -1 })
  }

  const vertices = new Map<string, Vertex>()
  const vertexAt = (p: Pt): Vertex => {
    const k = key(p)
    let v = vertices.get(k)
    if (!v) {
      const onBorder = p[0] === 0 || p[1] === 0 || p[0] === 2 * size || p[1] === 2 * size
      v = { p, onBorder, rays: [] }
      vertices.set(k, v)
    }
    return v
  }
  for (const k of creaseSegs) {
    const s = segs.get(k)!
    vertexAt(s.p).rays.push({ dir: dirIndex(s.q[0] - s.p[0], s.q[1] - s.p[1]), seg: k })
    vertexAt(s.q).rays.push({ dir: dirIndex(s.p[0] - s.q[0], s.p[1] - s.q[1]), seg: k })
  }
  for (const v of vertices.values()) v.rays.sort((r, t) => r.dir - t.dir)

  const edges: Edge[] = []
  const otherEnd = (s: Seg, from: Pt): Pt => (key(s.p) === key(from) ? s.q : s.p)
  const walk = (start: Vertex, ray: Ray): { segs: string[]; end: Pt } => {
    const chain = [ray.seg]
    let at = otherEnd(segs.get(ray.seg)!, start.p)
    let prev = ray.seg
    for (;;) {
      const v = vertices.get(key(at))!
      if (!isPassThrough(v)) return { segs: chain, end: at }
      const next = v.rays[0].seg === prev ? v.rays[1].seg : v.rays[0].seg
      chain.push(next)
      prev = next
      at = otherEnd(segs.get(next)!, at)
    }
  }
  const sortedVertices = [...vertices.values()].sort((u, w) => u.p[1] - w.p[1] || u.p[0] - w.p[0])
  for (const v of sortedVertices) {
    if (isPassThrough(v)) continue
    for (const ray of v.rays) {
      if (segs.get(ray.seg)!.edge !== -1) continue
      const { segs: chain, end } = walk(v, ray)
      const ends: [Pt, Pt] = [v.p, end]
      ends.sort((u, w) => u[1] - w[1] || u[0] - w[0])
      const index = edges.length
      edges.push({ index, id: `${key(ends[0])}-${key(ends[1])}`, segs: chain, ends })
      for (const k of chain) segs.get(k)!.edge = index
    }
  }

  return { size, tris, triIndex, segs, vertices, edges }
}

/** 山谷を辺の番号ごとに。未定は undefined */
export type Assignment = readonly (MV | undefined)[]

export function isPassThrough(v: Vertex): boolean {
  return !v.onBorder && v.rays.length === 2 && v.rays[1].dir - v.rays[0].dir === 4
}
