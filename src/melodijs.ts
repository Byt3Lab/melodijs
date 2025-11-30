// --- Fine-grain reactivity primitives regroupées ---

type SignalRead<T> = () => T;
type SignalWrite<T> = (next: T) => void;
type EffectFn = () => void | (() => void);
type CleanupFn = () => void;
type WatchCallback = (this: any, newVal: any, oldVal: any) => void;

interface WatchOptions {
    handler: WatchCallback;
    immediate?: boolean;
    deep?: boolean;
}

export interface MelodiOptions {
    // Legacy: component registry
    components?: Record<string, ComponentDef>;
    store?: Record<string, any>;

    // Root component options (Vue-like)
    data?: () => Record<string, any>;
    methods?: Record<string, (this: any, ...args: any[]) => any>;
    computed?: Record<string, (this: any) => any>;
    watch?: Record<string, WatchCallback | WatchOptions>;
    template?: string | { el?: string; url?: string };
}

export interface ComponentDef {
    template?: string | { el?: string; url?: string };
    data?: () => Record<string, any>;
    methods?: Record<string, (this: any, ...args: any[]) => any>;
    props?: string[] | Record<string, PropDef>;
    hooks?: Record<string, (this: any) => void>;
    components?: Record<string, ComponentDef>;
    computed?: Record<string, (this: any) => any>;
    watch?: Record<string, WatchCallback | WatchOptions>;
}

export interface PropDef {
    type?: any;
    default?: any;
}

// Réactivité fine-grain par instance d’application
class MelodiReactive {
    private _currentEffect: EffectFn | null;

    constructor() {
        this._currentEffect = null;
    }
    createSignal<T>(value: T): [SignalRead<T>, SignalWrite<T>] {
        let v = value;
        const subscribers = new Set<EffectFn>();
        const self = this;
        function read(): T {
            if (self._currentEffect) subscribers.add(self._currentEffect);
            return v;
        }
        function write(next: T): void {
            // For primitives, use strict equality
            // For objects/arrays (including Proxies), always trigger to catch mutations
            const isPrimitive = next === null || (typeof next !== 'object' && typeof next !== 'function');
            if (isPrimitive && v === next) return;

            v = next;
            subscribers.forEach(fn => {
                if (typeof fn === 'function') fn();
            });
        }
        return [read, write];
    }
    createEffect(fn: EffectFn): CleanupFn {
        const self = this;
        function effect() {
            self._currentEffect = effect;
            try { fn(); } finally { self._currentEffect = null; }
        }
        effect();
        // Return a dispose function (basic implementation)
        return () => {
            // In a full implementation, we would remove 'effect' from all signals it subscribed to.
            // For this lightweight version, we can't easily remove from signals without double-linking.
            // But we can at least flag it to not run anymore if we wrap it.
            // For now, this is a placeholder for the API.
            // To do it properly requires changing createSignal to return a unsubscribe.
        }
    }
    // Improved createEffect with cleanup support
    createEffectWithCleanup(fn: () => CleanupFn | void): CleanupFn {
        const self = this;
        let cleanup: CleanupFn | null | void = null;
        const execute = () => {
            self._currentEffect = execute;
            try {
                if (cleanup && typeof cleanup === 'function') cleanup();
                cleanup = fn();
            } finally {
                self._currentEffect = null;
            }
        };
        execute();
        return () => {
            if (cleanup && typeof cleanup === 'function') cleanup();
        }
    }

    createMemo<T>(fn: () => T): SignalRead<T> {
        const [read, write] = this.createSignal<T>(undefined as unknown as T);
        this.createEffect(() => {
            write(fn());
        });
        return read;
    }
}

export interface Plugin {
    install: (app: MelodiJS, options?: any) => void;
}

// Minimal reactive component library (tiny Vue-like)

class MelodiJS {
    options: MelodiOptions;
    root: Element | null;
    components: Record<string, ComponentDef>;
    _mountedComponents: Component[];
    reactivity: MelodiReactive;
    store: any;
    _plugins: Set<Plugin>;

    constructor(options: MelodiOptions) {
        this.options = options || {}
        this.root = null
        this.components = this.options.components || {}
        this._mountedComponents = []
        this.reactivity = new MelodiReactive();
        // Store is now fine-grained reactive
        this.store = this._makeReactiveStore(this.options.store || {})
        this._plugins = new Set();

        // Register built-in components
        this.components['transition'] = {
            props: ['name'],
            template: '<div :data-melodi-transition="name"><slot></slot></div>'
        };
    }

    use(plugin: Plugin, options?: any): this {
        if (this._plugins.has(plugin)) {
            console.warn('Plugin has already been installed.');
            return this;
        }
        this._plugins.add(plugin);
        plugin.install(this, options);
        return this;
    }

