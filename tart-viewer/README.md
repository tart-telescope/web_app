# TART VIEWER

### Build the wasm modules first

The viewer imports two Rust/WebAssembly packages straight out of the working
tree, and neither is checked in. A fresh clone has to build them before the dev
server will render anything:

| Import                | Built into                  | From           |
| --------------------- | --------------------------- | -------------- |
| `gridless`            | `tart-viewer/pkg`           | `rust/`        |
| `tart-catalogue-wasm` | `tart-viewer/pkg-catalogue` | `rust-catalogue/` |

Both are `wasm-pack build --target web`, wrapped in a Make target that puts the
output where the viewer expects it. If you don't yet have the toolchain:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

Then, from the repository root:

```bash
(cd rust           && make export-wasm-production)   # -> tart-viewer/pkg
(cd rust-catalogue && make export-wasm-production)   # -> tart-viewer/pkg-catalogue
(cd tart-viewer    && pnpm install)                  # links both file: packages
```

Three things worth knowing about that sequence:

- **`pnpm install` comes last.** Both packages are `file:` dependencies, which
  pnpm resolves at install time, so the directories have to exist first.
- **The catalogue build is optional in effect, not in principle.**
  `src/services/satellite/localPropagation.js` imports it lazily and falls back
  to the remote catalogue API when it is missing — the app boots either way, it
  just never computes satellite positions locally. `gridless` has no such
  fallback.
- **Both are release builds**, and take a minute or two the first time. While
  actively changing Rust, a debug build is enough and much faster:

  ```bash
  (cd rust-catalogue && wasm-pack build --dev --target web --out-dir ../tart-viewer/pkg-catalogue)
  ```

Rebuilding the wasm does not restart the dev server; Vite picks the new output
up if you have it open.

### Starting the Development Server

