import { useMemo, useState } from 'react'
import { evaluate, type EdgeState, type Problem } from './engine/states.ts'
import { PUZZLES } from './puzzles/index.ts'
import { nextHint, type Hint } from './puzzles/hint.ts'
import { initialStates, modelOf } from './puzzles/load.ts'
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

/** 決まった線は 未定→山→谷→未定、候補線は なし→山→谷→なし */
function nextState(s: EdgeState, ghost: boolean): EdgeState {
  if (s === undefined || s === 'N') return 'M'
  if (s === 'M') return 'V'
  return ghost ? 'N' : undefined
}

function Play({ index, puzzle, solvedBefore: solvedAtStart, onSolved, onBack, onNext }: PlayProps) {
  // 解いた直後に記録が書き換わるので、開いた時点の値を持っておく
  const [solvedBefore] = useState(solvedAtStart)
  const model = useMemo(() => modelOf(puzzle), [puzzle])
  const fixed = useMemo(() => model.full.edges.map((e) => puzzle.given[e.id] !== undefined), [model, puzzle])
  const hasGhosts = model.ghost.some(Boolean)
  const [history, setHistory] = useState<EdgeState[][]>(() => [initialStates(model, puzzle)])
  const [view, setView] = useState<'pattern' | 'folded'>('pattern')
  const [dismissed, setDismissed] = useState(false)
  // ヒント: 次の1手（光らせる線と、どの状態にするか）
  const [hint, setHint] = useState<Hint | null>(null)
  const states = history[history.length - 1]
  const ev = useMemo(() => evaluate(model, states), [model, states])
  const { result, marks, pending: open } = ev
  const solved = result?.ok === true

  const tap = (e: number) => {
    if (fixed[e] || solved) return
    const next = [...states]
    next[e] = nextState(states[e], model.ghost[e])
    setHistory((h) => [...h, next])
    // 光っている線を目当ての状態にするまでは、ヒントを出したままにする
    if (!hint || hint.edge !== e || next[e] === hint.target) setHint(null)
    if (evaluate(model, next).result?.ok) {
      onSolved()
      setView('folded')
      setDismissed(false)
    }
  }

  let status: string
  if (solved) status = '平らに折れました。'
  else if (marks.length) status = describe(marks.map((c) => c.problem))
  else if (result && !result.ok) status = result.reason === 'geometry' ? '頂点はどれも通るのに、折り線が足りず紙が閉じない。' : '頂点はどれも通るのに、重なった紙どうしがぶつかって折れない。'
  else if (open > 0) status = `未定の線（灰色）をタップして、山か谷を決める。残り ${open} 本。`
  else status = '薄い点線をタップして折り線を足す。'

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
        {result?.ok && ev.active && view === 'folded' ? <Folded paper={ev.active} result={result} play /> : <Board model={model} states={states} fixed={fixed} marks={marks} hinted={hint?.edge ?? null} onTap={tap} />}
      </div>

      <p className={`status${marks.length || (result && !result.ok) ? ' bad' : ''}`} aria-live="polite">
        {status}
      </p>
      {hint && (
        <p className="hint-text" aria-live="polite">
          ヒント: 光っている線を「{TARGET_LABEL[hint.target ?? 'N']}」にする{hint.fix ? '（いまの向きは違う）' : ''}
        </p>
      )}

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
        {hasGhosts && (
          <span>
            <svg viewBox="0 0 30 6">
              <line className="crease ghost" x1="1" y1="3" x2="29" y2="3" />
            </svg>
            足せる場所
          </span>
        )}
        <span className="muted">太い線は最初から決まっている</span>
      </div>

      <div className="sub">
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setHistory((h) => h.slice(0, -1))
            setHint(null)
          }}
          disabled={history.length < 2 || solved}
        >
          1手戻す
        </button>
        {!solved && (
          <button type="button" className="ghost" onClick={() => setHint(nextHint(model, puzzle, states))}>
            ヒント
          </button>
        )}
        {solved ? (
          <button type="button" className="ghost" onClick={() => setView(view === 'folded' ? 'pattern' : 'folded')}>
            {view === 'folded' ? '展開図を見る' : '折った形を見る'}
          </button>
        ) : null}
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setHistory((h) => [h[0]])
            setHint(null)
          }}
          disabled={history.length < 2}
        >
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

const TARGET_LABEL = { M: '山', V: '谷', N: 'なし' } as const

const PROBLEM_TEXT: { [p in Problem]: string } = {
  switch: 'まっすぐな線の途中で山と谷が入れ替わっている',
  kawasaki: '角を1つおきに足しても 180° にならない（川崎の定理）',
  maekawa: '山と谷の本数の差が 2 になっていない（前川の定理）',
  crimp: '小さい角を挟む2本が同じ向きで、紙がぶつかる',
}

function describe(problems: Problem[]): string {
  const kinds = [...new Set(problems)]
  return `赤い印の頂点: ${kinds.map((k) => PROBLEM_TEXT[k]).join('。')}`
}
