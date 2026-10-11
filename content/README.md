# Wine region content

One markdown file per wine region in `regions/`. The file name (without `.md`) is the region's id.
Start from `_template.md`. Files beginning with `_` are ignored.

Frontmatter fields:

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Display name |
| `country` | yes | |
| `countryCode` | no | 2-letter ISO code, shows a flag |
| `lat`, `lon` | yes | Decimal degrees (-90..90, -180..180) |
| `subregions` | no | List of notable sub-regions / appellations |
| `grapes.red`, `grapes.white` | at least one grape | Grape names; used by search and the grape filter, so keep spelling consistent across files |
| `styles` | yes | At least one |
| `climate` | no | Short label |

The markdown body is shown in the info panel. Run `npm run validate` after editing.
Changes show up immediately in `npm run dev`; for production, rebuild with `npm run build`.