    mount(target: string | Element): Promise<any[]> {
        this.root = typeof target === 'string' ? document.querySelector(target) : target
        if (!this.root) throw new Error('Mount target not found')

        const promises: Promise<any>[] = []

        // Check if this is a root component app (Vue-like)
        const isRootComponent = !!(this.options.data || this.options.methods || this.options.computed || this.options.watch || this.options.template);

        if (isRootComponent) {
            // Create and mount a root component
            const rootComponentDef: ComponentDef = {
                data: this.options.data,
                methods: this.options.methods,
                computed: this.options.computed,
                watch: this.options.watch,
                template: this.options.template,
                components: this.components  // Use this.components which includes plugin-registered components
            };

            const rootComp = new Component(rootComponentDef);
            const p = rootComp.mount(this.root, this).then(() => {
                (this.root as any).__melodijs_mounted = true;
                (this.root as any).__melodijs_root = rootComp;
            });
            promises.push(p);
        } else {
            // Legacy mode: mount registered components
            const tags = Object.keys(this.components)
            Object.keys(this.components).forEach(tag => {
                if (!this.root) return;
                const nodes = Array.from(this.root.querySelectorAll(tag))
                nodes.forEach(node => {
                    if ((node as any).__melodijs_mounted) return
                    if (this._isDescendantOfCustom(node, tags)) return
                    const compDef = this.components[tag]
                    const comp = new Component(compDef)
                    const p = comp.mount(node, this).then(() => { (node as any).__melodijs_mounted = true })
                    promises.push(p)
                })
            })
        }

        return Promise.all(promises)
    }

    _isDescendantOfCustom(node: Element, customTags: string[]): boolean {
        let p = node.parentElement
        while (p) {
            const tag = p.tagName && p.tagName.toLowerCase()
            if (tag && customTags.indexOf(tag) !== -1) return true
            p = p.parentElement
        }
        return false
    }

    _makeReactiveStore(initial: Record<string, any>): any {
        // Use the same logic as Component._makeReactive but for the store
        const state: any = {};
        for (const key of Object.keys(initial)) {
            const [getter, setter] = this.reactivity.createSignal(initial[key]);
            Object.defineProperty(state, key, {
                get: getter,
                set: setter,
                enumerable: true,
                configurable: true
            });
        }
        return state;
    }
}

export class Component {
    template: string | { el?: string; url?: string };
    dataFn: (this: any) => Record<string, any>;
    methodsDef: Record<string, (this: any, ...args: any[]) => any>;
    propsDef: string[] | Record<string, PropDef> | null;
    hooks: Record<string, (this: any) => void>;
    components: Record<string, ComponentDef>;
    computedDef: Record<string, (this: any) => any>;
    watchDef: Record<string, WatchCallback | WatchOptions>;

    el: Element | null;
    app: MelodiJS | null;
    state: any;
    methods: Record<string, Function>;
    _listeners: { node: Element; ev: string; fn: EventListener }[];
    _effects: CleanupFn[]; // Track effects for cleanup
    _events: Record<string, Function[]>;
    _slotSource: Element | null = null;
    _fragment: DocumentFragment | null = null;
    _postMountEffects: (() => void)[] = [];
    _signals: Record<string, [SignalRead<any>, SignalWrite<any>]> = {};
    reactivity: MelodiReactive | null = null;
    _parent: Component | null = null;

    constructor(def: ComponentDef) {
        this.template = def.template || ''
        this.dataFn = def.data || function () { return {} }
        this.methodsDef = def.methods || {}
        // props can be an array of names or an object with detailed defs
        this.propsDef = def.props || null
        // lifecycle hooks: prefer explicit hooks, fallback to methods (migrated below)
        this.hooks = def.hooks || {}
        this.components = def.components || {}
        this.computedDef = def.computed || {}
        this.watchDef = def.watch || {}

        this.el = null
        this.app = null
        this.state = null
        this.methods = {}
        this._listeners = []
        this._effects = [] // Track effects for cleanup
        this._events = {}
    }

