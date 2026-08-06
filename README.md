# create-svelte

Everything you need to build a Svelte project, powered by [`create-svelte`](https://github.com/sveltejs/kit/tree/main/packages/create-svelte).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npm create svelte@latest

# create a new project in my-app
npm create svelte@latest my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

## Deploying

The app is a fully static SvelteKit build (`@sveltejs/adapter-static`) hosted on GitHub Pages at
https://jonathanhudak.github.io/stop-motion-app/.

Every push to `main` runs `.github/workflows/deploy.yml`, which builds with
`BASE_PATH=/stop-motion-app` and uploads `build/` to Pages. Because the site lives under a
subpath, use `base` from `$app/paths` for every internal link:

```svelte
<a href="{base}/animations/">My Animations</a>
```

To reproduce the deployed build locally:

```bash
BASE_PATH=/stop-motion-app npm run build
```

Routes with runtime-only params (`/animations/[animationId]`) are not prerendered; GitHub Pages
serves `404.html`, which boots the client router and resolves them.
