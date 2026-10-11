# Vineyard Globe

An interactive 3D atlas of the world's wine regions, built with [three.js](https://threejs.org/).
Spin and zoom the globe, click a marker, and read about the region's typical grapes, wines and character.

- Vintage-atlas look: a parchment globe with ink coastlines, painted at runtime from public-domain Natural Earth data (no image assets)
- 100 major wine regions, each one a markdown file in [`content/regions/`](content/regions), plus 50 grape pages in [`content/grapes/`](content/grapes)
- Search by region, country or grape; filter markers by grape
- Works on touch devices (drag, pinch to zoom, bottom-sheet panel)
- Flash-card quiz: rounds of ten multiple-choice cards about regions and grapes, generated at random from the content files (no extra authoring). Filter by subject, country and difficulty; the globe flies to the answer once you have answered; progress is kept in your browser's localStorage
- Deep links: `#/region/bordeaux`, `#/grape/syrah` and `#/quiz` open directly

## Develop

Requires Node 20+.

```sh
npm install
npm run dev        # dev server with hot reload at http://localhost:5173 (also on your LAN)
npm test           # unit tests
npm run validate   # check every content/regions/*.md file
```

Edits to the markdown files show up immediately in the dev server.

## Add or edit a wine region

1. Copy `content/_template.md` to `content/regions/<slug>.md` (the slug is the file name and the deep-link id).
2. Fill in the frontmatter and the markdown body. See [`content/README.md`](content/README.md) for the fields.
3. Run `npm run validate`. Use the same spelling for the same grape in every file so search and the grape filter work.

The content was drafted with AI assistance and should be fact-checked before you rely on it for study.

## Run in production (self-hosting)

The app builds to a plain static folder; no server-side code is needed.

```sh
npm ci
npm run build      # outputs ./dist
```

Then either:

- **Quick local/production-like server:** `npm run preview` serves `dist/` on port 8080.
- **Any static web server:** copy `dist/` to the web root. The build uses relative paths, so it also works from a sub-path such as `https://example.com/wine/`.
  For example, with nginx:

  ```nginx
  server {
    listen 80;
    root /var/www/vineyardglobe;   # the contents of dist/
    index index.html;
    gzip on;
    gzip_types text/css application/javascript application/json;
    location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
    location = /index.html { add_header Cache-Control "no-cache"; }
  }
  ```

After editing content, run `npm run build` again and redeploy `dist/`.

## Credits

Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain) via the `world-atlas` package.
Fonts: Cormorant Garamond and EB Garamond (SIL Open Font License) via Fontsource.

## Licence

MIT. See [LICENSE](LICENSE).
