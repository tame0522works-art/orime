import type { Model } from '../engine/states.ts'
import type { Puzzle } from './types.ts'

/**
 * 盤面で押せる線の並び（Board.tsx と同じ順: 長い辺から、手がかりの辺は除く）と、
 * 答えにするために最初の状態から押す回数（山 1・谷 2・なし 0）。e2e と画像の撮影で使う。
 */
export function tapsToSolve(m: Model, p: Puzzle): number[] {
  return [...m.full.edges]
    .sort((a, b) => b.segs.length - a.segs.length)
    .filter((e) => !p.given[e.id])
    .map((e) => (p.answer[e.id] === 'M' ? 1 : p.answer[e.id] === 'V' ? 2 : 0))
}
