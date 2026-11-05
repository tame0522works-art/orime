import type { MV } from '../engine/pattern.ts'

/** 折り線（元の単位の格子点 x1, y1 から x2, y2 まで） */
export type LineSpec = readonly [number, number, number, number]

export interface Puzzle {
  readonly id: string
  readonly size: number
  readonly lines: readonly LineSpec[]
  /** 候補線（足してもよい折り線）。線を足す問題だけ。答えに含まれない辺は「なし」 */
  readonly ghosts?: readonly LineSpec[]
  /** 最初から決まっている山谷（辺の id → 山谷）。変えられない */
  readonly given: Readonly<Record<string, MV>>
  /** 答え（使う辺の id → 山谷）。check:puzzles で、これが唯一の答えであることを確かめる */
  readonly answer: Readonly<Record<string, MV>>
  /** 問題の一言（遊ぶ画面に出す） */
  readonly note?: string
}
