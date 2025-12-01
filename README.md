# MelodiJS 🎵

**A progressive, ultra-lightweight JavaScript framework for building user interfaces.**

MelodiJS combines the intuitive Options API of Vue.js with a fine-grained reactivity system inspired by SolidJS. It delivers surgical DOM updates without a virtual DOM, making it perfect for modern web applications that demand both simplicity and performance.

## Features

✨ **Fine-Grained Reactivity** - Signal-based reactivity system with surgical DOM updates  
⚡ **No Virtual DOM** - Direct, targeted updates to exact DOM nodes  
🪶 **Tiny Footprint** - ~3KB gzipped core  
🎯 **Familiar API** - If you know Vue, you know MelodiJS  
📦 **Batteries Included** - Built-in router and store for complete application development  
🔄 **Deep Reactivity** - Automatic tracking of nested objects and array mutations  
🎨 **Template Flexibility** - Inline strings, element selectors, or external URLs

## Installation

### Via CDN

```html
<script type="module">
  import { createApp } from 'https://unpkg.com/melodijs';
  
  createApp({
    data: () => ({ message: 'Hello MelodiJS!' })
  }).mount('#app');
</script>
```

### Via NPM

```bash
npm install melodijs
```

```javascript
import { createApp } from 'melodijs';
import { MelodiRouter } from 'melodijs/router';
import { MelodiStore } from 'melodijs/store';
```

## Quick Start

```javascript
import { createApp } from 'melodijs';

const app = createApp({
  data: () => ({
    count: 0,
    message: 'Hello World'
  }),
  computed: {
    doubleCount() {
      return this.count * 2;
    }
  },
  methods: {
    increment() {
      this.count++;
    }
  },
  template: `
    <div>
      <h1>{{ message }}</h1>
      <p>Count: {{ count }}</p>
      <p>Double: {{ doubleCount }}</p>
      <button @click="increment">Increment</button>
    </div>
  `
});

app.mount('#app');
```

## Core Concepts

### Reactivity

Every property in your `data` function becomes a fine-grained reactive signal. Updates are surgical and target exact DOM nodes.

```javascript
data: () => ({
  items: [1, 2, 3],
  user: { name: 'John', age: 30 }
})

// All mutations are reactive
this.items.push(4);           // ✅ Reactive
this.user.age++;              // ✅ Reactive (deep reactivity)
this.items[0] = 99;           // ✅ Reactive
```

### Template Syntax

MelodiJS supports Vue-like template syntax:

- **Interpolation**: `{{ expression }}`
- **Attribute binding**: `:attr="value"` or `v-bind:attr="value"`
- **Event handling**: `@click="handler"` or `v-on:click="handler"`
- **Directives**: `v-if`, `v-else-if`, `v-else`, `v-show`, `v-for`, `v-model`, `v-pre`

### Components

```javascript
createApp({
  components: {
    'my-button': {
      props: ['label'],
      template: '<button @click="handleClick">{{ label }}</button>',
      methods: {
        handleClick() {
          this.$emit('clicked', { time: Date.now() });
        }
      }
    }
  }
}).mount('#app');
```

### Router

Built-in SPA router with dynamic routes, nested routes, and navigation guards:

```javascript
import { MelodiRouter } from 'melodijs/router';

const router = new MelodiRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/user/:id', component: User },
    {
      path: '/admin',
      component: Admin,
      children: [
        { path: 'users', component: AdminUsers },
        { path: 'settings', component: AdminSettings }
      ]
    }
  ]
});

router.beforeEach((to, from, next) => {
  if (to === '/admin' && !isAuthenticated()) {
    next('/login');
  } else {
    next();
  }
});

app.use(router);
```

### State Management

Centralized state with MelodiStore:

```javascript
import { MelodiStore } from 'melodijs/store';

const store = new MelodiStore({
  state: () => ({
    count: 0,
    todos: []
  }),
  actions: {
    increment() {
      this.state.count++;
    },
    addTodo(text) {
      this.state.todos.push({ id: Date.now(), text, done: false });
    }
  },
  getters: {
    completedTodos: (state) => state.todos.filter(t => t.done)
  }
});

app.use(store);
```

## Documentation

For complete documentation, examples, and API reference, visit:

**📚 [Full Documentation](./docs/index.html)**

Topics covered:
- Template Syntax & Options
- Reactivity Fundamentals
- Computed Properties & Watchers
- Component Basics, Props, Events & Slots
- Lifecycle Hooks
- Router (Dynamic Routes, Nested Routes, Navigation Guards)
- State Management (Deep Reactivity, Actions, Getters)
- Transitions & Animations
- Plugin System

## Examples

Check out the `examples/` directory for complete working applications:

- **Shop** - E-commerce app with cart, product details, and checkout
- **MelodiBook** - Social network with authentication and nested routes

## Development

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run tests
npm test

# Serve examples locally
python3 -m http.server 8000
```

## Architecture

MelodiJS uses a fine-grained reactivity system:

- **Signals** - Each reactive property is a signal (getter/setter pair)
- **Effects** - Automatic tracking of dependencies and targeted DOM updates
- **No Virtual DOM** - Direct manipulation of specific DOM nodes
- **Computed Values** - Memoized reactive computations
- **Deep Reactivity** - Nested objects and arrays are automatically tracked

## Browser Support

Modern browsers with ES6+ support (Chrome, Firefox, Safari, Edge).

## TypeScript

MelodiJS is written in TypeScript and provides full type definitions.

## License

Licensed under the GNU General Public License v3.0 - see [LICENSE](./LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

---

**Built with ❤️ for developers who value simplicity and performance**
