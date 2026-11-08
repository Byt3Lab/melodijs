import { MelodiJS, Plugin, ComponentDef, Component } from './melodijs.js';

export type AsyncComponentLoader = () => Promise<ComponentDef | { default: ComponentDef }>;

export interface RouteDef {
    path: string;
    component: ComponentDef | AsyncComponentLoader;
    children?: RouteDef[];
    transition?: string;
}

export interface ProgressOptions {
    enabled?: boolean;        // Enable/disable automatic progress bar (default: true)
    color?: string;           // Bar color (default: '#ff0000' - YouTube red)
    errorColor?: string;      // Bar color on navigation error (default: '#ef4444')
    height?: string | number; // Bar thickness (default: '2px')
    speed?: number;           // Animation transition speed in ms (default: 200)
    trickleSpeed?: number;    // Automatic trickle interval in ms (default: 200)
    minimum?: number;         // Initial minimum progress between 0 and 1 (default: 0.08)
    showSpinner?: boolean;    // Show top-right spinner (default: false)
    zIndex?: number;          // Container z-index (default: 99999)
    className?: string;       // Optional custom CSS class on container
    timeout?: number;         // Safety watchdog timeout in ms to prevent stuck bar (default: 15000)
}

export interface ScrollPosition {
    top?: number;
    left?: number;
    behavior?: ScrollBehavior;
}

export type ScrollBehaviorHandler = (
    to: string,
    from: string | null,
    savedPosition: ScrollPosition | null
) => ScrollPosition | false | void;

export interface RouterOptions {
    routes: RouteDef[];
    mode?: 'hash' | 'history';  // Default: 'hash'
    progress?: boolean | ProgressOptions; // Default: true
    scrollBehavior?: boolean | 'top' | ScrollBehaviorHandler; // Default: 'top'
}

export type NavigationEventName =
    | 'navigation:start'
    | 'navigation:complete'
    | 'navigation:cancelled'
    | 'navigation:error';

export interface NavigationEventPayload {
    to: string;
    from: string | null;
    navigationId: number;
    reason?: string;
    error?: any;
}

export type NavigationEventHandler = (payload: NavigationEventPayload) => void;
export type NavigationBeforeGuard = (
    to: string,
    from: string,
    next: (pathOrAction?: string | false) => void
) => any;
export type NavigationAfterHook = (to: string, from: string | null) => void;

const DEFAULT_PROGRESS_OPTIONS: Required<ProgressOptions> = {
    enabled: true,
    color: '#ff0000',
    errorColor: '#ef4444',
    height: '2px',
    speed: 200,
    trickleSpeed: 200,
    minimum: 0.08,
    showSpinner: false,
    zIndex: 99999,
    className: '',
    timeout: 15000
};

/**
 * Built-in YouTube-inspired top navigation progress bar.
 * Zero external dependencies, direct DOM updates.
 */
export class NavigationProgress {
    options: Required<ProgressOptions>;
    status: number | null = null;
    isActive: boolean = false;

    private _container: HTMLElement | null = null;
    private _bar: HTMLElement | null = null;
    private _spinner: HTMLElement | null = null;
    private _trickleTimer: any = null;
    private _fadeTimer: any = null;
    private _watchdogTimer: any = null;
    private _isErrorState: boolean = false;

    constructor(options?: boolean | ProgressOptions) {
        if (typeof options === 'boolean') {
            this.options = { ...DEFAULT_PROGRESS_OPTIONS, enabled: options };
        } else {
            this.options = { ...DEFAULT_PROGRESS_OPTIONS, ...(options || {}) };
        }
    }

    configure(options: Partial<ProgressOptions>): this {
        this.options = { ...this.options, ...options };
        this._applyStyles();
        return this;
    }

    start(): this {
        if (!this.options.enabled || typeof document === 'undefined') return this;

        this._clearTimers();
        this._isErrorState = false;
        this._ensureDOM();

        this.isActive = true;
        if (this._container) {
            this._container.classList.remove('melodi-progress-error');
            this._container.classList.add('melodi-progress-active');
            this._container.style.opacity = '1';
        }
        if (this._bar) {
            this._bar.style.backgroundColor = this.options.color;
        }

        // Reset to 0 without transition if restarting, then jump to minimum
        this.set(this.options.minimum);

        // Start progressive non-linear trickle
        if (this.options.trickleSpeed > 0) {
            this._trickleTimer = setInterval(() => {
                if (this.isActive) {
                    this.inc();
                }
            }, this.options.trickleSpeed);
        }

        // Watchdog timer to prevent stuck animations
        if (this.options.timeout > 0) {
            this._watchdogTimer = setTimeout(() => {
                if (this.isActive) {
                    this.done();
                }
            }, this.options.timeout);
        }

        return this;
    }

