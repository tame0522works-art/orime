// README に載せる画面の画像を撮る。公開と同じ設定のビルドを配信した状態（npm run build → npm run preview）で
// `npm run screenshots` を実行する。Edge（なければ Chrome）を画面なしで起動し、Chrome DevTools Protocol で操作する。
// 操作は決まった手順なので、アプリを直したら同じ画像を撮り直せる。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PUZZLES } from '../src/puzzles/index.ts'
import { modelOf } from '../src/puzzles/load.ts'
import { tapsToSolve } from '../src/puzzles/route.ts'
import { Browser, sleep, type Page } from './cdp.ts'

const BASE = process.argv[2] ?? 'http://localhost:5212/'
const OUT = 'docs/images'

async function shoot(cdp: Page, name: string) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'))
  console.log(`  ${OUT}/${name}`)
}

async function open(cdp: Page) {
  await cdp.goto(BASE)
  // 同じポートで別の作品が動いていると、その画面を撮ってしまうので、orime であることを先に確かめる
  const title = await cdp.run<string>(`return document.title`)
  if (title !== 'orime') throw new Error(`${BASE} で動いているのは orime ではありません（ページの題名: ${title || 'なし'}）`)
  await cdp.waitFor(`document.querySelector('.levels button')`, '一覧の表示')
}

/** 見えている文字か aria-label でボタンを押す（画像に写らない操作なので click で足りる） */
const press = (cdp: Page, label: string) =>
  cdp.run(`[...document.querySelectorAll('button')].find(b => b.textContent.replace(/\\s+/g, '') === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)}).click()`)
const crease = (cdp: Page, k: number) => cdp.run(`document.querySelectorAll('.board .hit')[${k}].dispatchEvent(new MouseEvent('click', { bubbles: true }))`)

async function main() {
  mkdirSync(OUT, { recursive: true })
  // このブラウザ専用の一時プロファイルを使うので、普段のデータには触れない
  const browser = await Browser.launch()
  try {
    const cdp = await browser.newPage({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    console.log('撮影:')

    // 1. 20問目を途中まで: 足した候補線と、まだ規則を破っている頂点の印
    await open(cdp)
    await press(cdp, '20問目')
    const p = PUZZLES[19]
    const taps = tapsToSolve(modelOf(p), p)
    for (let k = 0; k < 8; k++) for (let c = 0; c < taps[k]; c++) await crease(cdp, k)
    await sleep(300)
    await shoot(cdp, 'start.png')

    // 2. 10問目を解いて、折り上がった形
    await open(cdp)
    await press(cdp, '10問目')
    const q = PUZZLES[9]
    const t2 = tapsToSolve(modelOf(q), q)
    for (let k = 0; k < t2.length; k++) for (let c = 0; c < t2[k]; c++) await crease(cdp, k)
    await sleep(1800)
    await shoot(cdp, 'clear.png')

    // 3. 一覧（10問目だけ解いた記録がある）
    await press(cdp, '←一覧')
    await sleep(200)
    await shoot(cdp, 'menu.png')
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
