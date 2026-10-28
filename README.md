# Painting Catalog

A small catalog for paintings in storage. It runs entirely in the browser: entries and photos live in IndexedDB on the device. There is no account, no server, and no analytics.

Use it on an iPhone in Safari, or on a desktop browser. Add it to the Home Screen and it opens offline.

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:47321/painting-catalog/. The app is built for the `/painting-catalog/` path used by GitHub Pages. To reach it from a phone on the same network, stop that command and run `npx vite --host --port 47321`, then open `http://<your-computer>:47321/painting-catalog/`.

## Production build

```bash
npm run build
npm run preview
```

`npm run build` typechecks and writes the static site to `dist/`. `npm run preview` serves it at http://127.0.0.1:47322/painting-catalog/. That folder is what GitHub Pages publishes. It contains the app only. Paintings and photos are never part of the build; they stay in the browser.

## Deploy on GitHub Pages

The live site is meant to be:

https://kennethsprom-glitch.github.io/painting-catalog/

`base` in `vite.config.ts` is `/painting-catalog/`, so the manifest, icons, and service worker are all under that path. Routes use the URL hash (`/#/new`), so GitHub Pages does not need a rewrite rule.

`.github/workflows/pages.yml` builds `dist/` and deploys it when `main` is pushed. In the repo, set Settings → Pages → Build and deployment → Source to **GitHub Actions**.

The repository should hold this source tree only. Do not commit IndexedDB exports, backups, or photographs. The pictures in the repo are generated placeholders (app icons and the sample paintings drawn in the browser).

### iPhone

1. Open the deployed site in Safari.
2. Share → Add to Home Screen.
3. Open the icon once while online so the app shell can cache.
4. Export a `.zip` backup and keep it in Files or on a computer.

A Home Screen icon has its own storage, separate from the Safari tab. Export a backup before you switch between them. Safari can also delete site data when the device is low on space; the backup is the copy that survives that.

## What stays on the device

- Paintings, item numbers, and notes are IndexedDB records.
- Photos are downscaled in the browser to a JPEG whose long side is at most 2000 pixels, plus a smaller thumbnail for the grid.
- The app asks for `navigator.storage.persist()` so the browser is less likely to evict that data.
- The service worker caches the app shell. It does not call out to any other origin.
- PDF export and zip/json backup are built in the browser. On an iPhone, use Share to hand the file to Files or another app, or Save file to download it.

## Catalog fields

Item number (automatic, editable, unique), title, artist, width / height / depth in inches (depth optional, decimals allowed), medium, storage location, notes, date added, and a photo from the camera or the photo library.

The grid shows the item number, title, and size. Search matches every text field. Sort by item number, title, artist, or location. Open a painting to view, edit, or delete it. Delete asks you to confirm.

PDF export has a title page (catalog name and date), page numbers, and two layouts: one painting per page, or six per page.

## Tests

```bash
npm run test:e2e
```

This builds the site and runs the flows in headless Chromium at a 390×844 phone viewport: add, edit, search, both PDF layouts, and backup/restore.

## Fonts

Catalog PDFs embed subsets of [Noto Serif](https://fonts.google.com/noto/specimen/Noto+Serif) (copyright Google, SIL Open Font License 1.1). The license is in `src/fonts/OFL.txt`. The on-screen UI uses the system font so nothing is fetched at runtime.
