import { JSDOM } from 'jsdom'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function fail(msg){
  console.error('TEST FAIL:', msg)
  process.exit(1)
}

async function run(){
  // module path used by tests
  const modPath = pathToFileURL(path.join(__dirname, '..', 'melodijs.js')).href

  // --- TEST v-if ---
  const domIf = new JSDOM(`<!doctype html><html><body><div id="app"><test-if></test-if></div></body></html>`, { runScripts: 'outside-only' })
  global.window = domIf.window
  global.document = domIf.window.document
  global.HTMLElement = domIf.window.HTMLElement
  const { createApp: createAppIf } = await import(modPath)
  const appIf = createAppIf({
    components: {
      'test-if': {
        template: `<div><button @click="toggle">toggle</button><div v-if="show">VISIBLE</div></div>`,
        data(){ return { show: false } },
        methods: { toggle(){ this.show = !this.show } }
      }
    }
  })
  await appIf.mount('#app')
  const btnIf = document.querySelector('button')
  if (!btnIf) fail('v-if: button missing')
  if (document.querySelector('div[visible]')) fail('v-if: should not be visible initially')
  btnIf.dispatchEvent(new domIf.window.Event('click'))
  await new Promise(r => setTimeout(r, 0))
  if (!document.body.textContent.includes('VISIBLE')) fail('v-if: should be visible after click')

  // --- TEST v-show ---
  const domShow = new JSDOM(`<!doctype html><html><body><div id="app"><test-show></test-show></div></body></html>`, { runScripts: 'outside-only' })
  global.window = domShow.window
  global.document = domShow.window.document
  global.HTMLElement = domShow.window.HTMLElement
  const { createApp: createAppShow } = await import(modPath)
  const appShow = createAppShow({
    components: {
      'test-show': {
        template: `<div><button @click="toggle">toggle</button><div id="showme" v-show="show">VISIBLE</div></div>`,
        data(){ return { show: false } },
        methods: { toggle(){ this.show = !this.show } }
      }
    }
  })
  await appShow.mount('#app')
  const btnShow = document.querySelector('button')
  const showDiv = document.getElementById('showme')
  if (!btnShow || !showDiv) fail('v-show: elements missing')
  if (showDiv.style.display !== 'none') fail('v-show: should be hidden initially')
  btnShow.dispatchEvent(new domShow.window.Event('click'))
  await new Promise(r => setTimeout(r, 0))
  if (showDiv.style.display === 'none') fail('v-show: should be visible after click')

  // --- TEST v-model ---
  const domModel = new JSDOM(`<!doctype html><html><body><div id="app"><test-model></test-model></div></body></html>`, { runScripts: 'outside-only' })
  global.window = domModel.window
  global.document = domModel.window.document
  global.HTMLElement = domModel.window.HTMLElement
  const { createApp: createAppModel } = await import(modPath)
  const appModel = createAppModel({
    components: {
      'test-model': {
        template: `<div><input v-model="val" /><span id="out">{{ val }}</span></div>`,
        data(){ return { val: 'abc' } }
      }
    }
  })
  await appModel.mount('#app')
  const input = document.querySelector('input')
  const out = document.getElementById('out')
  if (!input || !out) fail('v-model: elements missing')
  if (input.value !== 'abc') fail('v-model: input initial value')
  if (out.textContent.trim() !== 'abc') fail('v-model: span initial value')
  input.value = 'def'
  input.dispatchEvent(new domModel.window.Event('input'))
  await new Promise(r => setTimeout(r, 0))
  // debug
  console.log('DEBUG v-model after input ->', 'input.value=', input.value, 'out.text=', out.textContent)
  if (out.textContent.trim() !== 'def') fail('v-model: span should update after input')
  // prepare a minimal DOM
  const html = `<!doctype html><html><body><div id="app"><my-counter start="2"></my-counter></div></body></html>`
  const dom = new JSDOM(html, { runScripts: 'outside-only' })
  global.window = dom.window
  global.document = dom.window.document
  global.HTMLElement = dom.window.HTMLElement

  // import library (after DOM globals set)
  const { createApp } = await import(modPath)

  // create app with inline component
  const app = createApp({
    components: {
      'my-counter': {
        template: `<div><button @click="dec">-</button><span>{{ count }}</span><button @click="inc">+</button></div>`,
        props: ['start'],
        data(){ return { count: this.start } },
        methods: {
          inc(){ this.count = Number(this.count) + 1 },
          dec(){ this.count = Number(this.count) - 1 }
        }
      }
    }
  })

  await app.mount('#app')

  const compEl = document.querySelector('my-counter')
  if (!compEl) fail('component element not mounted')

  const span = compEl.querySelector('span')
  if (!span) fail('span not found')
  if (span.textContent.trim() !== '2') fail(`expected initial 2, got ${span.textContent}`)

  const plus = compEl.querySelectorAll('button')[1]
  plus.dispatchEvent(new dom.window.Event('click'))

  // allow microtask
  await new Promise(r => setTimeout(r, 0))

  if (span.textContent.trim() !== '3') fail(`expected 3 after click, got ${span.textContent}`)

  // test store sharing
  const app2 = createApp({
    store: { sharedCount: 0 },
    components: {
      'inc-btn': {
        template: `<div><button @click="inc">inc</button></div>`,
        data(){ return {} },
        methods: { inc(){ this.$store.sharedCount = Number(this.$store.sharedCount || 0) + 1 } }
      },
      'show-count': {
        template: `<div>v: {{ $store.sharedCount }}</div>`,
        data(){ return {} },
        methods: {}
      }
    }
  })

  // attach new DOM
  const html2 = `<!doctype html><html><body><div id="app"><inc-btn></inc-btn><show-count></show-count></div></body></html>`
  const dom2 = new JSDOM(html2, { runScripts: 'outside-only' })
  global.window = dom2.window
  global.document = dom2.window.document
  global.HTMLElement = dom2.window.HTMLElement

  await app2.mount('#app')
  const inc = document.querySelector('inc-btn button')
  const show = document.querySelector('show-count')
  if (!inc || !show) fail('store demo elements missing')

  // show initially 0
  if (!show.textContent.includes('0')) fail('expected initial store 0 in display')

  inc.dispatchEvent(new dom2.window.Event('click'))
  // allow microtask
  await new Promise(r => setTimeout(r, 0))

  if (!show.textContent.includes('1')) fail('expected store to be 1 after click')

  console.log('All tests passed')
  process.exit(0)
}

run().catch(err => { console.error(err); process.exit(1) })
