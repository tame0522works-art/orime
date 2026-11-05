/**
 * エンジンを、手で答えの分かる例と、頂点ごとの判定と紙全体の判定の突き合わせで確かめる。
 * npm run check:engine
 */
import type { Pt } from '../src/engine/geom.ts'
import { fold } from '../src/engine/fold.ts'
import { checkVertices, foldable1d } from '../src/engine/local.ts'
import { buildPaper, type Crease, type MV, type Paper } from '../src/engine/pattern.ts'
import { findAssignments } from '../src/engine/solve.ts'

let failed = 0
function expect(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'NG  '}${name}: ${JSON.stringify(actual)}${ok ? '' : ` （期待: ${JSON.stringify(expected)}）`}`)
}

const line = (a: Pt, b: Pt): Crease => ({ a, b })
/** 辺の id（端の 2 倍座標）で山谷を指定する */
function assign(paper: Paper, byEnds: Record<string, MV>): MV[] {
  return paper.edges.map((e) => {
    const x = byEnds[e.id]
    if (!x) throw new Error(`山谷の指定がない辺: ${e.id}`)
    return x
  })
}
function allMV(n: number): MV[][] {
  const out: MV[][] = []
  for (let m = 0; m < 1 << n; m++) out.push(Array.from({ length: n }, (_, k) => (((m >> k) & 1) === 1 ? 'M' : 'V')))
  return out
}
const localOk = (paper: Paper, a: MV[]) => checkVertices(paper, a).every((c) => c.problem === null)

// ---- 1本の折り ----
{
  const p = buildPaper(2, [line([1, 0], [1, 2])])
  expect('半分に折る: 辺の数', p.edges.length, 1)
  for (const mv of ['M', 'V'] as const) {
    const r = fold(p, [mv])
    expect(`半分に折る（${mv}）: 折れる`, r.ok, true)
    if (r.ok) {
      expect(`半分に折る（${mv}）: 重なる位置の数`, r.stacks.length, 8)
      expect(`半分に折る（${mv}）: どこも2枚`, r.stacks.every((s) => s.faces.length === 2), true)
      // 左の面（番号 0、表のまま）に対して、谷折りなら右の面が上に来る
      const top = r.faces.faces[r.stacks[0].faces[0]]
      expect(`半分に折る（${mv}）: 上の面は裏返っている`, top.flipped, mv === 'V')
    }
  }
}

// ---- 三つ折り（1次元の折りはどの山谷でも折れる） ----
{
  const p = buildPaper(3, [line([1, 0], [1, 3]), line([2, 0], [2, 3])])
  expect('三つ折り: 4通りとも折れる', allMV(2).map((a) => fold(p, a).ok), [true, true, true, true])
  const r = fold(p, ['V', 'V'])
  expect('三つ折り（谷谷）: どこも3枚', r.ok && r.stacks.every((s) => s.faces.length === 3), true)
}

// ---- 1つの頂点: 頂点ごとの判定と紙全体の判定が一致するか ----
{
  const ends: Pt[] = [[2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0], [1, 0], [2, 0]]
  let cases = 0
  let mismatch = 0
  const counts = new Map<string, number>()
  for (let mask = 1; mask < 256; mask++) {
    const dirs = [...Array(8).keys()].filter((d) => (mask >> d) & 1)
    if (dirs.length < 2) continue
    const p = buildPaper(2, dirs.map((d) => line([1, 1], ends[d])))
    let foldable = 0
    for (const a of allMV(p.edges.length)) {
      cases++
      const local = localOk(p, a)
      const global = fold(p, a).ok
      if (local !== global) mismatch++
      if (global) foldable++
    }
    counts.set(dirs.join(''), foldable)
  }
  expect(`1つの頂点（${cases} 通り）: 頂点の判定と全体の判定の食い違い`, mismatch, 0)
  // 角がすべて等しい 2n 本の頂点で折れる山谷は 2·C(2n, n−1) 通り（Hull）
  expect('8本・45° ずつ: 折れる山谷の数', counts.get('01234567'), 112)
  expect('4本・90° ずつ: 折れる山谷の数', counts.get('0246'), 8)
  expect('2本・まっすぐ: 折れる山谷の数', counts.get('04'), 2)
  expect('川崎の定理を満たさない（0°・45°・180°）: 0通り', counts.get('014'), 0)
}

// ---- 紙の縁の頂点: 頂点の判定と全体の判定が一致するか ----
{
  // 下の縁の (2, 0) から 45°・90°・135° の線
  const ends: Pt[] = [[4, 2], [2, 4], [0, 2]]
  let mismatch = 0
  let cases = 0
  for (let mask = 1; mask < 8; mask++) {
    const p = buildPaper(4, ends.filter((_, k) => (mask >> k) & 1).map((e) => line([2, 0], e)))
    for (const a of allMV(p.edges.length)) {
      cases++
      if (localOk(p, a) !== fold(p, a).ok) mismatch++
    }
  }
  expect(`紙の縁の頂点（${cases} 通り）: 食い違い`, mismatch, 0)
  // 45° を挟む2本が同じ向きだと、両側の 45° の面がぶつかる……のではなく端から折り返せる
  const p = buildPaper(4, [line([2, 0], [4, 2]), line([2, 0], [0, 2])])
  expect('縁の頂点 45°・90°・45°: 4通りとも折れる', allMV(2).map((a) => fold(p, a).ok), [true, true, true, true])
}

// ---- 細い帯を挟む平行な2本（大・小・大）: 同じ向きでは折れない。頂点では分からない ----
{
  const p = buildPaper(3, [line([0, 0], [3, 3]), line([1, 0], [3, 2])])
  expect('大・小・大の帯: 山山・谷山・山谷・谷谷', allMV(2).map((a) => fold(p, a).ok), [false, true, true, false])
  expect('大・小・大の帯: 頂点の判定はすべて通る', allMV(2).map((a) => localOk(p, a)), [true, true, true, true])
}

// ---- 縦の平行線だけ: 紙全体の判定が1次元の折り（端の折り返しとつぶし）と一致するか ----
{
  let cases = 0
  let mismatch = 0
  let foldable = 0
  for (const size of [5, 7]) {
    for (let mask = 1; mask < 1 << (size - 1); mask++) {
      const xs = [...Array(size - 1).keys()].map((k) => k + 1).filter((x) => (mask >> (x - 1)) & 1)
      const p = buildPaper(size, xs.map((x) => line([x, 0], [x, size])))
      const lengths = [...xs, size].map((x, k) => x - (k === 0 ? 0 : xs[k - 1]))
      for (const a of allMV(xs.length)) {
        cases++
        const g = fold(p, a).ok
        if (g) foldable++
        if (g !== foldable1d(lengths, a)) mismatch++
      }
    }
  }
  expect(`縦の平行線（${cases} 通り、折れる ${foldable}）: 1次元の判定との食い違い`, mismatch, 0)
}

// ---- ふくらし（waterbomb）の基本形 ----
// 折れる山谷: 45° が2つ並ぶ組（3本）が2つあり、少ない側の2本を組ごとに1本ずつ選ぶ 3×3、山谷の入れ替えで ×2
{
  const p = buildPaper(2, [line([0, 0], [2, 2]), line([0, 2], [2, 0]), line([0, 1], [2, 1])])
  expect('ふくらしの基本形: 辺の数', p.edges.length, 6)
  const a = assign(p, {
    '0,0-2,2': 'M',
    '2,2-4,4': 'M',
    '4,0-2,2': 'M',
    '2,2-0,4': 'M',
    '0,2-2,2': 'V',
    '2,2-4,2': 'V',
  })
  const r = fold(p, a)
  expect('ふくらしの基本形: 折れる', r.ok, true)
  if (r.ok) expect('ふくらしの基本形: いちばん厚いところは4枚', Math.max(...r.stacks.map((s) => s.faces.length)), 4)
  expect('ふくらしの基本形: 折れる山谷の数', findAssignments(p, [], 100).length, 18)
}

// ---- 形の上で折れない（川崎の定理を満たさない） ----
{
  const p = buildPaper(2, [line([1, 1], [2, 1]), line([1, 1], [2, 2]), line([1, 1], [0, 1])])
  const r = fold(p, ['M', 'M', 'V'])
  expect('3本の頂点: 形の上で折れない', r.ok ? 'ok' : r.reason, 'geometry')
  expect('3本の頂点: 頂点の印は川崎', checkVertices(p, ['M', 'M', 'V']).map((c) => c.problem).filter((x) => x), ['kawasaki'])
}

// ---- 途中で止まる折り線 ----
{
  const p = buildPaper(2, [line([0, 1], [1, 1])])
  expect('途中で止まる折り線: 形の上で折れない', fold(p, ['V']).ok, false)
}

// ---- 無作為な展開図: 全体が折れるなら頂点もすべて通る。逆は成り立たないことがある ----
{
  // mulberry32（掛け算を Math.imul で 32 ビットに収める）
  let seed = 12345
  const rand = (n: number) => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (((t ^ (t >>> 14)) >>> 0) % n)
  }
  const size = 4
  let tried = 0
  let geometryOk = 0
  let globalOk = 0
  let localOnly = 0
  let violation = 0
  const sample: string[] = []
  const start = performance.now()
  while (tried < 3000) {
    // 端から端までの線を何本か（0°・45°・90°）
    const creases: Crease[] = []
    const k = 1 + rand(4)
    for (let c = 0; c < k; c++) {
      const t = rand(4)
      const o = 1 + rand(size - 1)
      if (t === 0) creases.push(line([o, 0], [o, size]))
      else if (t === 1) creases.push(line([0, o], [size, o]))
      else if (t === 2) {
        const s = rand(2 * size - 1) - (size - 1)
        const a: Pt = s >= 0 ? [0, s] : [-s, 0]
        const b: Pt = s >= 0 ? [size - s, size] : [size, size + s]
        if (a[0] !== b[0]) creases.push(line(a, b))
      } else {
        const s = 1 + rand(2 * size - 1)
        const a: Pt = s <= size ? [0, s] : [s - size, size]
        const b: Pt = s <= size ? [s, 0] : [size, s - size]
        creases.push(line(a, b))
      }
    }
    const p = buildPaper(size, creases)
    if (p.edges.length > 14) continue
    tried++
    const mv: MV[] = p.edges.map(() => (rand(2) ? 'M' : 'V'))
    const r = fold(p, mv)
    if (r.ok || r.reason === 'layers') geometryOk++
    const local = localOk(p, mv)
    if (r.ok) globalOk++
    if (r.ok && !local) violation++
    if (!r.ok && r.reason === 'layers' && local) {
      localOnly++
      if (sample.length < 3) sample.push(JSON.stringify({ creases: creases.map((c) => [c.a, c.b]), mv }))
    }
  }
  const ms = performance.now() - start
  expect('無作為（3000 通り）: 全体は折れるのに頂点で引っかかる', violation, 0)
  console.log(`     形の上で折れる ${geometryOk}、全体が折れる ${globalOk}、頂点はすべて通るのに重なりで折れない ${localOnly}（${ms.toFixed(0)}ms）`)
  for (const s of sample) console.log(`     例: ${s}`)
}

if (failed > 0) {
  console.error(`\n${failed} 件の不一致`)
  process.exit(1)
}
console.log('\nすべて OK')
