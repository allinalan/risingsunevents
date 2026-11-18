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

## The page blocks

A page is the site's own small markdown (build.js `renderBody`): headings, paragraphs, lists, `**bold**`, links, and these
lines, each on its own:

- `![what it shows](img/x.jpg)` one picture; `@gallery` then `- img/x.jpg` lines, a grid of pictures
- `@people` then `- Name - role | img/x.jpg` lines: people with captions
- `@team <title>` then `- Name | img/x.jpg` lines and `> <text>` lines, no blank lines inside: **the team banner** (since
  2026-11-18, Alan: "We need it to look exactly or closely similar to this banner"). A light gray box a little wider than
  the page, the title in orange (Forum), round photos 8 to a row with names under them (Kodchasan), the `>` lines in orange
  underneath (`**bold**` larger); 4 to a row on a phone. It replaced the one-picture banner `img/updated.png`, so changing
  one person is one line. Styles: `.team` in `assets/site.css`; its two fonts load only on a page that has it.
- `@embed <url>` a video; `@button [[id]]` or `@button [Label](url)` a button; `@dates` the Important Dates; `[[id]]` a team link

A look that none of these gives is a new block: build.js plus `assets/site.css`, with a test, in a PR. The webmaster
agent can use the blocks but never changes the design.
