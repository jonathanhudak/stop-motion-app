# stop-motion-app

A browser stop-motion animator: shoot frames from any camera, scrub the timeline, play back at a
real frame rate, and export a video or GIF. Everything stays on the device — frames live in
IndexedDB and nothing is uploaded.

Live at https://jonathanhudak.github.io/stop-motion-app/

## Shooting

- **Camera** — any `videoinput` device: built-in cameras, USB webcams, HDMI capture cards. The
  choice is remembered, and hot-plugs are picked up. A DSLR only appears if it exposes a UVC
  webcam mode or vendor software publishes a virtual camera; otherwise use a capture card.
- **Onion skin** — the previous frame ghosted over the live view at adjustable opacity, so you can
  line up the next move. It is drawn on screen only, never into a captured frame.
- **Keyboard** — <kbd>Space</kbd> capture, <kbd>←</kbd>/<kbd>→</kbd> step frames,
  <kbd>Delete</kbd> remove the selected frame, <kbd>P</kbd> play/stop, <kbd>O</kbd> toggle onion
  skin. Deleting a frame offers an Undo in the toast.
- **Frame rate** — 1–30 fps with 8/12/15/24 presets, stored per project. Changing it during
  playback restarts at the new rate.
- **Export** — WebM (MediaRecorder) or animated GIF (gifenc, capped at 800px wide). Where the OS
  supports sharing files (Android Chrome, iOS Safari) a Share button hands it to the share sheet;
  elsewhere it downloads.

## Developing

```bash
npm install
npm run dev
```

`npm run check` runs `svelte-check`; `npm run lint` runs Prettier and ESLint.

Note that `npm run check` regenerates `.svelte-kit`, which breaks an already-running `npm run dev`
with `__SVELTEKIT_APP_VERSION__ is not defined`. Restart the dev server afterwards.

## Architecture

The editor is a thin orchestrator over focused modules, all under `src/lib`:

| Module          | Responsibility                                                  |
| --------------- | --------------------------------------------------------------- |
| `db.ts`         | IndexedDB projects: schema, migrations, CRUD                    |
| `camera.ts`     | Device enumeration, stream lifecycle, remembered device         |
| `playback.ts`   | Cancellable frame player scheduled against a deadline           |
| `export.ts`     | WebM and GIF encoding, download, Web Share                      |
| `objectUrls.ts` | Cached object URLs for frame Blobs, revoked when frames go away |
| `toast.ts`      | Inline notifications (no `alert()` anywhere)                    |

`src/app.css` holds the design tokens. Light and dark both come from one variable block, switched
by a `.dark` class on `<html>`.

### Storage

Projects live in the `AnimationDB` database, store `projects`, keyed on a generated `id`:

```ts
{ id, name, frames: Blob[], fps, createdAt, updatedAt }
```

Schema v1 keyed records on `name` and stored frames as PNG data URLs. v2 migrates those in the
`versionchange` transaction: data URLs decode to Blobs, and `name` becomes a non-unique index so
renaming is a single `put`. Links that used a name in the URL still resolve through
`getProjectByName`.

## Deploying

Static build (`@sveltejs/adapter-static`) on GitHub Pages. Every push to `main` runs
`.github/workflows/deploy.yml`, which builds with `BASE_PATH=/stop-motion-app` and uploads
`build/`. Because the site lives under a subpath, internal links must go through `base`:

```svelte
<a href="{base}/animations/">My animations</a>
```

To reproduce the deployed build locally:

```bash
BASE_PATH=/stop-motion-app npm run build
```

Routes with runtime-only params (`/animations/[animationId]`) are not prerendered; GitHub Pages
serves `404.html`, which boots the client router and resolves them.