To start the development server with hot-reload, run the following command. The server will be accessible at [http://localhost:3000](http://localhost:3000):

```bash
pnpm dev
```

(Repeat for npm, pnpm, and bun with respective commands.)

#### Reaching a telescope

Local Mode serves the app from a telescope's own API through the dev server,
which proxies `/api/v1`, `/vis` and `/raw` to `localhost:1234`. Forward that
from the telescope first:

```bash
ssh -L localhost:1234:localhost:8002 max@spark
```

Then toggle Local Mode in the hamburger menu. The app still loads without the
tunnel, but the Edge Cache is empty and there is nothing to view.

> Add NODE_OPTIONS='--no-warnings' to suppress the JSON import warnings that happen as part of the Vuetify import mapping. If you are on Node [v21.3.0](https://nodejs.org/en/blog/release/v21.3.0) or higher, you can change this to NODE_OPTIONS='--disable-warning=5401'. If you don't mind the warning, you can remove this from your package.json dev script.

### Building for Production

To build your project for production, use:

```bash
pnpm build
```

This is the official scaffolding tool for Vuetify, designed to give you a head start in building your new Vuetify application. It sets up a base template with all the necessary configurations and standard directory structure, enabling you to begin development without the hassle of setting up the project from scratch.

## 🚩 Feature Flags

Two runtime flags, both off by default. They exist so a change can be measured
against the old behaviour without a rebuild.

| Flag               | Default | Effect                                                                                                                                                                                     |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `color-worker`     | off     | Render the sphere's colour map in a Web Worker instead of on the main thread. That render costs ~69 ms per hovered cursor position, a dropped frame for the whole page; this moves it off. |
| `vis-typed-arrays` | off     | Store the visibility history as packed `Float32Array`s plus a shared baseline table, rather than an array of `{i,j,re,im}` objects. Roughly a quarter of the memory.                       |

Set the build default with the matching `VITE_` variable — `VITE_COLOR_WORKER=true`,
`VITE_VIS_TYPED_ARRAYS=true` — or override it for a single run:

```
?flags=color-worker                      on for this run
?flags=-color-worker                     off for this run
?flags=vis-typed-arrays,-color-worker    several at once
```

Overrides are deliberately not kept in `localStorage`: a remembered one would
silently poison the next "flag off" measurement.

Not part of this system, but related: `VITE_CATALOG_URL` (satellite catalogue
endpoint, defaults to the public one) and `VITE_DISABLE_LOCAL_SATELLITES`.

## 🧪 Tests

Playwright stories and profiling tools live in [`e2e/`](e2e/), against a
running dev server.

```bash
pnpm dev                # in another terminal
pnpm test:e2e           # all stories, ~1 min
pnpm test:e2e 03-hover --headed
```

See [`e2e/INSTRUCTIONS.md`](e2e/INSTRUCTIONS.md) for what each story measures,
the `E2E_*` variables, and why anything measured in frames needs `--headed`.

## ❗️ Important Links

- 📄 [Docs](https://vuetifyjs.com/)
- 🚨 [Issues](https://issues.vuetifyjs.com/)
- 🏬 [Store](https://store.vuetifyjs.com/)
- 🎮 [Playground](https://play.vuetifyjs.com/)
- 💬 [Discord](https://community.vuetifyjs.com)

## 💿 Install

Set up your project using your preferred package manager. Use the corresponding command to install the dependencies:

| Package Manager                      | Command        |
| ------------------------------------ | -------------- |
| [pnpm](https://pnpm.io/installation) | `pnpm install` |

After completing the installation, your environment is ready for Vuetify development.

## ✨ Features

- 🖼️ **Optimized Front-End Stack**: Leverage the latest Vue 3 and Vuetify 3 for a modern, reactive UI development experience. [Vue 3](https://v3.vuejs.org/) | [Vuetify 3](https://vuetifyjs.com/en/)
- 🗃️ **State Management**: Integrated with [Pinia](https://pinia.vuejs.org/), the intuitive, modular state management solution for Vue.
- 🚦 **Routing and Layouts**: Utilizes Vue Router for SPA navigation and vite-plugin-vue-layouts for organizing Vue file layouts. [Vue Router](https://router.vuejs.org/) | [vite-plugin-vue-layouts](https://github.com/JohnCampionJr/vite-plugin-vue-layouts)
- ⚡ **Next-Gen Tooling**: Powered by Vite, experience fast cold starts and instant HMR (Hot Module Replacement). [Vite](https://vitejs.dev/)
- 🧩 **Automated Component Importing**: Streamline your workflow with unplugin-vue-components, automatically importing components as you use them. [unplugin-vue-components](https://github.com/antfu/unplugin-vue-components)

These features are curated to provide a seamless development experience from setup to deployment, ensuring that your Vuetify application is both powerful and maintainable.

## 💡 Usage

This section covers how to start the development server and build your project for production.

(Repeat for npm, pnpm, and bun with respective commands.)

Once the build process is completed, your application will be ready for deployment in a production environment.

## 💪 Support Vuetify Development

This project is built with [Vuetify](https://vuetifyjs.com/en/), a UI Library with a comprehensive collection of Vue components. Vuetify is an MIT licensed Open Source project that has been made possible due to the generous contributions by our [sponsors and backers](https://vuetifyjs.com/introduction/sponsors-and-backers/). If you are interested in supporting this project, please consider:

- [Requesting Enterprise Support](https://support.vuetifyjs.com/)
- [Sponsoring John on Github](https://github.com/users/johnleider/sponsorship)
- [Sponsoring Kael on Github](https://github.com/users/kaelwd/sponsorship)
- [Supporting the team on Open Collective](https://opencollective.com/vuetify)
- [Becoming a sponsor on Patreon](https://www.patreon.com/vuetify)
- [Becoming a subscriber on Tidelift](https://tidelift.com/subscription/npm/vuetify)
- [Making a one-time donation with Paypal](https://paypal.me/vuetify)

## 📑 License

[MIT](http://opensource.org/licenses/MIT)

Copyright (c) 2016-present Vuetify, LLC
