# enclave.jp

Static landing page for **ENCLAVE**. One HTML file, no build step, hosted free on GitHub Pages.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | The entire site — markup + inline CSS, no dependencies to build. |
| `assets/` | Logo wordmarks (white-on-dark is used on the live page). |
| `favicon.svg` | Angular "E" mark. |
| `CNAME` | Tells GitHub Pages to serve on the custom domain `enclave.jp`. |
| `.nojekyll` | Skips Jekyll processing so files/folders are served verbatim. |

Type: [Fraunces](https://fonts.google.com/specimen/Fraunces) (editorial display serif) for the copy, [Spline Sans Mono](https://fonts.google.com/specimen/Spline+Sans+Mono) for the contact line. Both free via Google Fonts.

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
python3 -m http.server 8000   # then open http://localhost:8000
```
