/**
 * 解いた問題を、この端末のブラウザ（localStorage）に置く。どこへも送らない。
 * 読めない・書けない（プライベートウィンドウなど）ときは、保存なしで動く。
 */
export type Progress = { readonly [id: string]: true }

const KEY = 'orime:progress:v1'

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return {}
    const out: { [id: string]: true } = {}
    for (const id of data) if (typeof id === 'string') out[id] = true
    return out
  } catch {
    return {}
  }
}

export function saveSolved(progress: Progress, id: string): Progress {
  if (progress[id]) return progress
  const next = { ...progress, [id]: true as const }
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.keys(next)))
  } catch {
    // 保存できなくても遊べる
  }
  return next
}
