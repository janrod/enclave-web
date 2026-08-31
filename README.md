# enclave.jp

Static landing page for **ENCLAVE**, in English and Japanese. No build step, hosted free on GitHub Pages.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | English page (`/`) — markup only. |
| `ja/index.html` | Japanese page (`/ja/`) — same structure, translated copy. |
| `assets/site.css` | All styling for both pages, including the `html[lang="ja"]` overrides. |
| `assets/flap.js` | The scramble animation on the cycling word. |
| `assets/` | Logo wordmarks (white-on-dark is used on the live page). |
| `favicon.svg` | Angular "E" mark. |
| `CNAME` | Tells GitHub Pages to serve on the custom domain `enclave.jp`. |
| `.nojekyll` | Skips Jekyll processing so files/folders are served verbatim. |

The CSS and JS are shared files rather than inlined per page, so a style or
animation change lands on both languages at once. Only the copy, the `<head>`
metadata and the active side of the `EN / 日本語` switcher differ between them.

## Languages

`/` is English, `/ja/` is Japanese. Both pages carry `hreflang` alternates
(with English as `x-default`) and link to each other through the small
switcher sitting on the top right of the content column.

Japanese copy needs a CJK face — the Latin fonts have no kanji or kana — so
`ja/index.html` additionally loads Noto Serif JP and Noto Sans JP, and
`site.css` gives it looser leading, non-negative tracking, and full-width
(`1em`) cells for the scramble word instead of the half-width `1ch` the mono
face gives Latin. Adding another language means copying `ja/index.html`,
translating it, and adding the `hreflang` line to every page.

Type: [Fraunces](https://fonts.google.com/specimen/Fraunces) (editorial display serif) for the copy, [Spline Sans Mono](https://fonts.google.com/specimen/Spline+Sans+Mono) for the contact line, and [Noto Serif JP / Noto Sans JP](https://fonts.google.com/noto) for Japanese. All free via Google Fonts.

## Deploy to GitHub Pages

1. Create the repo and push `main` (see below).
2. In the repo: **Settings → Pages → Build and deployment**.
   - **Source:** *Deploy from a branch*
   - **Branch:** `main` / `/ (root)` → **Save**
3. Under the same page, set **Custom domain** to `enclave.jp` (the `CNAME` file already declares it) and tick **Enforce HTTPS** once the cert provisions (can take a few minutes to an hour).

### DNS for `enclave.jp`

At your DNS provider, point the apex domain at GitHub Pages:

```
# Apex (enclave.jp) — four A records:
A   @   185.199.108.153
A   @   185.199.109.153
A   @   185.199.110.153
A   @   185.199.111.153

# (optional) AAAA records for IPv6:
AAAA @   2606:50c0:8000::153
AAAA @   2606:50c0:8001::153
AAAA @   2606:50c0:8002::153
AAAA @   2606:50c0:8003::153

# www subdomain (optional) — CNAME to the Pages host:
CNAME www <your-github-username>.github.io.
```

Until DNS resolves, the site is also reachable at `https://<username>.github.io/<repo>/`.

## Local preview

```sh
python3 -m http.server 8000   # then open http://localhost:8000 (and /ja/)
```
