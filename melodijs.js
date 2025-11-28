// --- Fine-grain reactivity primitives regroupées ---

// Réactivité fine-grain par instance d’application
class MelodiReactive {
    constructor() {
        this._currentEffect = null;
    }
    createSignal(value) {
        let v = value;
        const subscribers = new Set();
        const self = this;
        function read() {
            if (self._currentEffect) subscribers.add(self._currentEffect);
            return v;
        }
        function write(next) {
            if (v === next) return;
            v = next;
            subscribers.forEach(fn => fn());
        }
        return [read, write];
    }
    createEffect(fn) {
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
    createEffectWithCleanup(fn) {
        const self = this;
        let cleanup = null;
        const execute = () => {
            self._currentEffect = execute;
            try {
                if (cleanup) cleanup();
                cleanup = fn();
            } finally {
                self._currentEffect = null;
            }
        };
        execute();
        return () => {
            if (cleanup) cleanup();
        }
    }

    createMemo(fn) {
        const [read, write] = this.createSignal();
        this.createEffect(() => {
            write(fn());
        });
        return read;
    }
}

// Minimal reactive component library (tiny Vue-like)

class MelodiJS {
    constructor(options) {
        this.options = options || {}
        this.root = null
        this.components = this.options.components || {}
        this._mountedComponents = []
        this.reactivity = new MelodiReactive();
        // Store is now fine-grained reactive
        this.store = this._makeReactiveStore(this.options.store || {})
    }

    mount(target) {
        this.root = typeof target === 'string' ? document.querySelector(target) : target
        if (!this.root) throw new Error('Mount target not found')

        const promises = []
        const tags = Object.keys(this.components)
        Object.keys(this.components).forEach(tag => {
            const nodes = Array.from(this.root.querySelectorAll(tag))
            nodes.forEach(node => {
                if (node.__melodijs_mounted) return
                if (this._isDescendantOfCustom(node, tags)) return
                const compDef = this.components[tag]
                const comp = new Component(compDef)
                const p = comp.mount(node, this).then(() => { node.__melodijs_mounted = true })
                promises.push(p)
            })
        })

        return Promise.all(promises)
    }

    _isDescendantOfCustom(node, customTags) {
        let p = node.parentElement
        while (p) {
            const tag = p.tagName && p.tagName.toLowerCase()
            if (tag && customTags.indexOf(tag) !== -1) return true
            p = p.parentElement
        }
        return false
    }

