# Gorski Law: concept preview

A rebuilt website for **Gorski Law** (Mark S. Gorski: criminal defense, DUII and traffic defense, Portland,
Oregon), made as a shareable pitch. It is a 37-page static site: three practice areas with 13 sub-pages, 12
sourced blog posts, a keyword map and full structured data. It is **not** the official Gorski Law website. Every
page carries `noindex, nofollow`, a "Concept preview" ribbon, and a contact form that can't send anything.

- **Preview URL:** https://nitcob.github.io/gorski-law-preview/
- **Built from:** the Dream Sites law-firm template (2026-11-12 batch), copied and adapted. The original template
  folder was not modified.
- **Status:** every practice page and post is a draft pending Mark's review.
- **Local-only docs:** AUDIT.md, CONFIRM.md, LAUNCH.md, CONTENT_GUIDE.md, content-calendar.md, keyword-map.csv and
  `research/` are kept out of this public repo (see `.gitignore`). They live in the working copy only.

## Build and preview locally

Needs Node 20+.

```bash
npm ci                 # two dev dependencies: marked, gray-matter
node build.js          # → dist/  (preview mode, the default)
node tools/check.js    # QA: H1s, titles, noindex, schema, links, keywords, disclaimers, leftovers
node serve.js          # → http://localhost:4173/gorski-law-preview/
```

`build.js` stamps the shared header and footer into every page, renders the Markdown pages and posts, writes the
JSON-LD, and generates `sitemap.xml`, `robots.txt`, `rss.xml` and `llms.txt`. It also refreshes the placeholder
list in CONFIRM.md.

## Config: preview vs. production

Everything lives in `site.config.js`, and each value can be overridden with an environment variable:

| Setting       | Default                                         | What it does                                                         |
| ------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| `SITE_URL`    | `https://nitcob.github.io/gorski-law-preview`   | Canonicals, Open Graph, sitemap, RSS, llms.txt                       |
| `BASE_PATH`   | path part of `SITE_URL` (`/gorski-law-preview`) | Prefix for every internal link and asset                             |
| `PREVIEW`     | `true`                                          | `noindex, nofollow` on every page, the ribbon, and the disabled form |
| `FORM_ACTION` | empty                                           | Form endpoint, used only when `PREVIEW=false`                        |

To toggle preview mode: `PREVIEW=false node build.js`. For the real launch, follow LAUNCH.md.

Preview safety does not rely on robots.txt: on a GitHub Pages project site, crawlers never read
`/gorski-law-preview/robots.txt`. The meta tag is on every page instead, and robots.txt deliberately has no
`Disallow`, which would stop crawlers from seeing that tag.

## Where things are

| Path                   | What                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `src/pages/`           | One file per URL (`.md` or `.html` with front matter); the folder path is the URL               |
| `src/posts/`           | Blog posts in Markdown, served at `/blog/<slug>/`                                               |
| `src/assets/`          | `template.css` (the law template's stylesheet, trimmed to the sections used; rules unedited) + `gorski.css` (the Gorski Law layer), joined into `styles.css` at build; `app.js`, fonts, the firm's photos, the Open Graph image |
| `tools/ors.py`         | Prints any Oregon statute from the official 2025 ORS (`python3 tools/ors.py 813.410`)           |
| `tools/topo.js`        | Generates the animated contour-map background                                                   |
| `tools/check.js`       | QA checks used locally and in CI                                                                |
| `tools/keyword-map.js` | Regenerates keyword-map.csv from the front matter                                               |
| `research/`            | Every legal claim with its source, firm-fact sources, the 2026 session-law check                |
| `CONTENT_GUIDE.md`     | Rules for anyone writing pages or posts (sourcing, Oregon RPC 7.1, formats, keywords)           |
| `CONFIRM.md`           | Questions for Mark, plus every `{{CONFIRM}}` placeholder on the site                            |
| `AUDIT.md`             | Current site vs. this build, with Lighthouse before/after                                       |
| `keyword-map.csv`      | Every keyword: cluster, intent, priority, target URL, status                                    |
| `content-calendar.md`  | The 12 drafted posts and 12 briefs, with a publishing order                                     |
| `LAUNCH.md`            | Going live on gorski-law.com: config, hosting, 301 map, Search Console, Google Business Profile |

## Adding a page or post

Follow CONTENT_GUIDE.md. In short: one primary keyword per URL, used in the title, H1, first 100 words and
description; check every legal claim with `tools/ors.py` or an official page and link it inline; anything
unverified becomes `{{CONFIRM: …}}`. Then run `node build.js && node tools/check.js && node tools/keyword-map.js`.

## Deploy

`.github/workflows/pages.yml` builds in preview mode, runs the checks, and publishes `dist/` to GitHub Pages on
every push to `main`.