    mount(el: Element, app: MelodiJS): Promise<boolean> {
        this.el = el
        this.app = app
        try { console.debug && console.debug('Component.mount start for', el && el.tagName) } catch (e) { }

        // capture the light DOM (children) to support <slot>
        // move original children into a detached container so we can re-read on every render
        try {
            this._slotSource = document.createElement('div')
            while (el.firstChild) { this._slotSource.appendChild(el.firstChild) }
        } catch (e) { this._slotSource = document.createElement('div') }

        // obtain props from element attributes
        const props = this._readPropsFromEl(el)

        // (lifecycle hooks should be provided in `hooks` or top-level keys in component def)

        // initialize data and merge props (props override) but only pass declared props
        const initial = this.dataFn.call(props) || {}
        // only include declared props
        const declared = this._gatherDeclaredProps()
        if (declared) {
            Object.keys(declared).forEach(key => {
                const def = declared[key]
                if (props.hasOwnProperty(key)) {
                    initial[key] = this._coercePropValue(props[key], def)
                } else if (def && def.hasOwnProperty('default')) {
                    initial[key] = (typeof def.default === 'function') ? def.default() : def.default
                }
            })
        } else {
            Object.assign(initial, props)
        }

        // attach $store to raw data so methods/state can access it
        initial.$store = app.store

        // Inject router BEFORE creating reactive state (so computed can access it)
        if ((app as any).router) {
            initial.$router = (app as any).router;
        }

        // create reactive state
        this.reactivity = app.reactivity;
        this.state = this._makeReactive(initial)

        // inject references into state for convenience (element, app, root)
        try { this.state.__lastEl = this.el; this.state.__slotSourceEl = this.el; this.state.$app = app; this.state.$root = document } catch (e) { }

        // event API helpers available on state
        try {
            const comp = this
            // register event listener on this component
            this.state.$on = function (eventName: string, handler: Function) {
                if (!eventName || typeof handler !== 'function') return
                comp._events[eventName] = comp._events[eventName] || []
                comp._events[eventName].push(handler)
                // return unregister
                return () => {
                    const arr = comp._events[eventName] || []
                    const idx = arr.indexOf(handler)
                    if (idx !== -1) arr.splice(idx, 1)
                }
            }
            // emit event: call local handlers, then bubble up to ancestor components
            this.state.$emit = function (eventName: string, payload: any) {
                try {
                    const local = comp._events[eventName] || []
                    local.forEach(h => { try { h.call(comp.state, payload) } catch (e) { } })
                    // bubble
                    // first try DOM parent chain
                    let p = comp.el!.parentElement
                    while (p) {
                        const parentComp = (p as any).__melodijs_instance as Component
                        if (parentComp) {
                            const handlers = parentComp._events[eventName] || []
                            handlers.forEach(h => { try { h.call(parentComp.state, payload) } catch (e) { } })
                            // stop if handled? keep bubbling to allow multiple ancestors
                        }
                        p = p.parentElement
                    }
                    // also support logical parent chain (set when mounting nested components)
                    try {
                        let lp = comp._parent
                        while (lp) {
                            const handlers = lp._events[eventName] || []
                            handlers.forEach(h => { try { h.call(lp!.state, payload) } catch (e) { } })
                            lp = lp._parent
                        }
                    } catch (e) { }
                } catch (e) { }
            }
        } catch (e) { }

        // bind methods to state
        try {
            // debug: ensure methodsDef is iterable
            // console.debug('binding methodsDef', Object.keys(this.methodsDef || {}))
            Object.keys(this.methodsDef || {}).forEach(name => {
                this.methods[name] = this.methodsDef[name].bind(this.state)
            })
            // expose methods directly on state so methods can call each other via `this.someMethod()`
            Object.keys(this.methods).forEach(name => {
                try { this.state[name] = this.methods[name] } catch (e) { }
            })
        } catch (e) {
            console.error('Error binding methods:', e)
        }

        // Setup watchers
        try {
            Object.keys(this.watchDef).forEach(key => {
                const watchSpec = this.watchDef[key];
                let handler: WatchCallback;
                let immediate = false;
                let deep = false;

                if (typeof watchSpec === 'function') {
                    handler = watchSpec;
                } else {
                    handler = watchSpec.handler;
                    immediate = watchSpec.immediate || false;
                    deep = watchSpec.deep || false;
                }

                // Bind handler to state
                const boundHandler = handler.bind(this.state);

                // Get the signal for this property
                const signal = this._signals[key];
                if (!signal) {
                    console.warn(`Watch: property '${key}' not found in data`);
                    return;
                }

                const [getter] = signal;
                let oldValue = getter();
                let isFirstRun = true;

                // Create effect to watch changes
                this._createEffect(() => {
                    const newValue = getter();

                    // Skip first run unless immediate is true
                    if (isFirstRun) {
                        isFirstRun = false;
                        if (immediate) {
                            try {
                                boundHandler(newValue, undefined);
                            } catch (e) {
                                console.error(`Error in immediate watcher for '${key}':`, e);
                            }
                        }
                        oldValue = newValue;
                        return;
                    }

                    // Only trigger if value actually changed
                    if (newValue !== oldValue || deep) {
                        const prevValue = oldValue;
                        oldValue = newValue;
                        // Call handler with new and old values
                        try {
                            boundHandler(newValue, prevValue);
                        } catch (e) {
                            console.error(`Error in watcher for '${key}':`, e);
                        }
                    }
                });
            });
        } catch (e) {
            console.error('Error setting up watchers:', e);
        }

        // register component on app so store updates can notify
        app._mountedComponents = app._mountedComponents || []
        app._mountedComponents.push(this)

        // mark instance on element for parent-child lookup
        try { (this.el as any).__melodijs_instance = this } catch (e) { }

        // initial render (handle async template resolution)
        return this._render(true)
    }

    _readPropsFromEl(el: Element): Record<string, any> {
        const props: Record<string, any> = {}
        Array.from(el.attributes).forEach(attr => {
            // ignore special attributes
            if (/^v-|^@|^:/.test(attr.name)) return
            // only include declared props if propsDef exists
            const name = attr.name
            const declared = this._gatherDeclaredProps()
            if (declared) {
                if (declared.hasOwnProperty(name)) {
                    props[name] = this._coerceAttrValue(attr.value)
                }
            } else {
                props[name] = this._coerceAttrValue(attr.value)
            }
        })
        return props
    }

    _coerceAttrValue(val: string): any {
        // try number and boolean coercion
        if (val === 'true') return true
        if (val === 'false') return false
        if (!isNaN(val as any) && val.trim() !== '') return Number(val)
        return val
    }

    _gatherDeclaredProps(): Record<string, PropDef> | null {
        // returns an object map of propName -> def (if array provided, returns names with undefined defs)
        if (!this.propsDef) return null
        if (Array.isArray(this.propsDef)) {
            const out: Record<string, PropDef> = {}
            this.propsDef.forEach(n => out[n] = {})
            return out
        }
        // assume object
        return this.propsDef
    }

    _coercePropValue(val: any, def: PropDef): any {
        if (!def || !def.type) return val
        const t = def.type
        if (t === Number) return Number(val)
        if (t === Boolean) return (val === '' || val === true || val === 'true')
        if (t === String) return String(val)
        return val
    }