    _makeReactiveStore(initial) {
        // Use the same logic as Component._makeReactive but for the store
        const state = {};
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

class Component {
    constructor(def) {
        this.template = def.template || ''
        this.dataFn = def.data || function () { return {} }
        this.methodsDef = def.methods || {}
        // props can be an array of names or an object with detailed defs
        this.propsDef = def.props || null
        // lifecycle hooks: prefer explicit hooks, fallback to methods (migrated below)
        this.hooks = def.hooks || {}
        this.components = def.components || {}
        this.computedDef = def.computed || {}

        this.el = null
        this.app = null
        this.state = null
        this.methods = {}
        this._listeners = []
        this._effects = [] // Track effects for cleanup
        this._events = {}
    }

    mount(el, app) {
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

        // create reactive state
        this.reactivity = app.reactivity;
        this.state = this._makeReactive(initial)

        // inject references into state for convenience (element, app, root)
        try { this.state.__lastEl = this.el; this.state.__slotSourceEl = this.el; this.state.$app = app; this.state.$root = document } catch (e) { }

        // event API helpers available on state
        try {
            const comp = this
            // register event listener on this component
            this.state.$on = function (eventName, handler) {
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
            this.state.$emit = function (eventName, payload) {
                try {
                    const local = comp._events[eventName] || []
                    local.forEach(h => { try { h.call(comp.state, payload) } catch (e) { } })
                    // bubble
                    // first try DOM parent chain
                    let p = comp.el.parentElement
                    while (p) {
                        const parentComp = p.__melodijs_instance
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
                            handlers.forEach(h => { try { h.call(lp.state, payload) } catch (e) { } })
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
                try { this.state[name] = this.methods[name] } catch(e){}
            })
        } catch (e) {
            console.error('Error binding methods:', e)
        }

        // register component on app so store updates can notify
        app._mountedComponents = app._mountedComponents || []
        app._mountedComponents.push(this)

        // mark instance on element for parent-child lookup
        try { this.el.__melodijs_instance = this } catch (e) { }

        // initial render (handle async template resolution)
        return this._render(true)
    }

    _readPropsFromEl(el) {
        const props = {}
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

    _coerceAttrValue(val) {
        // try number and boolean coercion
        if (val === 'true') return true
        if (val === 'false') return false
        if (!isNaN(val) && val.trim() !== '') return Number(val)
        return val
    }

    _gatherDeclaredProps() {
        // returns an object map of propName -> def (if array provided, returns names with undefined defs)
        if (!this.propsDef) return null
        if (Array.isArray(this.propsDef)) {
            const out = {}
            this.propsDef.forEach(n => out[n] = {})
            return out
        }
        // assume object
        return this.propsDef
    }

    _coercePropValue(val, def) {
        if (!def || !def.type) return val
        const t = def.type
        if (t === Number) return Number(val)
        if (t === Boolean) return (val === '' || val === true || val === 'true')
        if (t === String) return String(val)
        return val
    }

    // Fine-grain reactivity: wrap each property in a signal
    _makeReactive(obj) {
        const state = {};
        this._signals = {};
        for (const key of Object.keys(obj)) {
            const [getter, setter] = this.reactivity.createSignal(obj[key]);
            Object.defineProperty(state, key, {
                get: getter,
                set: setter,
                enumerable: true,
                configurable: true
            });
            this._signals[key] = [getter, setter];
        }

        // Initialize computed properties
        if (this.computedDef) {
            Object.keys(this.computedDef).forEach(key => {
                const fn = this.computedDef[key].bind(state);
                const memo = this.reactivity.createMemo(fn);
                Object.defineProperty(state, key, {
                    get: memo,
                    enumerable: true,
                    configurable: true
                });
            });
        }

        return state;
    }

    _evalExpression(expr, scope) {
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

    async _render(isInitial) {
        if (isInitial) {
            this._postMountEffects = []; // Queue for effects that need parentNode

            // 1. Compile: Create the initial DOM structure from template
            await this._compile();

            // 2. Mount hooks
            try { if (typeof this.hooks.beforeMount === 'function') this.hooks.beforeMount.call(this.state); } catch (e) { }

            // 3. Append to DOM
            this.el.appendChild(this._fragment);

            // 4. Run post-mount effects (v-if, v-for) now that parentNodes exist
            this._postMountEffects.forEach(fn => fn());
            this._postMountEffects = []; // Clear queue

            // 5. Mount nested components
            await this._mountNestedComponents();

            try { if (typeof this.hooks.mounted === 'function') this.hooks.mounted.call(this.state); } catch (e) { }
        }
        return true;
    }

    async _compile() {
        // Get template string
        let tpl = this.template;
        let tempDiv;

        if (!tpl) {
            // If no template, use the element's initial HTML (but clear it first)
            // We clone the nodes to a fragment to process them
            const fragment = document.createDocumentFragment();
            while (this.el.firstChild) {
                fragment.appendChild(this.el.firstChild);
            }
            // If no template provided, the "slot source" IS the template effectively, 
            // but usually components have a template. 
            // If we are here, it means we are using the innerHTML as the template.
            // In this case, slots don't make much sense unless we are a higher-order component?
            // Actually, if no template is defined, we treat the content as the template.
            this._fragment = this._processNodeList(fragment.childNodes);
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
            tempDiv.innerHTML = tpl || '';

            // --- Slot Distribution ---
            if (this._slotSource) {
                const slotEls = Array.from(tempDiv.querySelectorAll('slot'));
                slotEls.forEach(slotEl => {
                    const name = slotEl.getAttribute('name');
                    let inserted = false;
                    const fragment = document.createDocumentFragment();

                    if (name) {
                        // Named slot
                        const nodes = Array.from(this._slotSource.querySelectorAll('[slot="' + name + '"]'));
                        if (nodes.length) {
                            nodes.forEach(n => fragment.appendChild(n.cloneNode(true)));
                            inserted = true;
                        }
                    } else {
                        // Default slot
                        const nodes = Array.from(this._slotSource.childNodes).filter(n => {
                            return !(n.nodeType === 1 && n.hasAttribute && n.hasAttribute('slot'));
                        });
                        if (nodes.length) {
                            nodes.forEach(n => fragment.appendChild(n.cloneNode(true)));
                            inserted = true;
                        }
                    }

                    if (inserted) {
                        slotEl.parentNode.replaceChild(fragment, slotEl);
                    } else {
                        // Fallback content: keep what's inside the slot tag, but unwrap the slot tag itself?
                        // Usually <slot>fallback</slot> -> fallback
                        // We need to replace <slot> with its children.
                        while (slotEl.firstChild) {
                            slotEl.parentNode.insertBefore(slotEl.firstChild, slotEl);
                        }
                        slotEl.parentNode.removeChild(slotEl);
                    }
                });
            }

            this._fragment = this._processNodeList(tempDiv.childNodes);
            this.el.innerHTML = ''; // Clear host element
        }
    }

    _processNodeList(nodes, scope = {}) {
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

    _walk(node, scope) {
        // 1. Handle Text Nodes (Interpolation)
        if (node.nodeType === 3) {
            const text = node.nodeValue;
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
            // Check for v-pre
            if (node.hasAttribute('v-pre')) {
                const clone = node.cloneNode(true);
                clone.removeAttribute('v-pre');
                return clone;
            }

            // Check for v-if
            if (node.hasAttribute('v-if')) {
                return this._handleVIf(node, scope);
            }

            // Check for v-for
            if (node.hasAttribute('v-for')) {
                return this._handleVFor(node, scope);
            }

            // Clone element
            const el = node.cloneNode(false);

            // Handle v-show
            if (el.hasAttribute('v-show')) {
                const expr = el.getAttribute('v-show');
                el.removeAttribute('v-show');
                this._createEffect(() => {
                    const show = !!this._evalExpression(expr, scope);
                    el.style.display = show ? '' : 'none';
                });
            }

            // Handle v-model
            if (el.hasAttribute('v-model')) {
                const prop = el.getAttribute('v-model').trim();
                el.removeAttribute('v-model');

                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                    // Two-way binding
                    // 1. Model -> View
                    this._createEffect(() => {
                        const val = this.state[prop];
                        if (el.type === 'checkbox') {
                            el.checked = !!val;
                        } else {
                            el.value = (val == null) ? '' : val;
                        }
                    });

                    // 2. View -> Model
                    const handler = (e) => {
                        const val = el.type === 'checkbox' ? el.checked : el.value;
                        this.state[prop] = val;
                    };
                    el.addEventListener('input', handler);
                    // Also listen to change for some inputs
                    if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') {
                        el.addEventListener('change', handler);
                    }
                    this._listeners.push({ node: el, ev: 'input', fn: handler });
                }
            }

            // Handle Attributes & Events
            Array.from(node.attributes).forEach(attr => {
                const name = attr.name;
                const value = attr.value;

                // Events: @click, v-on:click
                if (name.startsWith('@') || name.startsWith('v-on:')) {
                    const eventName = name.startsWith('@') ? name.slice(1) : name.slice(5);
                    el.removeAttribute(name);
                    const handlerName = value.trim();

                    const handlerFn = (e) => {
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
            const childrenFrag = this._processNodeList(node.childNodes, scope);
            el.appendChild(childrenFrag);

            return el;
        }

        return node.cloneNode(true);
    }

    _handleVIf(node, scope) {
        const anchor = document.createComment('v-if');
        const expr = node.getAttribute('v-if');
        let currentEl = null;

        // Defer the effect until mount so anchor has a parent
        const effectFn = () => {
            this._createEffect(() => {
                const shouldShow = !!this._evalExpression(expr, scope);
                if (shouldShow) {
                    if (!currentEl) {
                        const clone = node.cloneNode(true);
                        clone.removeAttribute('v-if');
                        // We must process the new node
                        // Note: _walk might return a Fragment if the node itself had v-if (recursion?) 
                        // No, we removed v-if.
                        const processed = this._walk(clone, scope);

                        // Handle Fragment vs Node
                        if (processed.nodeType === 11) {
                            // If fragment, we need to insert all children. 
                            // Tracking them is harder. For simplicity, assume single element for now 
                            // or wrap in a temp span if multiple? 
                            // Let's just insert them.
                            // BUT we need to track them to remove them later.
                            // Current limitation: v-if on <template> or text nodes might be tricky.
                            // Let's assume 1 root element for v-if target usually.
                            currentEl = processed;
                        } else {
                            currentEl = processed;
                        }

                        if (anchor.parentNode) {
                            anchor.parentNode.insertBefore(currentEl, anchor);
                        }
                    }
                } else {
                    if (currentEl) {
                        if (currentEl.nodeType === 11) {
                            // If it was a fragment, we can't easily remove "it".
                            // We would have needed to track childNodes.
                            // For now, let's assume standard element.
                        } else if (currentEl.parentNode) {
                            currentEl.parentNode.removeChild(currentEl);
                        }
                        currentEl = null;
                    }
                }
            });
        };

        this._postMountEffects.push(effectFn);
        return anchor;
    }

    _handleVFor(node, scope) {
        const anchor = document.createComment('v-for');
        const expr = node.getAttribute('v-for');
        const inMatch = expr.match(/^\s*(?:\(([^,]+)\s*,\s*([^\)]+)\)|([^\s]+))\s+in\s+(.+)$/);
        if (!inMatch) return anchor;

        let itemName, indexName, listExpr;
        if (inMatch[1]) { itemName = inMatch[1].trim(); indexName = inMatch[2].trim(); listExpr = inMatch[4].trim() }
        else { itemName = inMatch[3].trim(); listExpr = inMatch[4].trim() }

        // Check if :key attribute is present
        const keyExpr = node.getAttribute(':key') || node.getAttribute('v-bind:key');
        const hasKey = !!keyExpr;

        // Map to track items by key: key -> { element, item, index }
        let itemMap = new Map();

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

                    const renderItem = (item, index) => {
                        const newScope = Object.assign({}, scope);
                        newScope[itemName] = item;
                        if (indexName) newScope[indexName] = index;

                        const clone = node.cloneNode(true);
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
                        Object.keys(list).forEach((key, i) => renderItem(list[key], key));
                    }
                } else {
                    // Optimized: :key specified - use diffing algorithm
                    const newItemMap = new Map();
                    const newKeys = [];

                    // Build new item map
                    if (Array.isArray(list)) {
                        list.forEach((item, i) => {
                            const newScope = Object.assign({}, scope);
                            newScope[itemName] = item;
                            if (indexName) newScope[indexName] = i;

                            const key = this._evalExpression(keyExpr, newScope);
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
                        Object.keys(list).forEach((objKey, i) => {
                            const item = list[objKey];
                            const newScope = Object.assign({}, scope);
                            newScope[itemName] = item;
                            if (indexName) newScope[indexName] = objKey;

                            const key = this._evalExpression(keyExpr, newScope);
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
                    const keysToAdd = newKeys.filter(k => !itemMap.has(k));

                    // Remove old items
                    keysToRemove.forEach(key => {
                        const { element } = itemMap.get(key);
                        if (element && element.parentNode) {
                            element.parentNode.removeChild(element);
                        }
                        itemMap.delete(key);
                    });

                    // Process new items in order
                    let previousElement = null;
                    newKeys.forEach((key, i) => {
                        const newData = newItemMap.get(key);

                        if (itemMap.has(key)) {
                            // Reuse existing element
                            const { element } = itemMap.get(key);

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
                            const clone = node.cloneNode(true);
                            clone.removeAttribute('v-for');
                            clone.removeAttribute(':key');
                            clone.removeAttribute('v-bind:key');

                            const processed = this._walk(clone, newData.scope);

                            let elementToTrack;
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

    _escape(v) {
        if (v == null) return ''
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    _bindEvents() {
        const el = this.el
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
                    const bound = (e) => { fn(e) }
                    node.addEventListener(ev, bound)
                    this._listeners.push({ node, ev, fn: bound })
                }
            })
        })
    }

    _bindModels() {
        const el = this.el;
        const nodes = el.querySelectorAll('[data-model]');
        nodes.forEach(node => {
            const prop = node.getAttribute('data-model').trim();
            if (!prop) return;
            if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') {
                const updateInput = () => {
                    if (node.type === 'checkbox') {
                        node.checked = !!this.state[prop];
                    } else {
                        node.value = this.state[prop] == null ? '' : this.state[prop];
                    }
                };
                this._createEffect(updateInput);
                const bound = (e) => {
                    const val = node.type === 'checkbox' ? node.checked : node.value;
                    this.state[prop] = val;
                };
                node.addEventListener('input', bound);
                this._listeners.push({ node, ev: 'input', fn: bound });
            } else {
                const updateText = () => {
                    node.innerText = this.state[prop] == null ? '' : this.state[prop];
                };
                this._createEffect(updateText);
            }
        });
    }

    unmount() {
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
        try { if (this.el) { this.el.__melodijs_mounted = false; this.el.innerHTML = '' } } catch (e) { }
    }

    async _mountNestedComponents() {
        if (!this.app || !this.app.components) return
        const tags = Object.keys(this.app.components)
        for (const tag of tags) {
            const nodes = Array.from(this.el.querySelectorAll(tag))
            for (const node of nodes) {
                if (node.__melodijs_mounted) continue

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
                        if (!parent.__melodijs_mounted) {
                            skip = true
                            break
                        }
                        // If it IS mounted, we should NOT skip - this handles slot content
                        // The parent component is already set up, so we can mount this child
                    }
                    parent = parent.parentElement
                }

                if (skip) continue
                const compDef = this.app.components[tag]
                const comp = new Component(compDef)
                // set logical parent so events can bubble even if DOM structure differs
                try { comp._parent = this } catch (e) { }
                try {
                    await comp.mount(node, this.app)
                    node.__melodijs_mounted = true
                } catch (e) {
                    console.error('Error mounting nested component:', tag, e)
                }
            }
        }
    }


    _createEffect(fn) {
        const cleanup = this.reactivity.createEffect(fn)
        if (typeof cleanup === 'function') this._effects.push(cleanup)
        return cleanup
    }
}

// small helper to create app (Vue-like)
function createApp(options) {
    return new MelodiJS(options)
}

export { createApp }