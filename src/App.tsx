import { useMemo, useState } from 'react'
import { fold } from './engine/fold.ts'
import { checkVertices, type VertexProblem } from './engine/local.ts'
import type { Assignment, MV } from './engine/pattern.ts'
import { PUZZLES } from './puzzles/index.ts'
import { paperOf, toAssignment } from './puzzles/load.ts'
import type { Puzzle } from './puzzles/types.ts'
import { loadProgress, saveSolved, type Progress } from './storage.ts'
import { Board } from './ui/Board.tsx'
import { Folded } from './ui/Folded.tsx'

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [current, setCurrent] = useState<number | null>(null)

  if (current === null) return <Menu progress={progress} onPick={setCurrent} />
  const puzzle = PUZZLES[current]
  return (
    <Play
      key={puzzle.id}
      index={current}
      puzzle={puzzle}
      solvedBefore={!!progress[puzzle.id]}
      onSolved={() => setProgress((p) => saveSolved(p, puzzle.id))}
      onBack={() => setCurrent(null)}
      onNext={current + 1 < PUZZLES.length ? () => setCurrent(current + 1) : null}
    />
  )
}

function Menu({ progress, onPick }: { progress: Progress; onPick: (i: number) => void }) {
  const solved = PUZZLES.filter((p) => progress[p.id]).length
  return (
    <main className="menu">
      <header>
        <h1>orime</h1>
        <p className="lead">正方形の紙の折り線に山と谷を付けて、平らに折りたためる展開図に仕上げるパズル。</p>
        <p className="muted">
          {solved} / {PUZZLES.length} 問
        </p>
      </header>
      <ol className="levels">
        {PUZZLES.map((p, i) => {
          const done = !!progress[p.id]
          return (
            <li key={p.id}>
              <button type="button" className={done ? 'done' : undefined} onClick={() => onPick(i)} aria-label={`${i + 1}問目${done ? '、解いた' : ''}`}>
                <span className="num">{i + 1}</span>
                <span className="size">
                  {p.size}×{p.size}
                </span>
                <span className="check" aria-hidden="true">
                  {done ? '折れた' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <footer className="muted">記録はこの端末のブラウザにだけ保存します。</footer>
    </main>
  )
}

interface PlayProps {
  index: number
  puzzle: Puzzle
  solvedBefore: boolean
  onSolved: () => void
  onBack: () => void
  onNext: (() => void) | null
}

const CYCLE: { [k in MV | 'u']: MV | undefined } = { u: 'M', M: 'V', V: undefined }

function Play({ index, puzzle, solvedBefore: solvedAtStart, onSolved, onBack, onNext }: PlayProps) {
  // 解いた直後に記録が書き換わるので、開いた時点の値を持っておく
  const [solvedBefore] = useState(solvedAtStart)
  const paper = useMemo(() => paperOf(puzzle), [puzzle])
  const fixed = useMemo(() => paper.edges.map((e) => puzzle.given[e.id] !== undefined), [paper, puzzle])
  const [history, setHistory] = useState<Assignment[]>(() => [toAssignment(paper, puzzle.given)])
  const [view, setView] = useState<'pattern' | 'folded'>('pattern')
  const [dismissed, setDismissed] = useState(false)
  const assignment = history[history.length - 1]
  const checks = useMemo(() => checkVertices(paper, assignment), [paper, assignment])
  const open = assignment.filter((x) => x === undefined).length + (paper.edges.length - assignment.length)
  const problems = checks.filter((c) => c.problem)
  const result = useMemo(() => (open === 0 && problems.length === 0 ? fold(paper, assignment) : null), [paper, assignment, open, problems.length])
  const solved = result?.ok === true

  const tap = (e: number) => {
    if (fixed[e] || solved) return
    const next = [...assignment]
    next.length = paper.edges.length
    next[e] = CYCLE[assignment[e] ?? 'u']
    setHistory((h) => [...h, next])
    const nextChecks = checkVertices(paper, next)
    if (next.every((x) => x !== undefined) && nextChecks.every((c) => !c.problem) && fold(paper, next).ok) {
      onSolved()
      setView('folded')
      setDismissed(false)
    }
  }

  let status: string
  if (solved) status = '平らに折れました。'
  else if (problems.length) status = describe(problems.map((c) => c.problem!))
  else if (result && !result.ok) status = '頂点はどれも通るのに、重なった紙どうしがぶつかって折れない。'
  else status = `未定の線（灰色）をタップして、山か谷を決める。残り ${open} 本。`

  return (
    <main className="play">
      <header className="top">
        <button type="button" className="ghost" onClick={onBack}>
          ← 一覧
        </button>
        <span className="title">{index + 1}問目</span>
        <span className="meters">
          未定 <b>{open}</b>
        </span>
      </header>

      {puzzle.note && <p className="rule">{puzzle.note}</p>}

      <div className="stage">
        {result?.ok && view === 'folded' ? <Folded paper={paper} result={result} play /> : <Board paper={paper} assignment={assignment} fixed={fixed} checks={checks} onTap={tap} />}
      </div>

      <p className={`status${problems.length || (result && !result.ok) ? ' bad' : ''}`} aria-live="polite">
        {status}
      </p>

      <div className="legend" aria-hidden="true">
        <span>
          <svg viewBox="0 0 30 6">
            <line className="crease m" x1="1" y1="3" x2="29" y2="3" />
          </svg>
          山
        </span>
        <span>
          <svg viewBox="0 0 30 6">
            <line className="crease v" x1="1" y1="3" x2="29" y2="3" />
          </svg>
          谷
        </span>
        <span>
          <svg viewBox="0 0 30 6">
            <line className="crease u" x1="1" y1="3" x2="29" y2="3" />
          </svg>
          未定
        </span>
        <span className="muted">太い線は最初から決まっている</span>
      </div>

      <div className="sub">
        <button type="button" className="ghost" onClick={() => setHistory((h) => h.slice(0, -1))} disabled={history.length < 2 || solved}>
          1手戻す
        </button>
        {solved ? (
          <button type="button" className="ghost" onClick={() => setView(view === 'folded' ? 'pattern' : 'folded')}>
            {view === 'folded' ? '展開図を見る' : '折った形を見る'}
          </button>
        ) : null}
        <button type="button" className="ghost" onClick={() => setHistory((h) => [h[0]])} disabled={history.length < 2}>
          最初から
        </button>
      </div>

      {solved && !dismissed && (
        <div className="clear" role="dialog" aria-label="完成">
          <p className="big">折れた</p>
          <p className="muted">{solvedBefore ? 'この問題は前にも解いています。' : '記録しました。'}</p>
          <div className="row">
            <button type="button" className="ghost" onClick={() => setDismissed(true)}>
              形を見る
            </button>
            {onNext ? (
              <button type="button" onClick={onNext}>
                次の問題へ
              </button>
            ) : (
              <button type="button" onClick={onBack}>
                一覧へ
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

const PROBLEM_TEXT: { [p in VertexProblem]: string } = {
  kawasaki: '角を1つおきに足しても 180° にならない（川崎の定理）',
  maekawa: '山と谷の本数の差が 2 になっていない（前川の定理）',
  crimp: '小さい角を挟む2本が同じ向きで、紙がぶつかる',
}

function describe(problems: VertexProblem[]): string {
  const kinds = [...new Set(problems)]
  return `赤い印の頂点: ${kinds.map((k) => PROBLEM_TEXT[k]).join('。')}`
}