    set(n: number): this {
        if (!this.options.enabled || typeof document === 'undefined') return this;

        this._ensureDOM();
        const clamped = Math.max(this.options.minimum, Math.min(1, n));
        this.status = clamped === 1 ? null : clamped;

        if (this._bar) {
            const pct = (clamped * 100).toFixed(2) + '%';
            this._bar.style.width = pct;
            this._bar.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
        }

        return this;
    }

    inc(amount?: number): this {
        if (!this.options.enabled) return this;
        const current = this.status;
        if (current === null) {
            return this.start();
        }
        if (current >= 0.994) {
            return this;
        }

        let delta = amount;
        if (typeof delta !== 'number') {
            if (current >= 0 && current < 0.2) delta = 0.1;
            else if (current >= 0.2 && current < 0.5) delta = 0.04;
            else if (current >= 0.5 && current < 0.8) delta = 0.02;
            else if (current >= 0.8 && current < 0.99) delta = 0.005;
            else delta = 0;
        }

        const nextVal = Math.min(0.994, current + delta);
        return this.set(nextVal);
    }

    done(force: boolean = false): this {
        if (!this.options.enabled || typeof document === 'undefined') return this;
        if (!this.isActive && !force && this.status === null) return this;

        this._clearTrickleAndWatchdog();
        this.set(1);
        this.isActive = false;

        const speed = this.options.speed;
        this._fadeTimer = setTimeout(() => {
            if (this._container) {
                this._container.style.opacity = '0';
                this._container.classList.remove('melodi-progress-active');
            }
            this._fadeTimer = setTimeout(() => {
                if (!this.isActive && this._bar) {
                    this._bar.style.width = '0%';
                    this._isErrorState = false;
                    if (this._container) {
                        this._container.classList.remove('melodi-progress-error');
                    }
                    this._bar.style.backgroundColor = this.options.color;
                }
            }, speed);
        }, Math.max(50, Math.round(speed * 0.6)));

        return this;
    }

    fail(): this {
        if (!this.options.enabled || typeof document === 'undefined') return this;

        this._ensureDOM();
        this._isErrorState = true;
        if (this._container) {
            this._container.classList.add('melodi-progress-error');
            this._container.style.opacity = '1';
        }
        if (this._bar) {
            this._bar.style.backgroundColor = this.options.errorColor;
        }

        return this.done(true);
    }

    destroy(): void {
        this._clearTimers();
        this.isActive = false;
        this.status = null;
        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
        this._bar = null;
        this._spinner = null;
    }

    private _clearTrickleAndWatchdog(): void {
        if (this._trickleTimer) {
            clearInterval(this._trickleTimer);
            this._trickleTimer = null;
        }
        if (this._watchdogTimer) {
            clearTimeout(this._watchdogTimer);
            this._watchdogTimer = null;
        }
    }

    private _clearTimers(): void {
        this._clearTrickleAndWatchdog();
        if (this._fadeTimer) {
            clearTimeout(this._fadeTimer);
            this._fadeTimer = null;
        }
    }

    private _ensureDOM(): void {
        if (typeof document === 'undefined' || !document.body) return;

        // Inject global keyframe/base styles once per document
        const styleId = 'melodi-router-progress-style';
        if (document.head && !document.getElementById(styleId)) {
            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.textContent = `
.melodi-progress {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    pointer-events: none;
    opacity: 0;
}
.melodi-progress-bar {
    height: 100%;
    width: 0%;
    position: relative;
}
.melodi-progress-peg {
    display: block;
    position: absolute;
    right: 0;
    top: 0;
    width: 80px;
    height: 100%;
    opacity: 1;
    transform: rotate(3deg) translate(0px, -4px);
}
.melodi-progress-spinner {
    display: block;
    position: fixed;
    top: 12px;
    right: 12px;
    width: 16px;
    height: 16px;
    box-sizing: border-box;
    border: 2px solid transparent;
    border-radius: 50%;
    animation: melodi-progress-spin 400ms linear infinite;
}
@keyframes melodi-progress-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}`;
            document.head.appendChild(styleEl);
        }

        if (!this._container || !this._container.parentNode) {
            const existing = document.querySelector('.melodi-progress') as HTMLElement | null;
            if (existing) {
                this._container = existing;
                this._bar = existing.querySelector('.melodi-progress-bar') as HTMLElement | null;
                this._spinner = existing.querySelector('.melodi-progress-spinner') as HTMLElement | null;
            } else {
                const container = document.createElement('div');
                container.className = 'melodi-progress';
                container.setAttribute('role', 'progressbar');
                container.setAttribute('aria-valuemin', '0');
                container.setAttribute('aria-valuemax', '100');

                const bar = document.createElement('div');
                bar.className = 'melodi-progress-bar';

                const peg = document.createElement('div');
                peg.className = 'melodi-progress-peg';
                bar.appendChild(peg);

                container.appendChild(bar);
                document.body.appendChild(container);

                this._container = container;
                this._bar = bar;
            }
        }

        this._applyStyles();
    }

