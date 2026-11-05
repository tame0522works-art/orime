import type { EdgeState, Mark, Model } from '../engine/states.ts'

interface Props {
  model: Model
  states: readonly EdgeState[]
  /** 最初から決まっていて変えられない辺 */
  fixed: readonly boolean[]
  marks: readonly Mark[]
  onTap: (edge: number) => void
}

const LABEL = { M: '山', V: '谷' } as const

/** 展開図。座標は元の単位で、紙の y は上向きなので反転して描く */
export function Board({ model, states, fixed, marks, onTap }: Props) {
  const paper = model.full
  const n = paper.size
  const X = (x2: number) => x2 / 2
  const Y = (y2: number) => n - y2 / 2
  const dots: [number, number][] = []
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) dots.push([x, y])
  // 短い辺（交点のあいだの斜めの半分など）を後ろに描いて、押す場所が長い辺に隠れないようにする
  const order = [...paper.edges].sort((a, b) => b.segs.length - a.segs.length)
  // 読み上げの番号は、押せる線だけで数える
  const tappable = order.filter((e) => !fixed[e.index])

  return (
    <svg className="board" viewBox={`-0.35 -0.35 ${n + 0.7} ${n + 0.7}`} role="group" aria-label="展開図">
      <rect className="paper" x={0} y={0} width={n} height={n} />
      {dots.map(([x, y]) => (
        <circle key={`${x},${y}`} className="dot" cx={x} cy={n - y} r={0.035} />
      ))}
      {order.map((e) => {
        const mv = states[e.index]
        const [a, b] = e.ends
        const cls = ['crease', mv === 'M' ? 'm' : mv === 'V' ? 'v' : mv === 'N' ? 'ghost' : 'u', fixed[e.index] ? 'fixed' : ''].join(' ')
        return <line key={e.id} className={cls} x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} />
      })}
      {marks.map((c) => (
        <circle key={`${c.vertex.p[0]},${c.vertex.p[1]}`} className="mark" cx={X(c.vertex.p[0])} cy={Y(c.vertex.p[1])} r={0.2} />
      ))}
      {tappable.map((e, k) => {
        const mv = states[e.index]
        const [a, b] = e.ends
        return (
          <line
            key={`hit-${e.id}`}
            className="hit"
            x1={X(a[0])}
            y1={Y(a[1])}
            x2={X(b[0])}
            y2={Y(b[1])}
            role="button"
            tabIndex={0}
            aria-label={`${model.ghost[e.index] ? '候補線' : '折り線'} ${k + 1}: ${mv === 'N' ? 'なし' : mv ? LABEL[mv] : '未定'}`}
            onClick={() => onTap(e.index)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault()
                onTap(e.index)
              }
            }}
          />
        )
      })}
    </svg>
  )
}
