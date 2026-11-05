import { useEffect, useMemo, useState } from 'react'
import type { FoldResult } from '../engine/fold.ts'
import { apply, key, triCorners, type Pt } from '../engine/geom.ts'
import type { Paper } from '../engine/pattern.ts'

type Ok = Extract<FoldResult, { ok: true }>

interface Piece {
  readonly flat: Pt[]
  readonly folded: Pt[]
  /** 面の外周になる辺（折り線か紙の縁）。小三角形の頂点の番号の組 */
  readonly outline: [number, number][]
  readonly flipped: boolean
  /** 折ったあとの重なりで、上から何枚目か */
  readonly depth: number
}

const DURATION = 1400

/**
 * 折り上がった形。開いた状態から、各小三角形を折ったあとの位置へ動かす。
 * 1本の折り線なら、まっすぐ動かすのが真上から見た折りの動きと同じになる（直線上の点は cos で縮む）。
 * 複数の折り線ではあくまで見せ方で、動きの途中の重なりは物理的ではない。
 */
export function Folded({ paper, result, play }: { paper: Paper; result: Ok; play: boolean }) {
  const pieces = useMemo(() => buildPieces(paper, result), [paper, result])
  const [t, setT] = useState(play ? 0 : 1)

  useEffect(() => {
    if (!play) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setT(1)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const x = Math.min(1, (now - start) / DURATION)
      setT(x)
      if (x < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [play, pieces])

  const e = (1 - Math.cos(Math.PI * t)) / 2
  const n = paper.size
  // 開いた紙と折ったあとの両方が入る枠（動いているあいだに大きさが変わらないように）
  const all = pieces.flatMap((p) => [...p.flat, ...p.folded])
  const xs = all.map((p) => p[0] / 2)
  const ys = all.map((p) => n - p[1] / 2)
  const pad = 0.35
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const w = Math.max(...xs) - Math.min(...xs) + 2 * pad
  const h = Math.max(...ys) - Math.min(...ys) + 2 * pad

  return (
    <svg className="folded" viewBox={`${minX} ${minY} ${w} ${h}`} role="img" aria-label="折り上がった形">
      {/* 開いたときの紙の位置。どこへ折り込まれたかの目安 */}
      <rect className="sheet" x={0} y={0} width={n} height={n} />
      {pieces.map((p, k) => {
        const pts = p.flat.map((f, i): [number, number] => {
          const g = p.folded[i]
          return [(f[0] + (g[0] - f[0]) * e) / 2, n - (f[1] + (g[1] - f[1]) * e) / 2]
        })
        // 裏返る面は、途中で紙が立ち上がった時点から裏の色になる
        const back = p.flipped && e > 0.5
        return (
          <g key={k}>
            <polygon className={back ? 'back' : 'front'} points={pts.map((q) => q.join(',')).join(' ')} />
            {p.outline.map(([i, j]) => (
              <line key={`${i}${j}`} className="edge" x1={pts[i][0]} y1={pts[i][1]} x2={pts[j][0]} y2={pts[j][1]} />
            ))}
          </g>
        )
      })}
    </svg>
  )
}

function buildPieces(paper: Paper, result: Ok): Piece[] {
  const { faces, stacks } = result
  const depthAt = new Map<string, number[]>()
  for (const s of stacks) depthAt.set(key(s.pos), s.faces)
  // 小三角形ごとの外周（折り線か紙の縁）の辺
  const outlineSegs: [Pt, Pt][][] = paper.tris.map(() => [])
  for (const s of paper.segs.values()) {
    if (s.edge === -1 && s.tris[1] !== -1) continue
    for (const t of s.tris) if (t !== -1) outlineSegs[t].push([s.p, s.q])
  }
  const pieces = paper.tris.map((tri, t): Piece => {
    const face = faces.faces[faces.triFace[t]]
    const flat = triCorners(tri.rep)
    const folded = flat.map((p) => apply(face.iso, p, 2))
    const at = key(apply(face.iso, tri.rep, 4))
    const depth = depthAt.get(at)!.indexOf(face.index)
    const idx = (p: Pt) => flat.findIndex((q) => q[0] === p[0] && q[1] === p[1])
    const outline = outlineSegs[t].map(([p, q]): [number, number] => [idx(p), idx(q)])
    return { flat, folded, outline, flipped: face.flipped, depth }
  })
  // 下の面から描く
  return pieces.sort((a, b) => b.depth - a.depth)
}
