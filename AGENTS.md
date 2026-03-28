# MelodiJS - AI Agent Guide

Welcome, AI Agent! This document provides essential context, architectural details, and guidelines for understanding and contributing to the **MelodiJS** project. Please read this entirely before modifying the core repository.

## 🎯 Project Overview
MelodiJS is a progressive, ultra-lightweight JavaScript framework for building user interfaces.
- **Key Philosophy**: Combine the intuitive Options API of Vue.js with a fine-grained reactivity system inspired by SolidJS.
- **Performance Goal**: Deliver surgical DOM updates without a virtual DOM, maintaining a tiny core footprint (~3KB gzipped).
- **Stack**: TypeScript (`src/*.ts`), compiled to ES Modules (`dist/*.js`).
- **Environment**: Node.js, `tsc` for building, `jsdom` for testing.

## 📁 Project Structure
- `src/`: Core TypeScript source files. This is where all active development happens.
  - `melodijs.ts`: Core framework logic (Reactivity, Component rendering, Directives, DOM parser).
  - `router.ts`: Built-in SPA router implementation (`MelodiRouter`).
  - `store.ts`: Built-in centralized state management (`MelodiStore`).
- `dist/`: Compiled JavaScript output. **Do not edit these files directly**. They are generated via `npm run build`.
- `tests/`: Custom test suite using Node.js and `jsdom`. Initiated via `tests/run-tests.js`.
- `examples/`: Example applications using the framework (e.g., Shop, MelodiBook) to demonstrate capabilities.
- `docs/`: Static HTML documentation.

## 📐 Architecture & Core Concepts
1. **Reactivity System**:
   - Relies on **Signals** (getters/setters) created for properties defined in a component's `data`.
   - **Effects** track dependencies dynamically and surgically update specific DOM nodes or attributes when signals change.
   - **No Virtual DOM**: MelodiJS interacts directly with real DOM elements, setting attributes or text content dynamically.
   - **Deep Reactivity**: Nested objects and arrays are aggressively tracked to trigger fine-grained updates.
2. **Components**:
   - API is heavily inspired by the Vue Options API (`data`, `computed`, `methods`, `template`, `props`, lifecycle hooks).
3. **Template Compilation**:
   - A lightweight built-in DOM traversal system parses templates.
   - Supports: Interpolation `{{ }}`, Directives (`v-if`, `v-show`, `v-for`, `v-model`), Bindings (`v-bind:`/`:`, `v-on:`/`@`).
4. **Batteries Included**:
   - Unlike React or minimal renderers, MelodiJS provides an official Router and Store to support complete SPA development out of the box.

## 🛠️ Development Guidelines
When assisting with coding tasks in MelodiJS, stick to the following crucial rules:

1. **Keep it Tiny**: Bundle size is a primary selling point. Avoid large abstractions or external dependencies. Write minimal, efficient, and native-feeling code.
2. **Embrace Direct DOM**: Never introduce VDOM logic (no diffing trees). Operations must always resolve to reactive effects updating specific elements.
3. **TypeScript First**:
   - Write strongly typed code in the `src/` directory.
   - After modifying `.ts` files, remember to compile them via `npm run build` (which runs `tsc`).
4. **Testing Protocol**:
   - Unit tests are located in `tests/`.
   - Tests rely on `jsdom` to simulate a browser environment.
   - To verify changes, run `npm test` (or `node tests/run-tests.js`). Always ensure tests pass before declaring a task complete.
5. **Vue Parity**: If you need to make API design decisions, use Vue 3's Options API for inspiration regarding naming conventions, parameter orders, and expected behaviors.

## 🚀 Common Workflows
- **Building**: `npm run build`
- **Testing**: `npm test`
- **Editing Core**: Modify `src/melodijs.ts`, build, and test.

Always prioritize stability and minimal memory overhead. Happy coding!
