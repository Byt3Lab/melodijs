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
  # MelodiJS — résumé, structure et guide rapide

  Ce dépôt contient MelodiJS, une petite bibliothèque JavaScript réactive inspirée par Vue et Solid.

  Objectif : fournir des composants HTML réactifs légers sans Virtual DOM. La réactivité est implémentée par un moteur de signaux (fine-grained) situé dans `melodijs.js`.

  Ce README met à jour et synthétise les informations principales : fonctionnalités, structure du projet, logique interne, et instructions pour démarrer et tester.

  ## Points clés / fonctionnalités

  - Réactivité fine-grain basée sur des « signaux » (MelodiReactive) : chaque propriété d'état est un signal (getter/setter) qui notifie des effets.
  - API familière type Vue : `createApp`, `components`, `data()`, `methods`, `props`, `hooks`, `computed`.
  - Directives supportées : interpolation `{{ ... }}`, `v-if`, `v-else-if`, `v-else`, `v-show`, `v-for`, `v-model`, `v-pre`, `:attr` / `v-bind:` et `@event` (raccourci de `v-on`).
  - Slots (nommés et par défaut) : contenu light DOM distribué dans le template via `<slot>`.
  - Store global réactif accessible via `this.$store`.
  - Événements personnalisés : `this.$emit(name, payload)` et `this.$on(name, handler)` (bubbling vers ancêtres).
  - Support minimal pour templates externes : `{ el: '#tpl' }` et `{ url: '/path' }` (fetch).

  ## Structure du projet (fichiers importants)

  - `melodijs.js` — runtime principal (exporte `createApp`). Contient :
    - `MelodiReactive` : primitives signaux/effets/memo.
    - `MelodiJS` : instance d'application (gestion des composants, store, montage).
    - `Component` : logique de compilation / rendu des templates, directives, binding, slots, effets et cleanup.
  - `index.html`, `test_*.html`, `docs/` — exemples et documentation HTML.
  - `tests/run-tests.js` — harness jsdom pour vérifier `v-if`, `v-show`, `v-model`, props et store partagé.
  - `package.json` — script `test` (node tests/run-tests.js) et `devDependencies` (jsdom).

  ## Logique principale (en bref)

  - Réactivité : chaque propriété d'un état est encapsulée par `createSignal(value)` qui expose un getter et un setter. Les getters enregistrent l'effet courant (`_currentEffect`) et les setters notifient les subscribers.
  - Effets : `createEffect(fn)` exécute `fn` et enregistre les dépendances (via getters appelés dans `fn`). Les effets sont utilisés pour synchroniser le DOM (text nodes, attributs, styles, etc.).
  - Rendering : le composant compile son template (ou utilise le contenu initial de l'élément), traite les directives et construit un fragment DOM. Les interpolations textuelles et les bindings installent des effets pour mettre à jour les nodes.
  - v-for : support basique avec option `:key` pour essayer de réutiliser / diff-er les éléments. Sans clé, le comportement recrée les éléments.
  - Slots : le contenu light DOM est stocké dans `_slotSource` et cloné dans le template au moment du rendu.
  - Events : `this.$emit` appelle handlers locaux puis remonte dans la chaîne DOM et une chaîne logique `_parent` pour permettre le bubbling.

  ## Quick start (développement & usage)

  Prérequis : Node.js (pour les tests), navigateur moderne pour l'exemple HTML.

  1) Ouvrir localement (serveur statique) :

  ```bash
  # depuis la racine du projet
  python3 -m http.server 8000
  # puis ouvrir http://localhost:8000/index.html
  ```

  2) Inclure et utiliser (extrait minimal) :

  ```html
  <script type="module">
    import { createApp } from './melodijs.js'

    const app = createApp({
      components: {
        'my-counter': {
          template: `<div><button @click="dec">-</button> {{ count }} <button @click="inc">+</button></div>`,
          data(){ return { count: 0 } },
          methods: { inc(){ this.count++ }, dec(){ this.count-- } }
        }
      }
    })

    app.mount('#app')
  </script>
  ```

  3) Tests (local, Node.js) :

  ```bash
  npm install
  npm test
  ```

  Les tests utilisent `jsdom` (déjà listé en devDependencies) et valident des cas comme `v-if`, `v-show`, `v-model`, props et le store partagé.

  ## Exemples & patterns courants

  - Props : déclarer via un tableau ou un objet (avec `type` et `default`). Les valeurs d'attribut HTML sont coercées en Number/Boolean/String selon le type.
  - v-model : deux-way binding pour `<input>`, `<textarea>`, `<select>` (l'input met à jour `this.prop`).
  - v-for + :key : utiliser une clé unique stable (ex: `item.id`) pour meilleures performances et préservation d'état.

  ## Limitations connues

  - Pas de virtual DOM : certains rendus remplacent des parties de DOM par `innerHTML` / fragments. Pour de très grandes listes ou UIs complexes, un diffing plus fin serait préférable.
  - Sandbox limité des expressions : les moustaches évaluent du JavaScript via `new Function(...)`. Éviter d'utiliser du template provenant d'utilisateurs non fiables.
  - Gestion d'unsubscribe d'effets simplifiée : l'implémentation actuelle garde des placeholders pour cleanup mais n'est pas complète.

  ## Contribution

  - Issues / PRs bienvenues : corriger bugs, améliorer la gestion des effets, ajouter une API publique pour la mise à jour des slots, ajouter des tests.

  ## Licence

  Voir `LICENSE`.

  ---

  Si vous voulez, je peux aussi :
  - générer automatiquement une `API.md` listant les méthodes publiques et hooks,
  - ajouter des tests supplémentaires ou améliorer la CI (ex: GitHub Actions) pour exécuter `npm test` automatiquement.

  Résumé de ce commit : README consolidé et clarifié (FR) — décrit fonctionnalités, structure, logique et étapes pour démarrer.
```

Notes

- The library is intentionally tiny and unoptimized: re-renders replace component innerHTML. Good for small demos and prototyping.
- Template fetching uses `fetch()` and therefore requires serving files over HTTP.
