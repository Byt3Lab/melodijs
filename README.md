# Réactivité fine-grain MelodiJS (v2)

## Utilisation dans vos composants

### 1. Déclaration d’état

Déclarez l’état dans `data()` comme avant :

```js
data() { return { count: 0 } }
```

Chaque propriété d’état devient un signal réactif. Accédez-y normalement :

```js
this.count = this.count + 1
```

### 2. Interpolations réactives

Toute interpolation `{{ ... }}` dans le template est automatiquement réactive et met à jour le DOM dès que la valeur change, sans re-render global.

### 3. Modèles v-model

`v-model` fonctionne de façon fine-grain : l’input est synchronisé avec la propriété d’état ciblée, et toute modification de l’état met à jour l’input instantanément.

### 4. Store global

Le store global (`this.$store`) est aussi réactif : toute interpolation ou expression utilisant `$store` sera mise à jour automatiquement.

### 5. Bonnes pratiques

- Utilisez des templates statiques (pas de génération dynamique de balises dans `data`).
- Privilégiez les expressions simples dans les `{{ ... }}` pour de meilleures performances.
- Les méthodes et hooks fonctionnent comme avant.

### 6. Exemple

```js
const app = createApp({
  components: {
    'my-counter': {
      template: `<div><button @click="inc">+</button> <span>{{ count }}</span></div>`,
      data() { return { count: 0 } },
      methods: { inc() { this.count++ } }
    }
  }
})
```

## Migration

Vos anciens composants sont compatibles, mais bénéficient désormais de la réactivité fine-grain automatiquement.
# MelodiJS — Petite librairie réactive (guide complet pour débutants)

> Version minimale d'un micro-framework réactif inspiré par Vue/React.

Ce document explique comment utiliser MelodiJS, écrire des composants, travailler avec les directives (v-if, v-for, v-show...), les slots, la communication parent-enfant ($emit / $on), et la store globale. Le guide est en français et vise les débutants.

## Table des matières
- Présentation rapide
- Installation / essai local
- Concepts clés
  - createApp & mount
  - composants (template, data, methods, props)
  - cycle de vie (hooks)
  - réactivité (Proxy)
  - store global
- Templates et sources
- Directives supportées
  - interpolation `{{ ... }}` (expressions JS)
  - `v-if`, `v-else-if`, `v-else`
  - `v-show`
  - `v-for`
  - `v-pre`
  - `v-model`
  - Event shorthand `@event`
- Slots (default & named) et réactivité des slots
- Événements parent-enfant : `$emit` / `$on`
- Examples pratiques
- Bonnes pratiques & limitations
- Débogage et FAQ
- Prochaines améliorations possibles

---

## Présentation rapide

MelodiJS est une petite bibliothèque JavaScript minimale pour construire des composants HTML dynamiques sans build tools. Elle fournit :

- Un moyen simple de déclarer des composants (template + data + methods).
- Une réactivité basique via `Proxy` : quand vous changez `this.someProp`, le composant se re-render.
- Directives structurales (`v-if`, `v-for`, `v-show`) et interpolation `{{ ... }}` qui évaluent des expressions JavaScript.
- Slots (content projection), props, et un store global simple accessible via `this.$store`.
- Un API évènementielle `$emit` / `$on` pour la communication enfant → parent (bubbling vers les ancêtres).

Le runtime principal se trouve dans `melodijs.js` et n'a pas de dépendances extérieures.

## Installation / essai local

1. Ouvrez le dossier du projet dans votre serveur static local. Par exemple, depuis la racine du projet :

```bash
python3 -m http.server 8000
# puis ouvrez http://localhost:8000/index.html
```

2. Le fichier `index.html` de démonstration montre plusieurs composants et cas d'usage.

## Concepts clés

### createApp & mount

La librairie expose `createApp(options)`.

options possibles :

- `store` : objet initial pour le store global (reactif)
- `components` : map nom -> définition du composant

Exemple :

```js
import { createApp } from './melodijs.js'

const app = createApp({
  store: { sharedCount: 0 },
  components: {
    'my-comp': { template: '<div>hello</div>', data(){ return {} } }
  }
})

app.mount('#app')
```

`mount(target)` prend un sélecteur CSS ou un élément DOM.

### Composant : forme d'une définition

Un composant est un objet qui peut contenir :

- `template`: chaîne, ou `{ el: '#id' }` pour prendre le HTML d'un `<template>`, ou `{ url: '...' }` pour fetcher.
- `data()` : fonction retournant l'état initial (objet). `this` n'est pas lié; utilisez `this` depuis les méthodes.
- `methods`: objet de fonctions, qui seront liées au `state` du composant.
- `props`: tableau de noms ou objet { name: { type: Type, default: ... } }
- `hooks`: objet contenant `beforeMount`, `mounted`, `beforeUpdate`, `updated`, `unmounted`.

