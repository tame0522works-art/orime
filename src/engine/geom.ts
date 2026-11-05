/**
 * 紙と格子の幾何。
 *
 * 折り線は格子点どうしを 0°・45°・90° で結ぶものに限る。すると、どの折り線も
 * 「正方形1マスを2本の対角線で4つに割った直角三角形（以下、小三角形）」の辺の上に乗る。
 * 面は小三角形の集まりになり、折り線での反転は小三角形を小三角形へ写すので、
 * 重なりの判定を浮動小数を使わず「同じ位置の小三角形があるか」で済ませられる。
 *
 * 座標の単位:
 * - 頂点・線分の端は 2 倍の座標（格子点は偶数、マスの中心は奇数）
 * - 小三角形の代表点・線分の中点は 4 倍の座標
 * - 反転・面の写し方（Iso）の平行移動は元の単位（整数）
 */

export type Pt = readonly [number, number]

/** 小三角形の代表点（4 倍座標）。三角形の対称軸の上で、格子の辺から 1/4 の位置 */
export type TriRep = Pt

/** 線の種類。h: y=c、v: x=c、d: y=x+c、a: y=-x+c（c は元の単位で整数） */
export type LineType = 'h' | 'v' | 'd' | 'a'
export interface Line {
  readonly type: LineType
  readonly c: number
}

/** x' = a x + b y + tx、y' = c x + d y + ty（a〜d は 0・±1、tx・ty は元の単位） */
export interface Iso {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly tx: number
  readonly ty: number
}

export const IDENTITY: Iso = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

export function reflection(line: Line): Iso {
  const k = line.c
  switch (line.type) {
    case 'h':
      return { a: 1, b: 0, c: 0, d: -1, tx: 0, ty: 2 * k }
    case 'v':
      return { a: -1, b: 0, c: 0, d: 1, tx: 2 * k, ty: 0 }
    case 'd':
      return { a: 0, b: 1, c: 1, d: 0, tx: -k, ty: k }
    case 'a':
      return { a: 0, b: -1, c: -1, d: 0, tx: k, ty: k }
  }
}

/** p ↦ s(r(p)) */
export function compose(s: Iso, r: Iso): Iso {
  return {
    a: s.a * r.a + s.b * r.c,
    b: s.a * r.b + s.b * r.d,
    c: s.c * r.a + s.d * r.c,
    d: s.c * r.b + s.d * r.d,
    tx: s.a * r.tx + s.b * r.ty + s.tx,
    ty: s.c * r.tx + s.d * r.ty + s.ty,
  }
}

export function sameIso(s: Iso, r: Iso): boolean {
  return s.a === r.a && s.b === r.b && s.c === r.c && s.d === r.d && s.tx === r.tx && s.ty === r.ty
}

/** 裏返っているか（行列式が -1） */
export function flipped(s: Iso): boolean {
  return s.a * s.d - s.b * s.c < 0
}

/** 倍率 scale の座標の点に写す（平行移動は元の単位なので scale 倍する） */
export function apply(s: Iso, p: Pt, scale: number): Pt {
  return [s.a * p[0] + s.b * p[1] + scale * s.tx, s.c * p[0] + s.d * p[1] + scale * s.ty]
}

export const key = (p: Pt): string => `${p[0]},${p[1]}`

/** マス (i, j) の小三角形。q は 0: 下、1: 右、2: 上、3: 左 */
export function triRep(i: number, j: number, q: number): TriRep {
  const x = 4 * i
  const y = 4 * j
  switch (q) {
    case 0:
      return [x + 2, y + 1]
    case 1:
      return [x + 3, y + 2]
    case 2:
      return [x + 2, y + 3]
    default:
      return [x + 1, y + 2]
  }
}

/** 小三角形の頂点（2 倍座標）。描画用 */
export function triCorners(rep: TriRep): [Pt, Pt, Pt] {
  const i = Math.floor(rep[0] / 4)
  const j = Math.floor(rep[1] / 4)
  const rx = rep[0] - 4 * i
  const ry = rep[1] - 4 * j
  const x = 2 * i
  const y = 2 * j
  const center: Pt = [x + 1, y + 1]
  if (rx === 2 && ry === 1) return [[x, y], [x + 2, y], center]
  if (rx === 3 && ry === 2) return [[x + 2, y], [x + 2, y + 2], center]
  if (rx === 2 && ry === 3) return [[x + 2, y + 2], [x, y + 2], center]
  if (rx === 1 && ry === 2) return [[x, y + 2], [x, y], center]
  throw new Error(`小三角形の代表点ではない: ${key(rep)}`)
}

/** 小三角形の3辺。端は 2 倍座標 */
export function triSides(i: number, j: number, q: number): [Pt, Pt][] {
  const x = 2 * i
  const y = 2 * j
  const center: Pt = [x + 1, y + 1]
  const bl: Pt = [x, y]
  const br: Pt = [x + 2, y]
  const tr: Pt = [x + 2, y + 2]
  const tl: Pt = [x, y + 2]
  switch (q) {
    case 0:
      return [[bl, br], [br, center], [bl, center]]
    case 1:
      return [[br, tr], [br, center], [tr, center]]
    case 2:
      return [[tl, tr], [tr, center], [tl, center]]
    default:
      return [[bl, tl], [bl, center], [tl, center]]
  }
}

/** 線分（2 倍座標の端 p, q）の中点を 4 倍座標で。線分の識別に使う */
export function segMid(p: Pt, q: Pt): Pt {
  return [p[0] + q[0], p[1] + q[1]]
}

export function lineOf(p: Pt, q: Pt): Line {
  const dx = q[0] - p[0]
  const dy = q[1] - p[1]
  if (dy === 0) return { type: 'h', c: p[1] / 2 }
  if (dx === 0) return { type: 'v', c: p[0] / 2 }
  if (dx === dy) return { type: 'd', c: (p[1] - p[0]) / 2 }
  if (dx === -dy) return { type: 'a', c: (p[0] + p[1]) / 2 }
  throw new Error(`0°・45°・90° 以外の線: ${key(p)} → ${key(q)}`)
}

/** 向き (dx, dy) の符号を 45° 単位の番号 0〜7 に（0 が右、反時計回り） */
export function dirIndex(dx: number, dy: number): number {
  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  const table: Record<string, number> = {
    '1,0': 0,
    '1,1': 1,
    '0,1': 2,
    '-1,1': 3,
    '-1,0': 4,
    '-1,-1': 5,
    '0,-1': 6,
    '1,-1': 7,
  }
  const k = table[`${sx},${sy}`]
  if (k === undefined) throw new Error('向きがない')
  return k
}