    private _applyStyles(): void {
        if (!this._container || !this._bar) return;

        const heightStr = typeof this.options.height === 'number'
            ? `${this.options.height}px`
            : this.options.height;
        const speed = this.options.speed;
        const activeColor = this._isErrorState ? this.options.errorColor : this.options.color;

        this._container.className = ['melodi-progress', this.options.className, this.isActive ? 'melodi-progress-active' : '', this._isErrorState ? 'melodi-progress-error' : '']
            .filter(Boolean)
            .join(' ');
        this._container.style.height = heightStr;
        this._container.style.zIndex = String(this.options.zIndex);
        this._container.style.transition = `opacity ${speed}ms ease`;

        this._bar.style.backgroundColor = activeColor;
        this._bar.style.boxShadow = `0 0 8px ${activeColor}`;
        this._bar.style.transition = `width ${speed}ms cubic-bezier(0.4, 0, 0.2, 1), background-color ${speed}ms ease`;

        const peg = this._bar.querySelector('.melodi-progress-peg') as HTMLElement | null;
        if (peg) {
            peg.style.boxShadow = `0 0 10px ${activeColor}, 0 0 5px ${activeColor}`;
        }

        if (this.options.showSpinner) {
            if (!this._spinner) {
                const spinner = document.createElement('div');
                spinner.className = 'melodi-progress-spinner';
                this._container.appendChild(spinner);
                this._spinner = spinner;
            }
            this._spinner.style.borderTopColor = activeColor;
            this._spinner.style.borderLeftColor = activeColor;
            this._spinner.style.display = 'block';
        } else if (this._spinner) {
            if (this._spinner.parentNode) {
                this._spinner.parentNode.removeChild(this._spinner);
            }
            this._spinner = null;
        }
    }
}

export class MelodiRouter implements Plugin {
    routes: RouteDef[];
    mode: 'hash' | 'history';
    progress: NavigationProgress;
    scrollBehavior: boolean | 'top' | ScrollBehaviorHandler;
    currentRoute: any; // Signal
    setRoute: any; // Signal setter
    params: any; // Route params signal
    setParams: any;
    query: any; // Query params signal
    setQuery: any;
    matched: any; // Signal for matched routes array
    setMatched: any;
    beforeEachHook: NavigationBeforeGuard | null = null;

    private _afterEachHooks: NavigationAfterHook[] = [];
    private _eventListeners: Record<string, NavigationEventHandler[]> = {};
    private _navigationId: number = 0;
    private _activeNav: { id: number; to: string; from: string | null; targetKey: string } | null = null;
    private _committedTargetKey: string | null = null;
    private _initialized: boolean = false;
    private _pendingMounts: Promise<any>[] = [];
    private _resolvedComponents: WeakMap<Function, ComponentDef> = new WeakMap();
    private _scrollPositions: Map<string, ScrollPosition> = new Map();
    private _popstateListener: (() => void) | null = null;
    private _hashchangeListener: (() => void) | null = null;
    private _ignoreNextHashChange: boolean = false;

    constructor(options: RouterOptions) {
        this.routes = options.routes || [];
        this.mode = options.mode || 'hash';  // Default to hash mode
        this.progress = new NavigationProgress(options.progress);
        this.scrollBehavior = options.scrollBehavior !== undefined ? options.scrollBehavior : 'top';
        this.currentRoute = null;
        this.setRoute = null;
        this.params = null;
        this.setParams = null;
        this.query = null;
        this.setQuery = null;
        this.matched = null;
        this.setMatched = null;
    }

    beforeEach(hook: NavigationBeforeGuard): void {
        this.beforeEachHook = hook;
    }

    afterEach(hook: NavigationAfterHook): () => void {
        if (typeof hook === 'function') {
            this._afterEachHooks.push(hook);
        }
        return () => {
            const idx = this._afterEachHooks.indexOf(hook);
            if (idx !== -1) this._afterEachHooks.splice(idx, 1);
        };
    }

