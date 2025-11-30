import { MelodiJS, Plugin, ComponentDef, Component } from './melodijs.js';

export interface RouteDef {
    path: string;
    component: ComponentDef;
    children?: RouteDef[];
}

export class MelodiRouter implements Plugin {
    routes: RouteDef[];
    currentRoute: any; // Signal
    setRoute: any; // Signal setter
    params: any; // Route params signal
    setParams: any;
    query: any; // Query params signal
    setQuery: any;
    matched: any; // Signal for matched routes array
    setMatched: any;
    beforeEachHook: ((to: string, from: string, next: (path?: string) => void) => void) | null = null;

    constructor(options: { routes: RouteDef[] }) {
        this.routes = options.routes;
        this.currentRoute = null;
        this.setRoute = null;
        this.params = null;
        this.setParams = null;
        this.query = null;
        this.setQuery = null;
        this.matched = null;
        this.setMatched = null;
    }

    beforeEach(hook: (to: string, from: string, next: (path?: string) => void) => void) {
        this.beforeEachHook = hook;
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

        // Listen to hash changes
        window.addEventListener('hashchange', () => {
            this._handleRouteChange();
        });

        // Initial route
        this._handleRouteChange();

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

    _getCurrentPath(): string {
        const hash = window.location.hash.slice(1);
        return hash.split('?')[0] || '/';
    }

    _getCurrentQuery(): Record<string, string> {
        const hash = window.location.hash.slice(1);
        const queryPart = hash.split('?')[1];
        if (!queryPart) return {};

        const query: Record<string, string> = {};
        queryPart.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key) query[decodeURIComponent(key)] = decodeURIComponent(value || '');
        });
        return query;
    }

    push(path: string) {
        window.location.hash = path;
    }

    _handleRouteChange() {
        const newPath = this._getCurrentPath();
        const oldPath = this.currentRoute ? this.currentRoute() : null;

        const next = (redirectPath?: string) => {
            if (redirectPath) {
                this.push(redirectPath);
                return;
            }

            // Proceed with navigation
            this.setRoute(newPath);
            const { matched, params } = this._matchRoute(newPath);
            this.setMatched(matched);
            this.setParams(params || {});
            this.setQuery(this._getCurrentQuery());

            // Scroll to top
            window.scrollTo(0, 0);
        };

        if (this.beforeEachHook) {
            this.beforeEachHook(newPath, oldPath, next);
        } else {
            next();
        }
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
                        // The remaining path for children is the currentPath itself, as we matched a prefix
                        // We need to ensure the child matching continues from the *currentPath* not a truncated one
                        // The `_extractParams` for children will handle the full path matching
                        if (findMatch(route.children, currentPath, fullPath)) {
                            return true;
                        } else {
                            // If children didn't match, this route itself might be the final match
                            // But if it has children, it's usually meant to be a parent.
                            // For exact match, we need to check if currentPath is exactly fullPath
                            if (!route.children && fullPath === currentPath) {
                                return true;
                            }
                            // If it has children but no child matched, and it's not an exact match for itself, backtrack
                            matched.pop();
                            // Remove params specific to this route if backtracking
                            for (const key in routeParams) {
                                delete params[key];
                            }
                            continue; // Try next sibling route
                        }
                    }
                    // If no children, or children matching failed, this route is the final match if fullPath matches currentPath exactly
                    if (fullPath === currentPath) {
                        return true;
                    } else {
                        // If it has no children but it's not an exact match, backtrack
                        matched.pop();
                        for (const key in routeParams) {
                            delete params[key];
                        }
                        continue; // Try next sibling route
                    }
                }
            }
            return false;
        };

        findMatch(this.routes, path);
        console.log('Router Match:', path, matched);
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

            if (patternPart.startsWith(':')) {
                const paramName = patternPart.slice(1);
                if (pathPart === undefined) return null; // Path is shorter than pattern for a param
                params[paramName] = pathPart;
            } else if (patternPart !== pathPart) {
                return null;
            }
        }

        // If partial match, ensure the matched part is a prefix of the path
        if (partial && patternParts.length < pathParts.length) {
            // Check if the matched pattern is a prefix of the path
            const matchedPathSegment = pathParts.slice(0, patternParts.length).join('/');
            const fullPathSegment = patternParts.map((p, i) => p.startsWith(':') ? pathParts[i] : p).join('/');
            if (matchedPathSegment !== fullPathSegment) {
                return null;
            }
        } else if (!partial && patternParts.length !== pathParts.length) {
            // If not partial, lengths must be exactly equal
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
                    return '#' + (this as any).to;
                }
            },
            methods: {
                navigate(e: Event) {
                    // Default behavior of anchor with hash is fine
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
                        // Check if p has class router-view-container, then we are inside one.
                        if (p.classList.contains('router-view-container')) {
                            depth++;
                        }
                        p = p.parentElement;
                    }
                    console.log('RouterView mounted. Depth:', depth);

                    let currentComponent: Component | null = null;

                    // Create an effect that runs whenever matched routes change
                    app.reactivity.createEffect(() => {
                        const matched = router.matched();
                        console.log('RouterView update. Depth:', depth, 'Matched:', matched);
                        const route = matched[depth];

                        // Clear previous content
                        container.innerHTML = '';
                        if (currentComponent) {
                            try {
                                currentComponent.unmount();
                            } catch (e) {
                                console.error('Error unmounting component:', e);
                            }
                            currentComponent = null;
                        }

                        if (route) {
                            // Mount new component
                            try {
                                const comp = new Component(route.component);
                                comp.mount(container, app);
                                currentComponent = comp;
                            } catch (e) {
                                console.error('Error mounting route component:', e);
                                container.innerHTML = '<div>Error loading component</div>';
                            }
                        } else {
                            // If no route matched at this depth, render nothing
                        }
                    });
                }
            }
        };
    }
}