Exemple :

```js
'my-counter': {
  template: `<div><button @click="decrement">-</button> {{ count }} <button @click="increment">+</button></div>`,
  props: { start: { type: Number, default: 0 } },
  data(){ return { count: this.start } },
  methods: { increment(){ this.count++ }, decrement(){ this.count-- } }
}
```

### Cycle de vie (hooks)

Les hooks disponibles dans `hooks` :
- `beforeMount()` — appelé avant le premier rendu
- `mounted()` — après le premier rendu
- `beforeUpdate()` — avant un rendu déclenché par une modification
- `updated()` — après un rendu déclenché par une modification
- `unmounted()` — lors du démontage

Appelez-les depuis l'objet `hooks` (les fonctions reçoivent `this` lié au state du composant).

### Réactivité

L'état du composant est un `Proxy` qui déclenche `_render()` de façon asynchrone (microtask) quand vous changez une propriété. Par exemple : `this.count = 5` déclenchera un re-render.

### Store global

La propriété `store` fournie à `createApp({ store: { ... } })` devient accessible à chaque composant via `this.$store`. C'est un objet réactif : modifier `this.$store.foo` provoquera le re-render des composants montés.

## Templates et sources

Un `template` peut être :

- Une chaîne (HTML) directement dans la définition.
- `{ el: '#tpl' }` pour récupérer le contenu d'un `<template id="tpl">` dans la page.
- `{ url: '/path/to/template.html' }` pour récupérer le template via fetch (asynchrone).

Note : si le template est vide, la librairie prendra `el.innerHTML` (le contenu light DOM) comme template.

## Directives supportées

### Interpolation `{{ ... }}`

- Vous pouvez écrire des expressions JavaScript complètes dans les moustaches. L'expression est évaluée avec accès à l'état du composant (this/state) et au scope local (par ex. variables introduites par `v-for`).
- Exemples : `{{ count }}`, `{{ items.length }}`, `{{ item.name.toUpperCase() }}`.
- Attention : ceci exécute du JavaScript passé par le template — évitez d'évaluer du contenu non fiable.

### v-if / v-else-if / v-else

- `v-if="expression"` : rend la balise uniquement si `expression` est truthy.
- `v-else-if="expression"` et `v-else` fonctionnent en chaîne : la librairie recherche la première branche vraie.
- Les noeuds texte contenant uniquement des espaces entre les branches sont ignorés (vous pouvez formater votre HTML librement).

Exemple :

```html
<div v-if="user">Bonjour {{ user.name }}</div>
<div v-else>Pas connecté</div>
```

### v-show

- `v-show="expression"` applique un `style="display:none"` quand `expression` est false. La balise reste présente dans le DOM.

### v-for

- Deux formes :
  - `v-for="item in items"` pour les tableaux
  - `v-for="(val, key) in obj"` pour les objets (dictionnaires) — `key` contient la propriété, `val` la valeur

Exemples :

```html
<li v-for="(it, idx) in items">{{ idx }} - {{ it }}</li>
<li v-for="(val, key) in dict">{{ key }} -> {{ val.name }}</li>
```