    on(event: NavigationEventName, handler: NavigationEventHandler): () => void {
        if (!event || typeof handler !== 'function') return () => {};
        this._eventListeners[event] = this._eventListeners[event] || [];
        this._eventListeners[event].push(handler);
        return () => this.off(event, handler);
    }

    off(event: NavigationEventName, handler: NavigationEventHandler): void {
        const list = this._eventListeners[event];
        if (!list) return;
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
    }

    private _emit(event: NavigationEventName, payload: NavigationEventPayload): void {
        const list = this._eventListeners[event];
        if (!list || list.length === 0) return;
        list.slice().forEach(fn => {
            try {
                fn(payload);
            } catch (err) {
                console.error(`Error in router event listener (${event}):`, err);
            }
        });
    }

    install(app: MelodiJS) {
        // Create reactive signals
        const [readRoute, writeRoute] = app.reactivity.createSignal(this._getCurrentPath());
        const [readParams, writeParams] = app.reactivity.createSignal({});
        const [readQuery, writeQuery] = app.reactivity.createSignal({});
        const [readMatched, writeMatched] = app.reactivity.createSignal<RouteDef[]>([]);

        this.currentRoute = readRoute;
        this.setRoute = writeRoute;
        this.params = readParams;
        this.setParams = writeParams;
        this.query = readQuery;
        this.setQuery = writeQuery;
        this.matched = readMatched;
        this.setMatched = writeMatched;

        // Listen to route changes based on mode
        if (this.mode === 'history') {
            this._popstateListener = () => {
                this._handleRouteChange(undefined, false, 'pop');
            };
            window.addEventListener('popstate', this._popstateListener);
        } else {
            this._hashchangeListener = () => {
                if (this._ignoreNextHashChange) {
                    this._ignoreNextHashChange = false;
                    return;
                }
                this._handleRouteChange(undefined, false, 'pop');
            };
            window.addEventListener('hashchange', this._hashchangeListener);
        }

        // Initial route resolution
        this._handleRouteChange(undefined, true, 'replace');

        // Register global components
        app.components['router-link'] = this._createRouterLink();
        app.components['router-view'] = this._createRouterView(app);

        // Expose router on app and make it available in components via $router
        (app as any).router = this;

        // Add $router to component instances
        const originalMount = app.mount.bind(app);
        app.mount = function (target: string | Element) {
            const result = originalMount(target);
            // Access root component and add $router
            const root = (typeof target === 'string' ? document.querySelector(target) : target) as any;
            if (root && root.__melodijs_root) {
                const comp = root.__melodijs_root;
                if (comp.state) {
                    comp.state.$router = (app as any).router;
                }
            }
            return result;
        };
    }

    destroy(): void {
        if (typeof window !== 'undefined') {
            if (this._popstateListener) {
                window.removeEventListener('popstate', this._popstateListener);
                this._popstateListener = null;
            }
            if (this._hashchangeListener) {
                window.removeEventListener('hashchange', this._hashchangeListener);
                this._hashchangeListener = null;
            }
        }
        this.progress.destroy();
        this._eventListeners = {};
        this._afterEachHooks = [];
    }

    _getCurrentPath(): string {
        if (this.mode === 'history') {
            return window.location.pathname || '/';
        }
        const hash = window.location.hash.slice(1);
        return hash.split('?')[0] || '/';
    }

    _getCurrentQueryString(): string {
        if (this.mode === 'history') {
            return window.location.search.slice(1);
        }
        const hash = window.location.hash.slice(1);
        return hash.split('?')[1] || '';
    }

