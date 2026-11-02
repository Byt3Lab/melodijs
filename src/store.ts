import { MelodiJS, Plugin } from './melodijs.js';

export interface StoreOptions {
    state: (() => Record<string, any>) | Record<string, any>;
    mutations?: Record<string, (state: any, payload?: any) => any>;
    actions?: Record<string, (context: StoreContext, ...args: any[]) => any>;
    getters?: Record<string, (state: any) => any>;
}

export interface StoreContext {
    state: any;
    dispatch: (actionName: string, ...args: any[]) => any;
    commit: (mutationName: string, payload?: any) => any;
}

export class MelodiStore implements Plugin {
    private _state: any;
    private _mutations: Record<string, Function>;
    private _actions: Record<string, Function>;
    private _getters: Record<string, (state: any) => any>;
    private _computedGetters: Record<string, any> = {};
    private _app: MelodiJS | null = null;

    constructor(options: StoreOptions) {
        this._mutations = {};
        this._actions = {};
        this._getters = {};

        // Initialize state (supports function or plain object)
        if (typeof options.state === 'function') {
            this._state = options.state();
        } else if (options.state && typeof options.state === 'object') {
            this._state = options.state;
        } else {
            this._state = {};
        }

        // Setup mutations
        if (options.mutations) {
            Object.keys(options.mutations).forEach(key => {
                this._mutations[key] = options.mutations![key];
            });
        }

        // Setup actions
        if (options.actions) {
            Object.keys(options.actions).forEach(key => {
                this._actions[key] = options.actions![key];
            });
        }

        // Setup getters (will be made reactive during install)
        if (options.getters) {
            Object.keys(options.getters).forEach(key => {
                const getterFn = options.getters![key];
                this._getters[key] = getterFn;
            });
        }
    }

    get state() {
        return this._state;
    }

    get getters() {
        return this._computedGetters;
    }

    commit(mutationName: string, payload?: any) {
        const mutation = this._mutations[mutationName];
        if (!mutation) {
            console.error(`Mutation '${mutationName}' not found in store`);
            return;
        }
        return mutation(this._state, payload);
    }

    dispatch(actionName: string, ...args: any[]) {
        const action = this._actions[actionName];
        if (!action) {
            console.error(`Action '${actionName}' not found in store`);
            return;
        }
        const context: StoreContext = {
            state: this._state,
            dispatch: this.dispatch.bind(this),
            commit: this.commit.bind(this)
        };
        return action.call(context, context, ...args);
    }

    install(app: MelodiJS) {
        this._app = app;

        // Make state reactive using app's reactivity system
        const reactiveState: any = {};
        for (const key of Object.keys(this._state)) {
            const [getter, setter] = app.reactivity.createSignal(this._state[key]);

            // Handle array reactivity
            let initialValue = this._state[key];
            if (Array.isArray(initialValue)) {
                initialValue = this._makeReactiveArray(initialValue, setter);
                setter(initialValue); // Update signal to hold proxy
            }

            Object.defineProperty(reactiveState, key, {
                get: getter,
                set: (newValue) => {
                    if (Array.isArray(newValue)) {
                        newValue = this._makeReactiveArray(newValue, setter);
                    }
                    setter(newValue);
                },
                enumerable: true,
                configurable: true
            });
        }
        this._state = reactiveState;

        // Make getters reactive
        this._computedGetters = {};
        Object.keys(this._getters).forEach(key => {
            const getterFn = this._getters[key];
            const memo = app.reactivity.createMemo(() => getterFn(this._state));
            Object.defineProperty(this._computedGetters, key, {
                get: memo,
                enumerable: true,
                configurable: true
            });
        });

        // Create store object with state, getters, commit and dispatch
        const store = {
            state: this._state,
            getters: this._computedGetters,
            commit: this.commit.bind(this),
            dispatch: this.dispatch.bind(this)
        };

        // Replace the simple store with our MelodiStore
        app.store = store;
    }

    private _makeReactiveArray(arr: any[], setter: (v: any) => void): any[] {
        const mutatingMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];
        const self = this;

        const proxy = new Proxy(arr, {
            get(target, prop) {
                const value = (target as any)[prop];

                // Intercept mutating methods
                if (typeof prop === 'string' && mutatingMethods.includes(prop)) {
                    return function (...args: any[]) {
                        const result = (Array.prototype as any)[prop].apply(target, args);
                        setter(proxy); // Trigger reactivity
                        return result;
                    };
                }

                // Deep reactivity: if value is object, wrap it
                if (value && typeof value === 'object') {
                    return self._makeDeepReactive(value, () => setter(proxy));
                }

                return value;
            },
            set(target, prop, value) {
                (target as any)[prop] = value;
                setter(proxy); // Trigger reactivity
                return true;
            }
        });
        return proxy;
    }

    private _makeDeepReactive(obj: any, trigger: () => void): any {
        // Avoid re-wrapping proxies
        if (obj.__isProxy) return obj;

        return new Proxy(obj, {
            get(target, prop) {
                const value = (target as any)[prop];
                if (prop === '__isProxy') return true;

                // Recursive deep reactivity
                if (value && typeof value === 'object') {
                    return new Proxy(value, {
                        get: (t, p) => {
                            if (p === '__isProxy') return true;
                            return (t as any)[p];
                        },
                        set: (t, p, v) => {
                            (t as any)[p] = v;
                            trigger();
                            return true;
                        }
                    });
                }
                return value;
            },
            set(target, prop, value) {
                (target as any)[prop] = value;
                trigger();
                return true;
            }
        });
    }
}