    // Fine-grain reactivity: wrap each property in a signal
    _makeReactive(obj: any): any {
        const state: any = {};
        this._signals = {};
        if (!this.reactivity) return state; // Should not happen
        for (const key of Object.keys(obj)) {
            const initialValue = obj[key];
            const [getter, setter] = this.reactivity.createSignal(initialValue);

            // Wrap arrays in a Proxy to intercept mutations
            if (Array.isArray(initialValue)) {
                const proxyArray = this._makeReactiveArray(initialValue, setter);
                setter(proxyArray);
                Object.defineProperty(state, key, {
                    get: getter,
                    set: (newVal) => {
                        if (Array.isArray(newVal)) {
                            setter(this._makeReactiveArray(newVal, setter));
                        } else {
                            setter(newVal);
                        }
                    },
                    enumerable: true,
                    configurable: true
                });
            } else {
                Object.defineProperty(state, key, {
                    get: getter,
                    set: setter,
                    enumerable: true,
                    configurable: true
                });
            }
            this._signals[key] = [getter, setter];
        }

        // Initialize computed properties
        if (this.computedDef) {
            Object.keys(this.computedDef).forEach(key => {
                const fn = this.computedDef[key].bind(state);
                const memo = this.reactivity!.createMemo(fn);
                Object.defineProperty(state, key, {
                    get: memo,
                    enumerable: true,
                    configurable: true
                });
            });
        }

        return state;
    }

    _makeReactiveArray(arr: any[], setter: SignalWrite<any>): any[] {
        const mutatingMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];

        const proxy = new Proxy(arr, {
            get(target, prop) {
                const value = (target as any)[prop];

                // Intercept mutating methods
                if (typeof prop === 'string' && mutatingMethods.includes(prop)) {
                    return function (...args: any[]) {
                        const result = (Array.prototype as any)[prop].apply(target, args);
                        // Trigger reactivity - setter will always trigger for objects
                        setter(proxy);
                        return result;
                    };
                }

                return value;
            },
            set(target, prop, value) {
                (target as any)[prop] = value;
                // Trigger reactivity on index assignment
                setter(proxy);
                return true;
            }
        });

