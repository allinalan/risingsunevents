# risingsunevents.net

The Rising Sun Division Events Team site. Plain files, built by `node build.js` into `docs/`, served by GitHub Pages
at **https://www.risingsunevents.net** (live since 2026-11-17).

| To change | Edit | Then |
|---|---|---|
| Words on a page | `content/<page>.md` | `node build.js`, commit `content/` + `docs/`, push |
| A team link (stat form, policy…) | `data/links.json` (pages use `[[id]]`) | same |
| Important Dates | `data/dates.json` | same |
| Menu order, footer, domain | `data/site.json` | same |
| Pictures, PDFs | `assets/img/`, `assets/files/` | same |

`node build.js --check` must say `check ok` before anything is pushed; `node tests/test-build.js` runs the tests.
The webmaster agent (rsd-shift-picking `webmaster.js`, Slack #rsd-website) makes these edits on Alan's approve.
`docs/` is generated: never edit it by hand.