Note : l'expression après `in` peut être n'importe quelle expression JS (p.ex. `getList()` si définie dans l'état).

### v-pre

- `v-pre` sur un élément désactive le traitement des directives et des moustaches dans cette sous-arbre. Utile pour afficher du code source ou du raw template.

### v-model

- `v-model="propName"` lie un input (ou select/textarea) à `this.propName`. Les changements d'input mettent à jour l'état.

### @event (raccourci)

- `@click="doSomething"` est transformé en `data-on-click="doSomething"` et la librairie attache la méthode correspondante.

## Slots (default & named) et réactivité des slots

- Les composants peuvent utiliser `<slot>` pour recevoir du contenu depuis leur utilisation (light DOM).
- Slots nommés : `<slot name="footer"></slot>` et dans le parent : `<div slot="footer">...<div>`.
- Réactivité des slots : MelodiJS copie le contenu light DOM dans un conteneur interne (`_slotSource`) au moment du montage puis le réinsère à chaque rendu (clonage). Cela permet que le contenu du slot soit retraité (directives, interpolation) à chaque render.

Comment mettre à jour un slot depuis le code (exemple avancé) :

```js
const panel = document.querySelector('panel-box')
panel.__melodijs_instance._slotSource.innerHTML = '<p>nouveau contenu</p>'
panel.__melodijs_instance._render()
```

Note : ceci utilise les propriétés internes `_slotSource` et `_render()` exposées par l'instance. Si vous préférez une API publique pour cela, on peut l'ajouter.

## Événements parent-enfant: `$emit` / `$on`

- Dans une méthode (ou depuis le `state`), vous pouvez appeler `this.$emit('event-name', payload)` pour émettre un événement local.
- Les handlers enregistrés via `this.$on('event-name', handler)` seront appelés : d'abord les handlers locaux, puis la librairie remontera la chaîne DOM vers les ancêtres et appellera les handlers définis sur les composants ancêtres (bubbling). Les handlers sont liées au `state` du composant qui les enregistre.

Exemple :

```js
// child
methods: {
  send(){ this.$emit('child-ping', { msg: 'hello' }) }
}

// parent (dans hooks.mounted)
hooks: { mounted(){ this.$on('child-ping', payload => { console.log('got', payload) }) } }
```

## Examples pratiques

### 1) Counter

```js
'my-counter': {
  template: `
    <div>
      <button @click="decrement">-</button>
      <span>{{ count }}</span>
      <button @click="increment">+</button>
      <input type="number" v-model="count" />
    </div>`,
  data(){ return { count: 0 } },
  methods: {
    increment(){ this.count = Number(this.count) + 1 },
    decrement(){ this.count = Number(this.count) - 1 }
  }
}
```

### 2) v-for over object

```html
<ul>
  <li v-for="(val, key) in itemsObj">{{ key }} => {{ val.name }}</li>
<ul>
```

### 3) Parent/Child communication

Parent component :

```js
hooks: { mounted(){ this.$on('child-ping', payload => { this.message = payload }) } }
```

Child :

```js
methods: { ping(){ this.$emit('child-ping', 'hello parent') } }
```

## Bonnes pratiques & limitations

- Séparez logique et template : gardez les expressions dans `{{}}` courtes et de préférence lisibles.
- L'évaluation des moustaches accepte du JS arbitraire — évitez d'exécuter du code non fiable provenant d'utilisateurs.
- Cette implémentation n'utilise pas de virtual DOM : chaque changement provoque une réécriture (innerHTML) du contenu du composant. Pour des UIs très performantes ou avec de très grands arbres DOM, une approche plus fine (diffing) serait préférable.
- Slots : la stratégie actuelle déplace les enfants originaux dans un conteneur interne. Si vous avez du code externe qui modifie directement les enfants après le montage, ces modifications ne seront pas visibles à moins de mettre à jour `_slotSource` ou d'ajouter un mécanisme pour relire `this.el` à chaque render.

## Débogage & FAQ

- "Mes moustaches ne s'évaluent pas" — vérifiez que vous n'avez pas `v-pre` sur l'élément parent. Vérifiez aussi la console pour les erreurs JS dans vos expressions.
- "v-if ne marche pas entre balises" — il est maintenant tolerant aux sauts de ligne / espaces entre branches. Assurez-vous que les blocs `v-if` / `v-else-if` / `v-else` sont sur le même niveau DOM.
- "v-for ne boucle pas sur un objet" — utilisez la forme `(val, key) in obj` ; l'expression après `in` est evaluée comme JS et peut être n'importe quoi retournant un objet.

## Prochaines améliorations possibles

- API publique pour mettre à jour le contenu de slot au lieu d'utiliser `_slotSource`.
- Meilleure sandboxing des expressions JS.
- Un système de propagation d'événements plus fin (stopPropagation, non-bubbling, event object complet).
- Support de bindings d'attribut `:class`, `:style` etc.

---

Si vous voulez que j'ajoute une section d'API générée automatiquement (liste des méthodes publiques, signatures et exemples de tests unitaires), je peux l'ajouter. Voulez-vous que je crée aussi un `docs.html` interactif à partir de ce README ?
# MelodiJS — tiny reactive components

This repo contains a minimal reactive component library inspired by Vue.js. It supports:

- Component definitions with `template`, `data()`, `methods`, and `props` (declaration/validation)
- Reactive local state via `Proxy`
- Global reactive `store` shared between components (`this.$store` in methods and `{{ $store.some }}` in templates)
- Template sources: inline string, `<template id="...">` via `{ el: '#id' }`, or remote file via `{ url: '...' }` (requires serving over HTTP)
- Event shorthand `@click`, `v-model` two-way binding
- Lifecycle hooks: `beforeMount`, `mounted`, `beforeUpdate`, `updated`, `unmounted` (prefer declared in `hooks` or top-level keys; backward compatible with old `methods` placement)
- `unmount()` cleanup to remove listeners and deregister from app store notifications

Quick start

1. Serve the project folder over HTTP (recommended):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

2. Open `index.html` in your browser.

Testing

This repo includes a small test harness using `jsdom`.

Install and run tests:

```bash
npm install
npm test
```

Notes

- The library is intentionally tiny and unoptimized: re-renders replace component innerHTML. Good for small demos and prototyping.
- Template fetching uses `fetch()` and therefore requires serving files over HTTP.