        return proxy;
    }

    _evalExpression(expr: string, scope: any): any {
        // Evaluate JS expressions with access to state (getters on `this.state` will register effects)
        try {
            if (!expr || typeof expr !== 'string') return '';
            const expression = expr.trim();
            const fn = new Function('state', 'scope', 'with(state){ with(scope || {}){ try { return (' + expression + ') } catch(e){ return "" } } }');
            const res = fn(this.state || {}, scope || {});
            return (res === undefined || res === null) ? '' : res;
        } catch (e) {
            return '';
        }
    }

    // --- Fine-grained DOM Creation & Update ---

    async _render(isInitial: boolean): Promise<boolean> {
        if (isInitial) {
            this._postMountEffects = []; // Queue for effects that need parentNode

            // 1. Compile: Create the initial DOM structure from template
            await this._compile();

            // 2. Mount hooks
            try { if (typeof this.hooks.beforeMount === 'function') this.hooks.beforeMount.call(this.state); } catch (e) { }

            // 3. Append to DOM
            if (this.el && this._fragment) {
                this.el.appendChild(this._fragment);
            }

            // 4. Run post-mount effects (v-if, v-for) now that parentNodes exist
            this._postMountEffects.forEach(fn => fn());
            this._postMountEffects = []; // Clear queue

            // 5. Mount nested components
            await this._mountNestedComponents();

            try { if (typeof this.hooks.mounted === 'function') this.hooks.mounted.call(this.state); } catch (e) { }
        }
        return true;
    }

    async _compile(): Promise<void> {
        // Get template string
        let tpl: string | { el?: string; url?: string } = this.template;
        let tempDiv: HTMLDivElement;

        if (!tpl) {
            // If no template, use the slot source (which contains the original HTML)
            // This allows root components to work without explicit template
            if (this._slotSource && this._slotSource.childNodes.length > 0) {
                this._fragment = this._processNodeList(Array.from(this._slotSource.childNodes));
            } else {
                // Completely empty
                this._fragment = document.createDocumentFragment();
            }
        } else {
            // If template string provided
            if (typeof tpl === 'object') {
                if (tpl.el) {
                    const node = document.querySelector(tpl.el);
                    tpl = node ? node.innerHTML : '';
                } else if (tpl.url) {
                    try {
                        const resp = await fetch(tpl.url);
                        tpl = await resp.text();
                    } catch (e) { tpl = ''; }
                }
            }

            tempDiv = document.createElement('div');
            tempDiv.innerHTML = (tpl as string) || '';

            // --- Slot Distribution ---
            if (this._slotSource) {
                const slotEls = Array.from(tempDiv.querySelectorAll('slot'));
                slotEls.forEach(slotEl => {
                    const name = slotEl.getAttribute('name');
                    let inserted = false;
                    const fragment = document.createDocumentFragment();

                    if (name) {
                        // Named slot
                        const nodes = Array.from(this._slotSource!.querySelectorAll('[slot="' + name + '"]'));
                        if (nodes.length) {
                            nodes.forEach(n => fragment.appendChild(n.cloneNode(true)));
                            inserted = true;
                        }
                    } else {
                        // Default slot
                        const nodes = Array.from(this._slotSource!.childNodes).filter(n => {
                            return !(n.nodeType === 1 && (n as Element).hasAttribute && (n as Element).hasAttribute('slot'));
                        });
                        if (nodes.length) {
                            nodes.forEach(n => fragment.appendChild(n.cloneNode(true)));
                            inserted = true;
                        }
                    }

                    if (inserted) {
                        if (slotEl.parentNode) slotEl.parentNode.replaceChild(fragment, slotEl);
                    } else {
                        // Fallback content: keep what's inside the slot tag, but unwrap the slot tag itself?
                        // Usually <slot>fallback</slot> -> fallback
                        // We need to replace <slot> with its children.
                        while (slotEl.firstChild) {
                            if (slotEl.parentNode) slotEl.parentNode.insertBefore(slotEl.firstChild, slotEl);
                        }
                        if (slotEl.parentNode) slotEl.parentNode.removeChild(slotEl);
                    }
                });
            }

            this._fragment = this._processNodeList(Array.from(tempDiv.childNodes));
            if (this.el) this.el.innerHTML = ''; // Clear host element
        }
    }

    _processNodeList(nodes: NodeListOf<ChildNode> | Node[], scope: any = {}): DocumentFragment {
        const fragment = document.createDocumentFragment();
        Array.from(nodes).forEach(node => {
            const processed = this._walk(node, scope);
            if (Array.isArray(processed)) {
                processed.forEach(n => fragment.appendChild(n));
            } else if (processed) {
                fragment.appendChild(processed);
            }
        });
        return fragment;
    }

    _walk(node: Node, scope: any): Node | DocumentFragment {
        // 1. Handle Text Nodes (Interpolation)
        if (node.nodeType === 3) {
            const text = node.nodeValue || '';
            if (text.trim() === '') return node.cloneNode(true);

            const parts = text.split(/(\{\{[^}]+\}\})/g);
            if (parts.length > 1) {
                const frag = document.createDocumentFragment();
                parts.forEach(part => {
                    const m = part.match(/^\{\{\s*([^}]+)\s*\}\}$/);
                    if (m) {
                        const expr = m[1];
                        const textNode = document.createTextNode('');
                        this._createEffect(() => {
                            const val = this._evalExpression(expr, scope);
                            textNode.nodeValue = (val === undefined || val === null) ? '' : String(val);
                        });
                        frag.appendChild(textNode);
                    } else {
                        frag.appendChild(document.createTextNode(part));
                    }
                });
                return frag;
            }
            return node.cloneNode(true);
        }

        // 2. Handle Elements
        if (node.nodeType === 1) {
            const elNode = node as Element;
            // Check for v-pre
            if (elNode.hasAttribute('v-pre')) {
                const clone = elNode.cloneNode(true) as Element;
                clone.removeAttribute('v-pre');
                return clone;
            }

            // Check for v-if
            if (elNode.hasAttribute('v-if')) {
                return this._handleVIf(elNode, scope);
            }

            // Check for v-for
            if (elNode.hasAttribute('v-for')) {
                return this._handleVFor(elNode, scope);
            }

            // Clone element
            const el = elNode.cloneNode(false) as HTMLElement;

            // Handle v-show
            if (el.hasAttribute('v-show')) {
                const expr = el.getAttribute('v-show')!;
                el.removeAttribute('v-show');
                this._createEffect(() => {
                    const show = !!this._evalExpression(expr, scope);
                    el.style.display = show ? '' : 'none';
                });
            }

            // Handle v-model
            if (el.hasAttribute('v-model')) {
                const prop = el.getAttribute('v-model')!.trim();
                el.removeAttribute('v-model');

                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                    const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
                    // Two-way binding
                    // 1. Model -> View
                    this._createEffect(() => {
                        const val = this.state[prop];
                        if (inputEl.type === 'checkbox') {
                            (inputEl as HTMLInputElement).checked = !!val;
                        } else {
                            inputEl.value = (val == null) ? '' : val;
                        }
                    });

                    // 2. View -> Model
                    const handler = (e: Event) => {
                        const val = (inputEl.type === 'checkbox') ? (inputEl as HTMLInputElement).checked : inputEl.value;
                        this.state[prop] = val;
                    };
                    el.addEventListener('input', handler);
                    // Also listen to change for some inputs
                    if (el.tagName === 'SELECT' || (inputEl as HTMLInputElement).type === 'checkbox' || (inputEl as HTMLInputElement).type === 'radio') {
                        el.addEventListener('change', handler);
                    }
                    this._listeners.push({ node: el, ev: 'input', fn: handler });
                }
            }

            // Handle Attributes & Events
            Array.from(elNode.attributes).forEach(attr => {
                const name = attr.name;
                const value = attr.value;

                // Events: @click, v-on:click
                if (name.startsWith('@') || name.startsWith('v-on:')) {
                    const eventName = name.startsWith('@') ? name.slice(1) : name.slice(5);
                    el.removeAttribute(name);
                    const handlerName = value.trim();

                    const handlerFn = (e: Event) => {
                        // Try to find method first (simple name like "increment")
                        if (this.methods[handlerName]) {
                            this.methods[handlerName](e);
                        } else {
                            // Try eval with $event and methods
                            // Add methods to scope so they're accessible in expressions
                            const evalScope = Object.assign({}, scope, this.methods, { $event: e });
                            try {
                                // Evaluate with both state and scope (which includes methods)
                                const fn = new Function('state', 'scope', 'with(scope){ with(state){ return ' + handlerName + ' } }');
                                fn(this.state, evalScope);
                            } catch (err) {
                                console.error('Error evaluating handler:', handlerName, err);
                                console.error('Scope was:', evalScope);
                            }
                        }
                    };

                    el.addEventListener(eventName, handlerFn);
                    this._listeners.push({ node: el, ev: eventName, fn: handlerFn });
                    return;
                }

                // Bindings: :attr, v-bind:attr
                if (name.startsWith(':') || name.startsWith('v-bind:')) {
                    const attrName = name.startsWith(':') ? name.slice(1) : name.slice(7);
                    el.removeAttribute(name);
                    this._createEffect(() => {
                        const val = this._evalExpression(value, scope);
                        if (attrName === 'class') {
                            if (typeof val === 'object' && val !== null) {
                                Object.keys(val).forEach(cls => {
                                    if (val[cls]) el.classList.add(cls);
                                    else el.classList.remove(cls);
                                });
                            } else {
                                el.setAttribute('class', val);
                            }
                        } else if (val === false || val === null || val === undefined) {
                            el.removeAttribute(attrName);
                        } else {
                            el.setAttribute(attrName, val);
                        }
                    });
                }
            });

            // Process children
            const childrenFrag = this._processNodeList(Array.from(elNode.childNodes), scope);
            el.appendChild(childrenFrag);

            return el;
        }

        return node.cloneNode(true);
    }

    _handleVIf(node: Element, scope: any): Comment {
        const anchor = document.createComment('v-if');
        const expr = node.getAttribute('v-if')!;
        let currentEl: Node | null = null;

        // Defer the effect until mount so anchor has a parent
        const effectFn = () => {
            this._createEffect(() => {
                const shouldShow = !!this._evalExpression(expr, scope);
                // Check for transition parent
                let transitionName: string | null = null;
                if (anchor.parentNode && (anchor.parentNode as HTMLElement).dataset && (anchor.parentNode as HTMLElement).dataset.melodiTransition) {
                    transitionName = (anchor.parentNode as HTMLElement).dataset.melodiTransition!;
                }

                if (shouldShow) {
                    if (!currentEl) {
                        const clone = node.cloneNode(true) as Element;
                        clone.removeAttribute('v-if');
                        const processed = this._walk(clone, scope);

                        if (processed.nodeType === 11) {
                            currentEl = processed; // Fragment handling is limited
                        } else {
                            currentEl = processed;
                        }

                        if (anchor.parentNode) {
                            // Transition Enter
                            if (transitionName && currentEl && currentEl.nodeType === 1) {
                                const el = currentEl as HTMLElement;
                                el.classList.add(transitionName + '-enter-from');
                                el.classList.add(transitionName + '-enter-active');
                                anchor.parentNode.insertBefore(currentEl, anchor);

                                requestAnimationFrame(() => {
                                    el.classList.remove(transitionName + '-enter-from');
                                    el.classList.add(transitionName + '-enter-to');
                                    const onEnd = () => {
                                        el.classList.remove(transitionName + '-enter-active');
                                        el.classList.remove(transitionName + '-enter-to');
                                        el.removeEventListener('transitionend', onEnd);
                                    };
                                    el.addEventListener('transitionend', onEnd);
                                });
                            } else {
                                anchor.parentNode.insertBefore(currentEl, anchor);
                            }
                        }
                    }
                } else {
                    if (currentEl) {
                        const elToRemove = currentEl;
                        currentEl = null;

                        if (transitionName && elToRemove.nodeType === 1 && elToRemove.parentNode) {
                            // Transition Leave
                            const el = elToRemove as HTMLElement;
                            el.classList.add(transitionName + '-leave-from');
                            el.classList.add(transitionName + '-leave-active');

                            requestAnimationFrame(() => {
                                el.classList.remove(transitionName + '-leave-from');
                                el.classList.add(transitionName + '-leave-to');
                                const onEnd = () => {
                                    el.classList.remove(transitionName + '-leave-active');
                                    el.classList.remove(transitionName + '-leave-to');
                                    if (el.parentNode) el.parentNode.removeChild(el);
                                    el.removeEventListener('transitionend', onEnd);
                                };
                                el.addEventListener('transitionend', onEnd);
                            });
                        } else {
                            if (elToRemove.nodeType === 11) {
                                // Fragment
                            } else if (elToRemove.parentNode) {
                                elToRemove.parentNode.removeChild(elToRemove);
                            }
                        }
                    }
                }
            });
        };

        this._postMountEffects.push(effectFn);
        return anchor;
    }

    _handleVFor(node: Element, scope: any): Comment {
        const anchor = document.createComment('v-for');
        const expr = node.getAttribute('v-for')!;
        const inMatch = expr.match(/^\s*(?:\(([^,]+)\s*,\s*([^\)]+)\)|([^\s]+))\s+in\s+(.+)$/);
        if (!inMatch) return anchor;

        let itemName: string, indexName: string | undefined, listExpr: string;
        if (inMatch[1]) { itemName = inMatch[1].trim(); indexName = inMatch[2].trim(); listExpr = inMatch[4].trim() }
        else { itemName = inMatch[3].trim(); listExpr = inMatch[4].trim() }

        // Check if :key attribute is present
        const keyExpr = node.getAttribute(':key') || node.getAttribute('v-bind:key');
        const hasKey = !!keyExpr;

        // Map to track items by key: key -> { element, item, index }
        let itemMap = new Map<any, { element: Node; item: any; index: any; scope?: any }>();

        const effectFn = () => {
            this._createEffect(() => {
                const list = this._evalExpression(listExpr, scope);
                const parent = anchor.parentNode;
                if (!parent) return;

                if (!hasKey) {
                    // Fallback: No :key specified - use old behavior (recreate all)
                    itemMap.forEach(({ element }) => {
                        element.parentNode && element.parentNode.removeChild(element);
                    });
                    itemMap.clear();

                    const renderItem = (item: any, index: any) => {
                        const newScope = Object.assign({}, scope);
                        newScope[itemName] = item;
                        if (indexName) newScope[indexName] = index;

                        const clone = node.cloneNode(true) as Element;
                        clone.removeAttribute('v-for');
                        clone.removeAttribute(':key');
                        clone.removeAttribute('v-bind:key');

                        const processed = this._walk(clone, newScope);

                        if (processed.nodeType === 11) {
                            // Fragment - insert all children
                            const children = Array.from(processed.childNodes);
                            children.forEach(child => {
                                parent.insertBefore(child, anchor);
                            });
                            // For fragments, track first child
                            if (children.length > 0) {
                                itemMap.set(index, { element: children[0], item, index });
                            }
                        } else {
                            parent.insertBefore(processed, anchor);
                            itemMap.set(index, { element: processed, item, index });
                        }
                    };

                    if (Array.isArray(list)) {
                        list.forEach((item, i) => renderItem(item, i));
                    } else if (typeof list === 'object' && list !== null) {
                        Object.keys(list).forEach((key: any, i) => renderItem(list[key], key));
                    }
                } else {
                    // Optimized: :key specified - use diffing algorithm
                    const newItemMap = new Map<any, { item: any; index: any; scope: any }>();
                    const newKeys: any[] = [];

                    // Build new item map
                    if (Array.isArray(list)) {
                        list.forEach((item, i) => {
                            const newScope = Object.assign({}, scope);
                            newScope[itemName] = item;
                            if (indexName) newScope[indexName] = i;

                            const key = this._evalExpression(keyExpr!, newScope);
                            if (key === null || key === undefined) {
                                console.warn('v-for :key evaluated to null/undefined for item:', item);
                                return;
                            }

                            if (newItemMap.has(key)) {
                                console.warn('Duplicate key in v-for:', key);
                            }

                            newKeys.push(key);
                            newItemMap.set(key, { item, index: i, scope: newScope });
                        });
                    } else if (typeof list === 'object' && list !== null) {
                        Object.keys(list).forEach((objKey: any, i) => {
                            const item = list[objKey];
                            const newScope = Object.assign({}, scope);
                            newScope[itemName] = item;
                            if (indexName) newScope[indexName] = objKey;

                            const key = this._evalExpression(keyExpr!, newScope);
                            if (key === null || key === undefined) {
                                console.warn('v-for :key evaluated to null/undefined for item:', item);
                                return;
                            }

                            if (newItemMap.has(key)) {
                                console.warn('Duplicate key in v-for:', key);
                            }

                            newKeys.push(key);
                            newItemMap.set(key, { item, index: objKey, scope: newScope });
                        });
                    }

                    // Diff algorithm: reuse, move, add, remove
                    const oldKeys = Array.from(itemMap.keys());
                    const keysToRemove = oldKeys.filter(k => !newItemMap.has(k));
                    // const keysToAdd = newKeys.filter(k => !itemMap.has(k)); // Unused

                    // Remove old items
                    keysToRemove.forEach(key => {
                        const { element } = itemMap.get(key)!;
                        if (element && element.parentNode) {
                            element.parentNode.removeChild(element);
                        }
                        itemMap.delete(key);
                    });

                    // Process new items in order
                    let previousElement: Node | null = null;
                    newKeys.forEach((key, i) => {
                        const newData = newItemMap.get(key)!;

                        if (itemMap.has(key)) {
                            // Reuse existing element
                            const { element } = itemMap.get(key)!;

                            // Move element to correct position if needed
                            // Insert after previousElement (or at start if previousElement is null)
                            if (previousElement) {
                                // Insert after previousElement
                                if (element.nextSibling !== previousElement.nextSibling) {
                                    parent.insertBefore(element, previousElement.nextSibling);
                                }
                            } else {
                                // Insert at start (before anchor's previous sibling or at parent's first position)
                                const firstChild = parent.firstChild;
                                if (firstChild !== element) {
                                    parent.insertBefore(element, firstChild);
                                }
                            }

                            previousElement = element;
                        } else {
                            // Create new element
                            const clone = node.cloneNode(true) as Element;
                            clone.removeAttribute('v-for');
                            clone.removeAttribute(':key');
                            clone.removeAttribute('v-bind:key');

                            const processed = this._walk(clone, newData.scope);

                            let elementToTrack: Node;
                            if (processed.nodeType === 11) {
                                // Fragment - insert all children
                                const children = Array.from(processed.childNodes);
                                children.forEach(child => {
                                    if (previousElement) {
                                        parent.insertBefore(child, previousElement.nextSibling);
                                        previousElement = child;
                                    } else {
                                        parent.insertBefore(child, parent.firstChild);
                                        previousElement = child;
                                    }
                                });
                                // Track first child for positioning
                                elementToTrack = children[0];
                            } else {
                                if (previousElement) {
                                    parent.insertBefore(processed, previousElement.nextSibling);
                                } else {
                                    parent.insertBefore(processed, parent.firstChild);
                                }
                                elementToTrack = processed;
                                previousElement = processed;
                            }

                            itemMap.set(key, { element: elementToTrack, item: newData.item, index: newData.index });
                        }
                    });
                }
            });
        };

        this._postMountEffects.push(effectFn);
        return anchor;
    }

    _escape(v: any): string {
        if (v == null) return ''
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    _bindEvents(): void {
        const el = this.el
        if (!el) return;
        // find elements with attributes starting with data-on-
        const all = el.querySelectorAll('[data-on-click], [data-on-input], [data-on-change], [data-on-submit]')
        all.forEach(node => {
            Array.from(node.attributes).forEach(attr => {
                if (!attr.name.startsWith('data-on-')) return
                const ev = attr.name.slice('data-on-'.length)
                const handler = attr.value.trim()
                if (!handler) return
                const fn = this.methods[handler]
                if (typeof fn === 'function') {
                    const bound = (e: Event) => { fn(e) }
                    node.addEventListener(ev, bound)
                    this._listeners.push({ node, ev, fn: bound })
                }
            })
        })
    }

    _bindModels(): void {
        const el = this.el;
        if (!el) return;
        const nodes = el.querySelectorAll('[data-model]');
        nodes.forEach(node => {
            const prop = node.getAttribute('data-model')!.trim();
            if (!prop) return;
            if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') {
                const inputEl = node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
                const updateInput = () => {
                    if (inputEl.type === 'checkbox') {
                        (inputEl as HTMLInputElement).checked = !!this.state[prop];
                    } else {
                        inputEl.value = this.state[prop] == null ? '' : this.state[prop];
                    }
                };
                this._createEffect(updateInput);
                const bound = (e: Event) => {
                    const val = (inputEl.type === 'checkbox') ? (inputEl as HTMLInputElement).checked : inputEl.value;
                    this.state[prop] = val;
                };
                node.addEventListener('input', bound);
                this._listeners.push({ node, ev: 'input', fn: bound });
            } else {
                const htmlEl = node as HTMLElement;
                const updateText = () => {
                    htmlEl.innerText = this.state[prop] == null ? '' : this.state[prop];
                };
                this._createEffect(updateText);
            }
        });
    }

    unmount(): void {
        // call unmounted hook
        try { if (typeof this.hooks.unmounted === 'function') this.hooks.unmounted.call(this.state) } catch (e) { }

        // remove event listeners
        this._listeners.forEach(l => {
            try { l.node.removeEventListener(l.ev, l.fn) } catch (e) { }
        })
        this._listeners = []

        // cleanup effects
        this._effects.forEach(fn => { try { fn() } catch (e) { } })
        this._effects = []

        // remove from app mounted list
        try {
            if (this.app && Array.isArray(this.app._mountedComponents)) {
                const idx = this.app._mountedComponents.indexOf(this)
                if (idx !== -1) this.app._mountedComponents.splice(idx, 1)
            }
        } catch (e) { }

        // unmark DOM
        try { if (this.el) { (this.el as any).__melodijs_mounted = false; this.el.innerHTML = '' } } catch (e) { }
    }

    async _mountNestedComponents(): Promise<void> {
        if (!this.app || !this.el) return

        // Merge global and local components
        const globalComponents = this.app.components || {};
        const localComponents = this.components || {};
        const allComponents = { ...globalComponents, ...localComponents };

        const tags = Object.keys(allComponents)
        for (const tag of tags) {
            const nodes: Element[] = Array.from(this.el.querySelectorAll(tag))
            for (const node of nodes) {
                if ((node as any).__melodijs_mounted) continue

                // Check if this node is inside another custom element that is NOT yet mounted
                // We want to skip it only if it's inside an UNMOUNTED custom element
                // If it's inside a MOUNTED custom element, that's fine (it should be mounted by its parent)
                let parent = node.parentElement
                let skip = false
                while (parent && parent !== this.el) {
                    const t = parent.tagName && parent.tagName.toLowerCase()
                    if (t && tags.indexOf(t) !== -1) {
                        // Found a custom element parent
                        // Skip only if it's NOT mounted yet
                        if (!(parent as any).__melodijs_mounted) {
                            skip = true
                            break
                        }
                        // If it IS mounted, we should NOT skip - this handles slot content
                        // The parent component is already set up, so we can mount this child
                    }
                    parent = parent.parentElement
                }

                if (skip) continue
                const compDef = allComponents[tag]
                const comp = new Component(compDef)
                // set logical parent so events can bubble even if DOM structure differs
                try { comp._parent = this } catch (e) { }
                try {
                    await comp.mount(node, this.app);
                    (node as any).__melodijs_mounted = true
                } catch (e) {
                    console.error('Error mounting nested component:', tag, e)
                }
            }
        }
    }


    _createEffect(fn: EffectFn): CleanupFn {
        const cleanup = this.reactivity!.createEffect(fn)
        if (typeof cleanup === 'function') this._effects.push(cleanup)
        return cleanup
    }
}

// small helper to create app (Vue-like)
function createApp(options: MelodiOptions): MelodiJS {
    return new MelodiJS(options)
}

export { createApp, MelodiJS }