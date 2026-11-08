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
  const distPath = path.join(__dirname, '..', 'dist', 'melodijs.js')
  const rootPath = path.join(__dirname, '..', 'melodijs.js')
  const targetFile = fs.existsSync(distPath) ? distPath : rootPath
  const modPath = pathToFileURL(targetFile).href

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

  // --- TEST Custom delimiters ---
  const domDelim = new JSDOM(`<!doctype html><html><body><div id="app">Hello [[ name ]]</div></body></html>`, { runScripts: 'outside-only' })
  global.window = domDelim.window
  global.document = domDelim.window.document
  global.HTMLElement = domDelim.window.HTMLElement
  const { createApp: createAppDelim } = await import(modPath)
  const appDelim = createAppDelim({
    delimiters: ['[[', ']]'],
    data() { return { name: 'Melodi' } }
  })
  await appDelim.mount('#app')
  if (!domDelim.window.document.getElementById('app').textContent.includes('Hello Melodi')) {
    fail('custom delimiters: expected "Hello Melodi" but got ' + domDelim.window.document.getElementById('app').textContent)
  }

  // --- TEST Event modifiers (@click.stop & @click.prevent) ---
  const domMod = new JSDOM(`<!doctype html><html><body><div id="app"><div id="parent" @click="parentClick"><button id="btn" @click.stop.prevent="btnClick">click</button></div></div></body></html>`, { runScripts: 'outside-only' })
  global.window = domMod.window
  global.document = domMod.window.document
  global.HTMLElement = domMod.window.HTMLElement
  let parentClicked = false
  let btnClicked = false
  const appMod = createAppDelim({
    data() { return {} },
    methods: {
      parentClick() { parentClicked = true },
      btnClick() { btnClicked = true }
    }
  })
  await appMod.mount('#app')
  const btnMod = domMod.window.document.getElementById('btn')
  btnMod.dispatchEvent(new domMod.window.Event('click', { bubbles: true, cancelable: true }))
  await new Promise(r => setTimeout(r, 0))
  if (!btnClicked) fail('event modifiers: button handler did not run')
  if (parentClicked) fail('event modifiers: @click.stop failed to stop propagation to parent')

  // --- TEST v-if / v-else with comment in between ---
  const domChain = new JSDOM(`<!doctype html><html><body><div id="app"><div v-if="ok">YES</div><!-- comment --><div v-else>NO</div></div></body></html>`, { runScripts: 'outside-only' })
  global.window = domChain.window
  global.document = domChain.window.document
  global.HTMLElement = domChain.window.HTMLElement
  const appChain = createAppDelim({
    data() { return { ok: false } }
  })
  await appChain.mount('#app')
  if (!domChain.window.document.getElementById('app').textContent.includes('NO')) {
    fail('conditional comment skip: expected v-else "NO" to render despite comment node')
  }

  // --- TEST Writable Computed (get/set object) ---
  const domComputed = new JSDOM(`<!doctype html><html><body><div id="app">Val: {{ double }}</div></body></html>`, { runScripts: 'outside-only' })
  global.window = domComputed.window
  global.document = domComputed.window.document
  global.HTMLElement = domComputed.window.HTMLElement
  const { createApp: createAppComputed } = await import(modPath)
  const appComputed = createAppComputed({
    data() { return { count: 5 } },
    computed: {
      double: {
        get() { return this.count * 2 },
        set(val) { this.count = val / 2 }
      }
    }
  })
  await appComputed.mount('#app')
  if (!domComputed.window.document.getElementById('app').textContent.includes('Val: 10')) {
    fail('writable computed: expected "Val: 10", got: ' + domComputed.window.document.getElementById('app').textContent)
  }
  appComputed.state.double = 50
  await new Promise(r => setTimeout(r, 0))
  if (appComputed.state.count !== 25) {
    fail('writable computed: expected count to be 25 after setter, got: ' + appComputed.state.count)
  }

  // --- TEST Top-level mounted() hook on components ---
  let mountedCalled = false
  const domMounted = new JSDOM(`<!doctype html><html><body><div id="app">Mounted test</div></body></html>`, { runScripts: 'outside-only' })
  global.window = domMounted.window
  global.document = domMounted.window.document
  global.HTMLElement = domMounted.window.HTMLElement
  const { createApp: createAppMounted } = await import(modPath)
  const appMounted = createAppMounted({
    data() { return { ok: true } },
    mounted() {
      mountedCalled = true
    }
  })
  await appMounted.mount('#app')
  if (!mountedCalled) {
    fail('top-level mounted: expected mounted() hook to be called on component mount')
  }

  // --- TEST v-html & v-text ---
  const domHtmlText = new JSDOM(`<!doctype html><html><body><div id="app"><div id="html-target" v-html="rawHtml"></div><div id="text-target" v-text="rawText"></div></div></body></html>`, { runScripts: 'outside-only' })
  global.window = domHtmlText.window
  global.document = domHtmlText.window.document
  global.HTMLElement = domHtmlText.window.HTMLElement
  const appHtmlText = createAppDelim({
    data() {
      return {
        rawHtml: '<strong id="bold-el">Hello <em>HTML</em></strong>',
        rawText: 'Simple & Plain Text'
      }
    }
  })
  await appHtmlText.mount('#app')
  const boldEl = domHtmlText.window.document.getElementById('bold-el')
  const textTarget = domHtmlText.window.document.getElementById('text-target')
  if (!boldEl || boldEl.textContent !== 'Hello HTML') {
    fail('v-html: HTML content not rendered properly')
  }
  if (!textTarget || textTarget.textContent !== 'Simple & Plain Text') {
    fail('v-text: text content not rendered properly')
  }
  // Reactive update
  appHtmlText.state.rawHtml = '<span>Updated HTML</span>'
  appHtmlText.state.rawText = 'Updated Text'
  await new Promise(r => setTimeout(r, 0))
  if (!domHtmlText.window.document.getElementById('html-target').innerHTML.includes('Updated HTML')) {
    fail('v-html: reactive update failed')
  }
  if (textTarget.textContent !== 'Updated Text') {
    fail('v-text: reactive update failed')
  }

  // --- TEST :class (array & object) & :style (object) ---
  const domClassStyle = new JSDOM(`<!doctype html><html><body><div id="app"><div id="styled-box" class="base-class" :class="[activeClass, { 'is-active': isActive, 'is-hidden': !isActive }]" :style="{ color: textColor, fontSize: '18px' }"></div></div></body></html>`, { runScripts: 'outside-only' })
  global.window = domClassStyle.window
  global.document = domClassStyle.window.document
  global.HTMLElement = domClassStyle.window.HTMLElement
  const appClassStyle = createAppDelim({
    data() {
      return {
        activeClass: 'pill',
        isActive: true,
        textColor: 'red'
      }
    }
  })
  await appClassStyle.mount('#app')
  const styledBox = domClassStyle.window.document.getElementById('styled-box')
  if (!styledBox) fail(':class/:style target missing')
  if (!styledBox.classList.contains('base-class') || !styledBox.classList.contains('pill') || !styledBox.classList.contains('is-active')) {
    fail(`:class array/object combination failed, got class: "${styledBox.getAttribute('class')}"`)
  }
  if (styledBox.classList.contains('is-hidden')) {
    fail(':class object condition false should not be present')
  }
  if (styledBox.style.color !== 'red' || styledBox.style.fontSize !== '18px') {
    fail(`:style object failed, got color: ${styledBox.style.color}, fontSize: ${styledBox.style.fontSize}`)
  }
  // Reactive update
  appClassStyle.state.isActive = false
  appClassStyle.state.textColor = 'blue'
  await new Promise(r => setTimeout(r, 0))
  if (styledBox.classList.contains('is-active') || !styledBox.classList.contains('is-hidden')) {
    fail(':class reactive update failed')
  }
  if (styledBox.style.color !== 'blue') {
    fail(':style reactive update failed')
  }

  // --- TEST Deep Reactivity & Nested v-model ---
  const domDeep = new JSDOM(`<!doctype html><html><body><div id="app"><input id="user-input" v-model="user.profile.name" /><span id="user-display">{{ user.profile.name }}</span><input id="num-input" v-model.number="price" /></div></body></html>`, { runScripts: 'outside-only' })
  global.window = domDeep.window
  global.document = domDeep.window.document
  global.HTMLElement = domDeep.window.HTMLElement
  const appDeep = createAppDelim({
    data() {
      return {
        user: {
          profile: {
            name: 'Alice'
          }
        },
        price: 42
      }
    }
  })
  await appDeep.mount('#app')
  const userInput = domDeep.window.document.getElementById('user-input')
  const userDisplay = domDeep.window.document.getElementById('user-display')
  const numInput = domDeep.window.document.getElementById('num-input')
  if (userInput.value !== 'Alice' || userDisplay.textContent !== 'Alice') {
    fail('nested v-model initial value failed')
  }
  // Change via deep assignment
  appDeep.state.user.profile.name = 'Bob'
  await new Promise(r => setTimeout(r, 0))
  if (userDisplay.textContent !== 'Bob' || userInput.value !== 'Bob') {
    fail('deep reactivity assignment failed')
  }
  // Change via DOM input
  userInput.value = 'Charlie'
  userInput.dispatchEvent(new domDeep.window.Event('input'))
  await new Promise(r => setTimeout(r, 0))
  if (appDeep.state.user.profile.name !== 'Charlie') {
    fail('nested v-model DOM-to-state update failed')
  }
  // Number modifier
  numInput.value = '99.5'
  numInput.dispatchEvent(new domDeep.window.Event('input'))
  await new Promise(r => setTimeout(r, 0))
  if (appDeep.state.price !== 99.5 || typeof appDeep.state.price !== 'number') {
    fail('v-model.number modifier failed to coerce to number')
  }

  // --- TEST Keyboard modifiers & $refs & nextTick ---
  const domKeyRefs = new JSDOM(`<!doctype html><html><body><div id="app"><input ref="textInput" @keyup.enter="handleEnter" /><button ref="btnOnce" @click.once="handleOnce">Click Once</button></div></body></html>`, { runScripts: 'outside-only' })
  global.window = domKeyRefs.window
  global.document = domKeyRefs.window.document
  global.HTMLElement = domKeyRefs.window.HTMLElement
  let enterPressed = false
  let onceCount = 0
  const appKeyRefs = createAppDelim({
    data() { return {} },
    methods: {
      handleEnter() { enterPressed = true },
      handleOnce() { onceCount++ }
    }
  })
  await appKeyRefs.mount('#app')
  // Test $refs
  if (!appKeyRefs.state.$refs || !appKeyRefs.state.$refs.textInput) {
    fail('$refs: textInput ref missing')
  }
  if (!appKeyRefs.state.$refs.btnOnce) {
    fail('$refs: btnOnce ref missing')
  }
  // Test keyboard event modifier
  const textInputEl = appKeyRefs.state.$refs.textInput
  textInputEl.dispatchEvent(new domKeyRefs.window.KeyboardEvent('keyup', { key: 'a' }))
  await new Promise(r => setTimeout(r, 0))
  if (enterPressed) fail('@keyup.enter triggered on wrong key "a"')
  textInputEl.dispatchEvent(new domKeyRefs.window.KeyboardEvent('keyup', { key: 'Enter' }))
  await new Promise(r => setTimeout(r, 0))
  if (!enterPressed) fail('@keyup.enter failed to trigger on "Enter"')

  // Test @click.once
  const btnOnceEl = appKeyRefs.state.$refs.btnOnce
  btnOnceEl.dispatchEvent(new domKeyRefs.window.Event('click'))
  btnOnceEl.dispatchEvent(new domKeyRefs.window.Event('click'))
  await new Promise(r => setTimeout(r, 0))
  if (onceCount !== 1) {
    fail(`@click.once expected to be called 1 time, but called ${onceCount} times`)
  }

  // Test $nextTick
  let tickExecuted = false
  await appKeyRefs.state.$nextTick(() => {
    tickExecuted = true
  })
  if (!tickExecuted) fail('$nextTick callback failed to execute')

  // --- TEST Router Navigation Progress & Lifecycle Events ---
  const routerDistPath = path.join(__dirname, '..', 'dist', 'router.js')
  const routerModPath = pathToFileURL(routerDistPath).href
  const { MelodiRouter } = await import(routerModPath)

  const domRouter = new JSDOM(
    `<!doctype html><html><head></head><body><div id="app"><nav><router-link id="link-about" to="/about">About</router-link></nav><router-view></router-view></div></body></html>`,
    { url: 'http://localhost/#/', runScripts: 'outside-only' }
  )
  global.window = domRouter.window
  global.document = domRouter.window.document
  global.HTMLElement = domRouter.window.HTMLElement

  const navEvents = []
  let afterEachCalls = 0
  let asyncGuardDelay = 0
  let cancelNextNav = false
  let throwInNextNav = false

  const HomeComp = { template: '<div id="page-home">Home Page</div>' }
  const AboutComp = { template: '<div id="page-about">About Page</div>' }
  const AsyncComp = () => new Promise(resolve => {
    setTimeout(() => {
      resolve({ template: '<div id="page-async">Async Loaded Page</div>' })
    }, 30)
  })
  const SlowComp = () => new Promise(resolve => {
    setTimeout(() => {
      resolve({ template: '<div id="page-slow">Slow Page</div>' })
    }, 80)
  })
  const FastComp = { template: '<div id="page-fast">Fast Page</div>' }

  const router = new MelodiRouter({
    routes: [
      { path: '/', component: HomeComp },
      { path: '/about', component: AboutComp },
      { path: '/async', component: AsyncComp },
      { path: '/slow', component: SlowComp },
      { path: '/fast', component: FastComp }
    ],
    progress: {
      color: '#ff0000',
      height: '3px',
      speed: 40,
      trickleSpeed: 15,
      showSpinner: false
    }
  })

  router.on('navigation:start', (e) => navEvents.push({ type: 'start', to: e.to, from: e.from, id: e.navigationId }))
  router.on('navigation:complete', (e) => navEvents.push({ type: 'complete', to: e.to, from: e.from, id: e.navigationId }))
  router.on('navigation:cancelled', (e) => navEvents.push({ type: 'cancelled', to: e.to, reason: e.reason, id: e.navigationId }))
  router.on('navigation:error', (e) => navEvents.push({ type: 'error', to: e.to, error: e.error, id: e.navigationId }))
  router.afterEach(() => { afterEachCalls++ })

  router.beforeEach((to, from, next) => {
    if (throwInNextNav) {
      throwInNextNav = false
      throw new Error('Guard Failure')
    }
    if (cancelNextNav) {
      cancelNextNav = false
      next(false)
      return
    }
    if (asyncGuardDelay > 0) {
      const d = asyncGuardDelay
      asyncGuardDelay = 0
      setTimeout(() => next(), d)
    } else {
      next()
    }
  })

  const appRouter = createAppDelim({ data() { return {} } })
  appRouter.use(router)
  await appRouter.mount('#app')
  await new Promise(r => setTimeout(r, 10))

  if (!domRouter.window.document.getElementById('page-home')) {
    fail('router: initial Home component failed to mount')
  }

  // 1. Test navigation via <router-link> + async guard progress trickle
  asyncGuardDelay = 45
  const linkAbout = domRouter.window.document.querySelector('#link-about a')
  linkAbout.dispatchEvent(new domRouter.window.Event('click', { bubbles: true, cancelable: true }))

  // Immediately after navigation starts, progress bar should be active and in DOM
  const progressContainer = domRouter.window.document.querySelector('.melodi-progress')
  const progressBar = domRouter.window.document.querySelector('.melodi-progress-bar')
  if (!progressContainer || !progressBar) {
    fail('router progress: .melodi-progress or .melodi-progress-bar not created in DOM')
  }
  if (!router.progress.isActive) {
    fail('router progress: expected isActive=true during async guard')
  }
  if (progressContainer.style.height !== '3px') {
    fail(`router progress: expected custom height 3px, got ${progressContainer.style.height}`)
  }
  if (domRouter.window.document.querySelector('.melodi-progress-spinner')) {
    fail('router progress: spinner should not be rendered when showSpinner is false')
  }

  const initialStatus = router.progress.status
  await new Promise(r => setTimeout(r, 25))
  const midStatus = router.progress.status
  if (!(midStatus > initialStatus)) {
    fail(`router progress: expected progressive trickle (${midStatus} > ${initialStatus})`)
  }

  // Wait for navigation and mount to complete
  await new Promise(r => setTimeout(r, 50))
  if (router.progress.isActive) {
    fail('router progress: expected isActive=false after navigation completes')
  }
  if (!domRouter.window.document.getElementById('page-about')) {
    fail('router: About component not mounted after navigation')
  }

  // 2. Test async component loading (waits for component loader + mount before completing progress & scrolling)
  let scrollCalls = 0
  domRouter.window.scrollTo = () => { scrollCalls++ }
  // Simulate non-jsdom userAgent temporarily to verify _applyScroll timing
  const origUA = domRouter.window.navigator.userAgent
  Object.defineProperty(domRouter.window.navigator, 'userAgent', { value: 'Mozilla/5.0 Chrome', configurable: true })

  router.push('/async')
  if (!router.progress.isActive) {
    fail('router progress: should be active while async component is loading')
  }
  if (scrollCalls !== 0) {
    fail('router scroll: window.scrollTo must NOT be called before async route component finishes mounting')
  }
  if (domRouter.window.location.hash === '#/async') {
    fail('router url: URL hash should not mutate before async guard/component commits')
  }
  await new Promise(r => setTimeout(r, 50))
  if (router.progress.isActive) {
    fail('router progress: should be done after async component finishes mounting')
  }
  if (!domRouter.window.document.getElementById('page-async')) {
    fail('router: Async component failed to mount')
  }
  if (scrollCalls !== 1) {
    fail(`router scroll: expected window.scrollTo to be called once after mount, got ${scrollCalls}`)
  }
  Object.defineProperty(domRouter.window.navigator, 'userAgent', { value: origUA, configurable: true })

  // 3. Test explicit cancellation via next(false)
  cancelNextNav = true
  router.push('/about')
  if (router.progress.isActive) {
    fail('router progress: should stop immediately when guard calls next(false)')
  }
  if (router.currentRoute() !== '/async') {
    fail(`router: route should remain '/async' after cancelled navigation, got '${router.currentRoute()}'`)
  }
  const cancelledGuardEvent = navEvents.find(e => e.type === 'cancelled' && e.reason === 'guard')
  if (!cancelledGuardEvent) {
    fail('router events: expected navigation:cancelled with reason="guard"')
  }

  // 4. Test concurrent / rapid successive navigations (slow '/slow' superseded by fast '/fast')
  router.push('/slow')
  const slowNavActive = router.progress.isActive
  if (!slowNavActive) fail('router progress: expected active on /slow start')
  await new Promise(r => setTimeout(r, 15))
  // Before '/slow' finishes (takes 80ms), navigate to '/fast'
  router.push('/fast')
  await new Promise(r => setTimeout(r, 15))
  if (router.currentRoute() !== '/fast' || !domRouter.window.document.getElementById('page-fast')) {
    fail('router concurrency: /fast should be active and mounted')
  }
  // Wait for '/slow' promise to resolve in background (80ms total) and verify it does NOT overwrite '/fast'
  await new Promise(r => setTimeout(r, 85))
  if (router.currentRoute() !== '/fast' || !domRouter.window.document.getElementById('page-fast')) {
    fail('router concurrency: stale /slow navigation overwrote newer /fast navigation!')
  }
  const supersededEvent = navEvents.find(e => e.type === 'cancelled' && e.to === '/slow' && e.reason === 'superseded')
  if (!supersededEvent) {
    fail('router concurrency: expected navigation:cancelled with reason="superseded" for /slow')
  }

  // 5. Test error handling in navigation
  throwInNextNav = true
  router.push('/about')
  const errorEvent = navEvents.find(e => e.type === 'error' && e.to === '/about')
  if (!errorEvent) {
    fail('router error: expected navigation:error event when guard throws')
  }
  if (!progressContainer.classList.contains('melodi-progress-error')) {
    fail('router error: expected .melodi-progress-error class on failure')
  }

  // 6. Test no-op navigation to same route & dynamic configuration (showSpinner + className)
  const eventsBeforeNoop = navEvents.length
  router.push('/fast')
  if (navEvents.length !== eventsBeforeNoop || router.progress.isActive) {
    fail('router no-op: navigating to current route should not start a redundant navigation')
  }

  router.progress.configure({ showSpinner: true, className: 'custom-yt-bar', color: '#00ff88' })
  router.progress.start()
  if (!domRouter.window.document.querySelector('.melodi-progress-spinner')) {
    fail('router progress: expected spinner when showSpinner=true')
  }
  if (!progressContainer.classList.contains('custom-yt-bar')) {
    fail('router progress: expected custom className on container')
  }
  router.progress.done()

  // 7. Test browser history hashchange navigation
  domRouter.window.location.hash = '/about'
  domRouter.window.dispatchEvent(new domRouter.window.Event('hashchange'))
  await new Promise(r => setTimeout(r, 15))
  if (router.currentRoute() !== '/about' || !domRouter.window.document.getElementById('page-about')) {
    fail('router hashchange: failed to navigate on browser hashchange event')
  }

  // 8. Test cleanup via router.destroy()
  router.destroy()
  if (domRouter.window.document.querySelector('.melodi-progress')) {
    fail('router destroy: .melodi-progress element should be removed from DOM on destroy()')
  }

  // 9. Test progress: false option
  const disabledRouter = new MelodiRouter({
    routes: [{ path: '/', component: HomeComp }, { path: '/about', component: AboutComp }],
    progress: false
  })
  disabledRouter.progress.start()
  if (domRouter.window.document.querySelector('.melodi-progress')) {
    fail('router progress: false should not create progress DOM elements')
  }

  console.log('All tests passed')
  process.exit(0)
}

run().catch(err => { console.error(err); process.exit(1) })