    _getCurrentQuery(explicitQueryString?: string): Record<string, string> {
        const queryString = explicitQueryString !== undefined ? explicitQueryString : this._getCurrentQueryString();
        if (!queryString) return {};

        const query: Record<string, string> = {};
        queryString.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key) query[decodeURIComponent(key)] = decodeURIComponent(value || '');
        });
        return query;
    }

    private _parseTarget(rawTarget?: string): { path: string; queryString: string; targetKey: string; rawUrl: string } {
        if (typeof rawTarget === 'string') {
            const clean = rawTarget.startsWith('#') ? rawTarget.slice(1) : rawTarget;
            const [rawPath, rawQuery] = clean.split('?');
            const path = rawPath ? (rawPath.startsWith('/') ? rawPath : '/' + rawPath) : '/';
            const queryString = rawQuery || '';
            const rawUrl = queryString ? `${path}?${queryString}` : path;
            return { path, queryString, targetKey: `${path}?${queryString}`, rawUrl };
        }
        const path = this._getCurrentPath();
        const queryString = this._getCurrentQueryString();
        const rawUrl = queryString ? `${path}?${queryString}` : path;
        return { path, queryString, targetKey: `${path}?${queryString}`, rawUrl };
    }

    push(path: string) {
        const normalized = path.startsWith('/') || path.startsWith('#') ? path : '/' + path;
        const cleanTarget = normalized.startsWith('#') ? normalized.slice(1) : normalized;
        this._handleRouteChange(cleanTarget, false, 'push');
    }

    replace(path: string) {
        const normalized = path.startsWith('/') || path.startsWith('#') ? path : '/' + path;
        const cleanTarget = normalized.startsWith('#') ? normalized.slice(1) : normalized;
        this._handleRouteChange(cleanTarget, false, 'replace');
    }

    private _commitBrowserUrl(rawUrl: string, historyAction: 'push' | 'replace' | 'pop'): void {
        if (historyAction === 'pop' || typeof window === 'undefined') return;

        if (this.mode === 'history') {
            if (historyAction === 'replace') {
                window.history.replaceState({}, '', rawUrl);
            } else {
                window.history.pushState({}, '', rawUrl);
            }
        } else {
            const targetHash = '#' + (rawUrl.startsWith('/') ? rawUrl : '/' + rawUrl);
            if (window.location.hash !== targetHash) {
                if (window.history && typeof window.history.pushState === 'function') {
                    if (historyAction === 'replace') {
                        window.history.replaceState({}, '', targetHash);
                    } else {
                        window.history.pushState({}, '', targetHash);
                    }
                } else {
                    this._ignoreNextHashChange = true;
                    window.location.hash = targetHash;
                }
            }
        }
    }

    back() {
        window.history.back();
    }

    forward() {
        window.history.forward();
    }

    go(delta: number) {
        window.history.go(delta);
    }

    _registerPendingMount(promise: Promise<any>): void {
        this._pendingMounts.push(promise);
    }

    private async _waitForPendingMounts(): Promise<void> {
        let safety = 0;
        while (this._pendingMounts.length > 0 && safety < 20) {
            const batch = this._pendingMounts.slice();
            this._pendingMounts = [];
            await Promise.all(batch);
            safety++;
        }
    }

    private _isAsyncLoader(comp: ComponentDef | AsyncComponentLoader): comp is AsyncComponentLoader {
        return typeof comp === 'function' && !(comp as any).template && !(comp as any).data;
    }

    private async _resolveRouteComponents(routes: RouteDef[]): Promise<void> {
        for (const route of routes) {
            if (route && this._isAsyncLoader(route.component)) {
                if (!this._resolvedComponents.has(route.component)) {
                    const loaded = await route.component();
                    const resolved: ComponentDef = (loaded && (loaded as any).default) ? (loaded as any).default : (loaded as ComponentDef);
                    this._resolvedComponents.set(route.component, resolved);
                }
            }
        }
    }

    _getResolvedComponent(route: RouteDef): ComponentDef {
        if (this._isAsyncLoader(route.component)) {
            return this._resolvedComponents.get(route.component) || { template: '' };
        }
        return route.component;
    }

    _handleRouteChange(
        explicitTarget?: string,
        isInitial: boolean = false,
        historyAction: 'push' | 'replace' | 'pop' = 'push'
    ) {
        const { path: newPath, queryString, targetKey, rawUrl } = this._parseTarget(explicitTarget);
        const oldPath: string | null = this._initialized && this.currentRoute ? this.currentRoute() : null;

        // Deduplicate browser hashchange/popstate event when push/replace already started this exact navigation
        if (!isInitial && this._activeNav && this._activeNav.targetKey === targetKey) {
            return;
        }

        // Ignore redundant navigation if already on the exact same route and query
        if (!isInitial && !this._activeNav && this._initialized && this._committedTargetKey === targetKey) {
            return;
        }

        // Save current scroll position for the route we are leaving (before anything changes)
        if (
            !isInitial &&
            oldPath &&
            typeof window !== 'undefined' &&
            typeof window.scrollY === 'number'
        ) {
            this._scrollPositions.set(oldPath, {
                top: window.scrollY || 0,
                left: window.scrollX || 0
            });
        }

        // Cancel any in-flight older navigation
        if (this._activeNav) {
            const prev = this._activeNav;
            this._activeNav = null;
            this._emit('navigation:cancelled', {
                to: prev.to,
                from: prev.from,
                navigationId: prev.id,
                reason: 'superseded'
            });
        }

        const navId = ++this._navigationId;
        this._activeNav = { id: navId, to: newPath, from: oldPath, targetKey };

        // Start progress bar and emit navigation:start
        if (!isInitial) {
            this.progress.start();
        }
        this._emit('navigation:start', {
            to: newPath,
            from: oldPath,
            navigationId: navId
        });

        let nextCalled = false;
        const next = (redirectPathOrAction?: string | false) => {
            if (nextCalled) return;
            nextCalled = true;

            // Ignore if a newer navigation has started
            if (!this._activeNav || this._activeNav.id !== navId) {
                return;
            }

            // Explicit cancellation: next(false)
            if (redirectPathOrAction === false) {
                this._activeNav = null;
                this.progress.done();
                this._emit('navigation:cancelled', {
                    to: newPath,
                    from: oldPath,
                    navigationId: navId,
                    reason: 'guard'
                });
                return;
            }

            // Redirection: next('/other')
            if (typeof redirectPathOrAction === 'string' && redirectPathOrAction.length > 0) {
                this.push(redirectPathOrAction);
                return;
            }

            // Proceed with navigation and component resolution
            this._commitNavigation(navId, newPath, oldPath, queryString, targetKey, rawUrl, isInitial, historyAction);
        };

        if (this.beforeEachHook) {
            try {
                const guardResult = this.beforeEachHook(newPath, oldPath || '', next);
                if (guardResult && typeof guardResult.then === 'function') {
                    guardResult.catch((err: any) => {
                        this._handleNavigationError(navId, newPath, oldPath, err);
                    });
                }
            } catch (err) {
                this._handleNavigationError(navId, newPath, oldPath, err);
            }
        } else {
            next();
        }
    }

    private _applyScroll(to: string, from: string | null, historyAction: 'push' | 'replace' | 'pop'): void {
        if (this.scrollBehavior === false) return;
        if (
            typeof window === 'undefined' ||
            typeof window.scrollTo !== 'function' ||
            (window.navigator && /jsdom/i.test(window.navigator.userAgent || ''))
        ) {
            return;
        }

        const savedPosition = historyAction === 'pop' ? (this._scrollPositions.get(to) || null) : null;

        if (typeof this.scrollBehavior === 'function') {
            const pos = this.scrollBehavior(to, from, savedPosition);
            if (pos && typeof pos === 'object') {
                try {
                    window.scrollTo({
                        top: pos.top ?? 0,
                        left: pos.left ?? 0,
                        behavior: pos.behavior || 'instant' as ScrollBehavior
                    });
                } catch (e) {
                    try { window.scrollTo(pos.left ?? 0, pos.top ?? 0); } catch (err) {}
                }
            }
            return;
        }

        const targetPos = savedPosition || { top: 0, left: 0 };
        try {
            window.scrollTo(targetPos.left ?? 0, targetPos.top ?? 0);
        } catch (e) {}
    }

    private async _commitNavigation(
        navId: number,
        newPath: string,
        oldPath: string | null,
        queryString: string,
        targetKey: string,
        rawUrl: string,
        isInitial: boolean,
        historyAction: 'push' | 'replace' | 'pop'
    ): Promise<void> {
        try {
            const { matched, params } = this._matchRoute(newPath);

            // Resolve any async route components before updating views or URL
            await this._resolveRouteComponents(matched);

            // Verify this navigation is still the active one after async resolution
            if (!this._activeNav || this._activeNav.id !== navId) {
                return;
            }

            // Commit browser URL now that guard and async components have resolved
            if (!isInitial) {
                this._commitBrowserUrl(rawUrl, historyAction);
            }

            this._pendingMounts = [];

            // Update reactive signals (triggers <router-view> effects synchronously)
            this.setRoute(newPath);
            this.setMatched(matched);
            this.setParams(params || {});
            this.setQuery(this._getCurrentQuery(queryString));

            this._initialized = true;
            this._committedTargetKey = targetKey;

            // Wait for all mounted <router-view> components (and nested views / async templates) to finish rendering
            await this._waitForPendingMounts();

            // Verify again that no newer navigation superseded this one during mount
            if (!this._activeNav || this._activeNav.id !== navId) {
                return;
            }

            // Scroll to top (or restore saved position) ONLY after the new view is mounted in the DOM
            if (!isInitial) {
                this._applyScroll(newPath, oldPath, historyAction);
            }

            this._activeNav = null;
            if (!isInitial) {
                this.progress.done();
            }

            this._emit('navigation:complete', {
                to: newPath,
                from: oldPath,
                navigationId: navId
            });

            this._afterEachHooks.slice().forEach(hook => {
                try {
                    hook(newPath, oldPath);
                } catch (err) {
                    console.error('Error in router afterEach hook:', err);
                }
            });
        } catch (err) {
            this._handleNavigationError(navId, newPath, oldPath, err);
        }
    }

    private _handleNavigationError(navId: number, to: string, from: string | null, error: any): void {
        if (!this._activeNav || this._activeNav.id !== navId) {
            return;
        }
        this._activeNav = null;
        this.progress.fail();
        this._emit('navigation:error', {
            to,
            from,
            navigationId: navId,
            error
        });
    }

    _matchRoute(path: string): { matched: RouteDef[]; params: Record<string, string> } {
        const matched: RouteDef[] = [];
        let params: Record<string, string> = {};

        const findMatch = (routes: RouteDef[], currentPath: string, parentPath: string = ''): boolean => {
            for (const route of routes) {
                // Construct full path for this route
                let fullPath = (parentPath + '/' + route.path).replace(/\/+/g, '/');
                if (fullPath !== '/' && fullPath.endsWith('/')) fullPath = fullPath.slice(0, -1);

                // Check if this route matches the beginning of the current path
                const routeParams = this._extractParams(fullPath, currentPath, !!route.children);

                if (routeParams !== null) {
                    matched.push(route);
                    params = { ...params, ...routeParams };

                    if (route.children) {
                        // Continue matching children
                        if (findMatch(route.children, currentPath, fullPath)) {
                            return true;
                        } else {
                            if (!route.children && fullPath === currentPath) {
                                return true;
                            }
                            // If it has children but no child matched, and it's not an exact match for itself, backtrack
                            matched.pop();
                            for (const key in routeParams) {
                                delete params[key];
                            }
                            continue; // Try next sibling route
                        }
                    }
                    return true;
                }
            }
            return false;
        };

        findMatch(this.routes, path);
        return { matched, params };
    }

    _extractParams(pattern: string, path: string, partial: boolean = false): Record<string, string> | null {
        const patternParts = pattern.split('/').filter(p => p);
        const pathParts = path.split('/').filter(p => p);

        if (!partial && patternParts.length !== pathParts.length) {
            return null;
        }
        if (partial && pathParts.length < patternParts.length) {
            return null;
        }

        const params: Record<string, string> = {};
        for (let i = 0; i < patternParts.length; i++) {
            const patternPart = patternParts[i];
            const pathPart = pathParts[i];

            if (patternPart === '*') {
                params['pathMatch'] = '/' + pathParts.slice(i).join('/');
                return params;
            }

            if (patternPart.startsWith(':')) {
                const paramName = patternPart.slice(1);
                if (pathPart === undefined) return null;
                params[paramName] = pathPart;
            } else if (patternPart !== pathPart) {
                return null;
            }
        }

        if (partial && patternParts.length < pathParts.length) {
            const matchedPathSegment = pathParts.slice(0, patternParts.length).join('/');
            const fullPathSegment = patternParts.map((p, i) => p.startsWith(':') ? pathParts[i] : p).join('/');
            if (matchedPathSegment !== fullPathSegment) {
                return null;
            }
        } else if (!partial && patternParts.length !== pathParts.length) {
            return null;
        }

        return params;
    }

    _createRouterLink(): ComponentDef {
        const router = this;
        return {
            props: ['to'],
            template: '<a :href="href" @click="navigate"><slot></slot></a>',
            computed: {
                href() {
                    if (router.mode === 'history') {
                        return (this as any).to;
                    }
                    return '#' + (this as any).to;
                }
            },
            methods: {
                navigate(e: Event) {
                    e.preventDefault();
                    router.push((this as any).to);
                }
            }
        };
    }

    _createRouterView(app: MelodiJS): ComponentDef {
        const router = this;
        return {
            template: '<div class="router-view-container"></div>',
            hooks: {
                mounted() {
                    const state = this as any;
                    const el = state.__lastEl as HTMLElement;

                    if (!el) {
                        console.error('router-view: Could not find element');
                        return;
                    }

                    const container = el.querySelector('.router-view-container') as HTMLElement;
                    if (!container) {
                        console.error('router-view: Could not find container');
                        return;
                    }

                    // Determine depth
                    let depth = 0;
                    let p = el.parentElement;
                    while (p) {
                        if (p.classList.contains('router-view-container')) {
                            depth++;
                        }
                        p = p.parentElement;
                    }

                    let currentComponent: Component | null = null;
                    let currentWrapper: HTMLElement | null = null;

                    // Create an effect that runs whenever matched routes change
                    app.reactivity.createEffect(() => {
                        const matched = router.matched();
                        const route = matched[depth];
                        const transitionName = route ? route.transition : null;

                        // Function to mount new component and register its completion promise
                        const mountNew = (wrapper: HTMLElement) => {
                            if (route) {
                                try {
                                    const compDef = router._getResolvedComponent(route);
                                    const comp = new Component(compDef);
                                    const mountPromise = comp.mount(wrapper, app);
                                    router._registerPendingMount(mountPromise);
                                    return comp;
                                } catch (e) {
                                    console.error('Error mounting route component:', e);
                                    wrapper.innerHTML = '<div>Error loading component</div>';
                                    router._registerPendingMount(Promise.reject(e));
                                    return null;
                                }
                            }
                            return null;
                        };

                        const raf = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
                            ? window.requestAnimationFrame.bind(window)
                            : (cb: Function) => setTimeout(cb, 16);

                        if (transitionName) {
                            // --- Transition Logic ---

                            // 1. Handle old component (Leave) FIRST by freezing its exact viewport position
                            // so that resetting window scroll for the new page never causes the old page to jump upward
                            if (currentWrapper) {
                                const oldWrapper = currentWrapper;
                                const oldComp = currentComponent;

                                try {
                                    const rect = oldWrapper.getBoundingClientRect();
                                    if (rect && rect.width > 0) {
                                        oldWrapper.style.position = 'fixed';
                                        oldWrapper.style.top = `${rect.top}px`;
                                        oldWrapper.style.left = `${rect.left}px`;
                                        oldWrapper.style.width = `${rect.width}px`;
                                        oldWrapper.style.pointerEvents = 'none';
                                        oldWrapper.style.zIndex = '1';
                                    }
                                } catch (e) {}

                                oldWrapper.classList.add(`${transitionName}-leave-from`);
                                oldWrapper.classList.add(`${transitionName}-leave-active`);

                                // Force reflow
                                void oldWrapper.offsetWidth;

                                // Next frame
                                raf(() => {
                                    oldWrapper.classList.remove(`${transitionName}-leave-from`);
                                    oldWrapper.classList.add(`${transitionName}-leave-to`);
                                });

                                // Cleanup after transition
                                const onTransitionEnd = () => {
                                    if (oldWrapper.parentNode === container) {
                                        container.removeChild(oldWrapper);
                                    }
                                    if (oldComp) {
                                        try { oldComp.unmount(); } catch (e) { }
                                    }
                                };

                                setTimeout(onTransitionEnd, 500);
                                oldWrapper.addEventListener('transitionend', onTransitionEnd, { once: true });
                            }

                            // 2. Prepare and mount new component
                            const newWrapper = document.createElement('div');
                            newWrapper.className = `route-wrapper`;
                            newWrapper.classList.add(`${transitionName}-enter-from`);
                            newWrapper.classList.add(`${transitionName}-enter-active`);

                            container.appendChild(newWrapper);
                            const newComp = mountNew(newWrapper);

                            // 3. Handle new component (Enter)
                            void newWrapper.offsetWidth;

                            raf(() => {
                                newWrapper.classList.remove(`${transitionName}-enter-from`);
                                newWrapper.classList.add(`${transitionName}-enter-to`);

                                const onEnterEnd = () => {
                                    newWrapper.classList.remove(`${transitionName}-enter-active`);
                                    newWrapper.classList.remove(`${transitionName}-enter-to`);
                                };
                                setTimeout(onEnterEnd, 500);
                                newWrapper.addEventListener('transitionend', onEnterEnd, { once: true });
                            });

                            currentComponent = newComp;
                            currentWrapper = newWrapper;

                        } else {
                            // --- No Transition (Instant) ---

                            container.innerHTML = '';
                            if (currentComponent) {
                                try {
                                    currentComponent.unmount();
                                } catch (e) {
                                    console.error('Error unmounting component:', e);
                                }
                                currentComponent = null;
                            }
                            currentWrapper = null;

                            if (route) {
                                const wrapper = document.createElement('div');
                                wrapper.className = 'route-wrapper';
                                container.appendChild(wrapper);
                                currentComponent = mountNew(wrapper);
                                currentWrapper = wrapper;
                            }
                        }
                    });
                }
            }
        };
    }
}
