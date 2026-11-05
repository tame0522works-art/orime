// 画面操作のテスト。公開と同じ設定でビルドしたもの（CSP 入り）をローカルで配信し、画面なしの Chrome に
// 本物のマウス・タッチ・キーボードの入力を送って、山谷の切り替え・頂点の印・折れたときの案内・記録・通信の制限を確かめる。
// `npm run e2e` で実行する（先に dist-e2e へビルドしてから、このスクリプトが配信とブラウザを立ち上げる）。
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PUZZLES } from '../src/puzzles/index.ts'
import { modelOf } from '../src/puzzles/load.ts'
import { tapsToSolve } from '../src/puzzles/route.ts'
import { Browser, sleep, type Page, type Viewport } from './cdp.ts'

const PORT = 4211
const BASE = `http://127.0.0.1:${PORT}/`
const DESKTOP: Viewport = { width: 1280, height: 860 }
const PHONE: Viewport = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, touch: true }
const FAILURES = 'e2e-failures'
type Input = 'mouse' | 'touch'

class Ui {
  readonly page: Page
  readonly input: Input
  constructor(page: Page, input: Input) {
    this.page = page
    this.input = input
  }

  async open() {
    await this.page.goto(BASE)
    await this.page.waitFor(`document.querySelector('.levels button')`, '一覧の表示')
  }

  text(selector: string) {
    return this.page.run<string>(`return (document.querySelector(${JSON.stringify(selector)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`)
  }

  private async tap(c: { x: number; y: number }) {
    if (this.input === 'touch') {
      await this.page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c] })
      await sleep(50)
      await this.page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      // 指を離してすぐの次のタップは Chrome が click にしないことがある（kakijun で分かったこと）
      await sleep(350)
    } else {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await this.page.send('Input.dispatchMouseEvent', { type, ...c, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
      }
      await sleep(60)
    }
  }

  private async center(selectorJs: string, label: string) {
    const c = await this.page.run<{ x: number; y: number } | null>(`
      const el = ${selectorJs};
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    `)
    assert.ok(c, `${label}がない`)
    return c
  }

  /** 見えている文字（空白を除く）か aria-label でボタンを押す */
  async press(label: string) {
    const L = JSON.stringify(label)
    await this.tap(await this.center(`[...document.querySelectorAll('button')].find(b => b.textContent.replace(/\\s+/g, '') === ${L} || b.getAttribute('aria-label') === ${L})`, `「${label}」のボタン`))
  }

  async disabled(label: string) {
    return this.page.run<boolean>(`return [...document.querySelectorAll('button')].find(b => b.textContent.replace(/\\s+/g, '') === ${JSON.stringify(label)}).disabled`)
  }

  /** 盤面の k 番目の押せる線を押す（線の中点。中点は頂点から離れているので、ほかの線の当たりと重ならない） */
  async crease(k: number) {
    await this.tap(await this.center(`document.querySelectorAll('.board .hit')[${k}]`, `${k + 1}番目の線`))
  }

  label(k: number) {
    return this.page.run<string>(`return document.querySelectorAll('.board .hit')[${k}]?.getAttribute('aria-label') ?? ''`)
  }

  marks() {
    return this.page.run<number>(`return document.querySelectorAll('.board .mark').length`)
  }

  solvedShown() {
    return this.page.run<boolean>(`return !!document.querySelector('.clear') && !!document.querySelector('svg.folded')`)
  }

  /** 答えまで線を押していく */
  async solve(index: number) {
    const taps = tapsToSolve(modelOf(PUZZLES[index]), PUZZLES[index])
    for (let k = 0; k < taps.length; k++) for (let c = 0; c < taps[k]; c++) await this.crease(k)
  }

  async key(key: string, code: string, vk: number) {
    for (const type of ['keyDown', 'keyUp']) await this.page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk })
    await sleep(60)
  }
}

interface Scenario {
  name: string
  viewport?: Viewport
  setup?: string
  run(ui: Ui): Promise<void>
}

const scenarios: Scenario[] = [
  {
    name: '一覧: 20問・0 / 20 問',
    async run(ui) {
      await ui.open()
      assert.equal(await ui.page.run<number>(`return document.querySelectorAll('.levels button').length`), 20)
      assert.match(await ui.text('.menu header .muted'), /0 \/ 20 問/)
    },
  },
  {
    name: 'スマホの指で1問目: 山にすると前川の定理の印 → 谷で折れる、記録が残る',
    viewport: PHONE,
    async run(ui) {
      await ui.open()
      await ui.press('1問目')
      assert.equal(await ui.label(0), '折り線 1: 未定')
      assert.match(await ui.text('.status'), /残り 1 本/)
      await ui.crease(0)
      assert.equal(await ui.label(0), '折り線 1: 山')
      assert.equal(await ui.marks(), 1)
      assert.match(await ui.text('.status'), /前川の定理/)
      await ui.crease(0)
      assert.equal(await ui.marks(), 0)
      assert.ok(await ui.solvedShown(), '折れた案内と折った形が出ない')
      assert.match(await ui.text('.clear'), /折れた.*記録しました/)
      await ui.press('形を見る')
      await ui.press('展開図を見る')
      assert.equal(await ui.label(0), '折り線 1: 谷')
      await ui.press('←一覧')
      assert.match(await ui.text('.menu header .muted'), /1 \/ 20 問/)
      // 読み込み直しても残っている
      await ui.open()
      assert.equal(await ui.page.run(`return document.querySelector('.levels button').getAttribute('aria-label')`), '1問目、解いた')
    },
  },
  {
    name: '3問目: 頂点は通るのに重なりでぶつかる案内 → 谷で折れる',
    async run(ui) {
      await ui.open()
      await ui.press('3問目')
      await ui.crease(0)
      assert.equal(await ui.marks(), 0)
      assert.match(await ui.text('.status'), /頂点はどれも通るのに、重なった紙どうしがぶつかって折れない/)
      await ui.crease(0)
      assert.ok(await ui.solvedShown())
    },
  },
  {
    name: '1手戻す・最初から',
    async run(ui) {
      await ui.open()
      await ui.press('4問目')
      assert.equal(await ui.disabled('1手戻す'), true)
      assert.equal(await ui.disabled('最初から'), true)
      await ui.crease(0)
      await ui.crease(0)
      await ui.crease(1)
      assert.equal(await ui.label(0), '折り線 1: 谷')
      assert.equal(await ui.label(1), '折り線 2: 山')
      await ui.press('1手戻す')
      assert.equal(await ui.label(1), '折り線 2: 未定')
      await ui.press('最初から')
      assert.equal(await ui.label(0), '折り線 1: 未定')
      assert.equal(await ui.disabled('1手戻す'), true)
    },
  },
  {
    name: '線を足す問題（11問目）: 候補線は なし→山→谷→なし、川崎の定理の印が消えて折れる',
    viewport: PHONE,
    async run(ui) {
      await ui.open()
      await ui.press('11問目')
      assert.match(await ui.text('.status'), /川崎の定理/)
      const p = PUZZLES[10]
      const g = tapsToSolve(modelOf(p), p).indexOf(0)
      assert.match(await ui.label(g), /^候補線 \d+: なし$/)
      for (const want of ['山', '谷', 'なし']) {
        await ui.crease(g)
        assert.match(await ui.label(g), new RegExp(`: ${want}$`))
      }
      await ui.solve(10)
      assert.equal(await ui.marks(), 0)
      assert.ok(await ui.solvedShown())
    },
  },
  {
    name: 'スマホの指で20問目をヒントだけで解く: 光った線を、文で言う状態になるまで押し続ける',
    viewport: PHONE,
    async run(ui) {
      await ui.open()
      await ui.press('20問目')
      // 最初に1本わざと違う向きにして、直すヒントが出ることも確かめる
      await ui.crease(0)
      await ui.crease(0)
      let sawFix = false
      for (let k = 0; k < 60 && !(await ui.solvedShown()); k++) {
        await ui.press('ヒント')
        const text = await ui.text('.hint-text')
        const m = text.match(/ヒント: 光っている線を「(山|谷|なし)」にする/)
        assert.ok(m, `ヒントの文が読めない: ${text}`)
        if (text.includes('いまの向きは違う')) sawFix = true
        // 光っている線と同じ位置の、押せる線
        const index = await ui.page.run<number>(`
          const h = document.querySelector('.board .hint-line');
          const same = (a, b) => ['x1', 'y1', 'x2', 'y2'].every(k => a.getAttribute(k) === b.getAttribute(k));
          return [...document.querySelectorAll('.board .hit')].findIndex(l => same(l, h));
        `)
        assert.ok(index >= 0, '光っている線が押せる線の中にない')
        // 最後の1本は、目当ての状態にした時点で折れて盤面が折った形に替わる
        for (let c = 0; c < 3 && !(await ui.solvedShown()) && !(await ui.label(index)).endsWith(`: ${m[1]}`); c++) await ui.crease(index)
        if (await ui.solvedShown()) break
        assert.ok((await ui.label(index)).endsWith(`: ${m[1]}`), '3回押しても目当ての状態にならない')
        assert.equal(await ui.page.run(`return !!document.querySelector('.board .hint-line')`), false, '目当ての状態にしてもヒントが消えない')
      }
      assert.ok(await ui.solvedShown(), 'ヒントだけで解けなかった')
      assert.ok(sawFix, '違う向きの線を直すヒントが出なかった')
      assert.equal(await ui.page.run(`return [...document.querySelectorAll('button')].some(b => b.textContent === 'ヒント')`), false, '解いたあともヒントのボタンがある')
    },
  },
  {
    name: '20問目を答えまで操作して折れる、最後の問題なので一覧へ',
    async run(ui) {
      await ui.open()
      await ui.press('20問目')
      await ui.solve(19)
      assert.ok(await ui.solvedShown())
      await ui.press('一覧へ')
      assert.match(await ui.text('.menu header .muted'), /1 \/ 20 問/)
    },
  },
  {
    name: '完成の案内から次の問題へ進める',
    async run(ui) {
      await ui.open()
      await ui.press('2問目')
      await ui.solve(1)
      await ui.press('次の問題へ')
      assert.equal(await ui.text('.top .title'), '3問目')
    },
  },
  {
    name: 'キーボード: Tab で線に移り、Enter で山谷を切り替える',
    async run(ui) {
      await ui.open()
      await ui.press('1問目')
      // 一覧へのボタンの次が最初の線
      await ui.page.run(`document.querySelector('.top button').focus()`)
      await ui.key('Tab', 'Tab', 9)
      assert.equal(await ui.page.run(`return document.activeElement.getAttribute('aria-label')`), '折り線 1: 未定')
      await ui.key('Enter', 'Enter', 13)
      assert.equal(await ui.label(0), '折り線 1: 山')
    },
  },
  {
    name: '保存できないブラウザでも遊べる（記録は残らない）',
    setup: `Storage.prototype.getItem = () => { throw new Error('blocked') }; Storage.prototype.setItem = () => { throw new Error('blocked') };`,
    async run(ui) {
      await ui.open()
      await ui.press('1問目')
      await ui.solve(0)
      assert.ok(await ui.solvedShown())
      await ui.press('←一覧')
      // 画面の中では覚えているが、読み込み直すと消える
      assert.match(await ui.text('.menu header .muted'), /1 \/ 20 問/)
      await ui.open()
      assert.match(await ui.text('.menu header .muted'), /0 \/ 20 問/)
    },
  },
  {
    name: '公開版の CSP: 通信は拒否し、すべて同じ場所から読む',
    async run(ui) {
      await ui.open()
      const csp = await ui.page.run<string>(`return document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? ''`)
      assert.match(csp, /connect-src 'none'/)
      const files = await ui.page.run<string[]>(`return performance.getEntriesByType('resource').map(e => e.name)`)
      assert.ok(files.every((f) => f.startsWith(BASE)), `別の場所から読んでいる: ${files.join(', ')}`)
      const blocked = await ui.page.run<boolean>(`try { await fetch('${BASE}'); return false } catch { return true }`)
      assert.ok(blocked, 'fetch が通ってしまう')
      assert.deepEqual(await ui.page.run(`return window.__csp`), [`connect-src ${BASE}`])
    },
  },
]

let server: ChildProcess | null = null

async function startServer() {
  // vite の preview で dist-e2e を配信する（npx を介さず、どの OS でも同じ起動のしかたにする）
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) return
    await sleep(100)
  }
  await stopServer()
  throw new Error('テスト用のサーバーが起動しませんでした')
}

async function stopServer() {
  if (!server) return
  const s = server
  server = null
  const exited = new Promise((r) => s.once('exit', r))
  s.kill()
  await exited
}

async function main() {
  const only = process.argv[2]
  await startServer()
  const browser = await Browser.launch(9351)
  let failed = 0
  try {
    for (const s of scenarios.filter((s) => !only || s.name.includes(only))) {
      const viewport = s.viewport ?? DESKTOP
      const page = await browser.newPage(viewport)
      // ページの中で起きた CSP 違反とエラーを記録しておく（意図して起こすもの以外は起きないはず）
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.__csp = []; window.__errors = [];
          document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
          addEventListener('error', e => window.__errors.push(String(e.message)));
          ${s.setup ?? ''}`,
      })
      const ui = new Ui(page, viewport.touch ? 'touch' : 'mouse')
      const t0 = Date.now()
      try {
        await s.run(ui)
        if (!s.name.startsWith('公開版の CSP')) assert.deepEqual(await page.run(`return window.__csp`), [], 'CSP 違反が起きた')
        assert.deepEqual(await page.run(`return window.__errors`), [], 'ページでエラーが起きた')
        console.log(`  ✓ ${s.name}（${((Date.now() - t0) / 1000).toFixed(1)}秒）`)
      } catch (e) {
        failed++
        console.log(`  ✗ ${s.name}\n      ${e instanceof Error ? e.message : String(e)}`)
        mkdirSync(FAILURES, { recursive: true })
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => ({ data: '' }))
        if (data) writeFileSync(join(FAILURES, `${scenarios.indexOf(s) + 1}.png`), Buffer.from(data, 'base64'))
      } finally {
        await page.send('Page.close').catch(() => {})
      }
    }
  } finally {
    await browser.close()
    await stopServer()
  }
  if (failed > 0) {
    console.log(`\n${failed} 件失敗しました（失敗時の画面: ${FAILURES}/）`)
    process.exit(1)
  }
  console.log('\ne2e OK')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
