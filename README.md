# Upcoming Launches

A log of upcoming orbital launches: a countdown for the next one, then about 30 scheduled flights with mission, rocket, provider, pad, orbit, status, and webcast links. The interface is in English. Times are shown in the visitor's local timezone.

This is a static site (HTML, CSS, and plain JavaScript) with no backend, no database, and no build step. It is meant to be published on GitHub Pages.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Page |
| `styles.css` | Styles |
| `app.js` | Load data, filter, countdown, and render |
| `data/launches.json` | Bundled launch data (updated by GitHub Actions) |
| `scripts/fetch_launches.py` | Fetch and slim the API data |
| `.github/workflows/update-launches.yml` | Refresh the data every two hours |
| `.nojekyll` | Tell GitHub Pages not to run Jekyll |

## Enable GitHub Pages

1. Push these files to the `main` branch of `py314159265.github.io`.
2. Open the repository **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.
4. The site should be live within a few minutes at `https://py314159265.github.io`. For a custom domain such as seagle.xyz, enter it under **Custom domain** on the same page and set DNS.

## How the data is updated

- `.github/workflows/update-launches.yml` runs `scripts/fetch_launches.py` every two hours, and can also be started by hand from the **Actions** tab (Run workflow).
- The script asks Launch Library 2 for upcoming launches, drops ones that already succeeded, failed, or are in the past, keeps only the fields the page needs, and writes `data/launches.json`.
- It commits and pushes as `github-actions[bot]` only when the data actually changed.
- If Actions does not have write access, set **Settings → Actions → General → Workflow permissions** to **Read and write permissions**.
- When a visitor opens the page, the bundled data is shown first. If it is more than 30 minutes old, the page tries the API directly (8-second timeout, result cached in the browser). If that fails, the bundled data stays on screen.

The Launch Library 2 free tier allows about 15 requests per hour per IP. A two-hour schedule stays well under that.

## Run locally

Python 3 is enough (standard library only):

```sh
python3 scripts/fetch_launches.py
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` as a `file://` URL will block the JSON request, so use a local server.

## Data source

Launch data comes from [The Space Devs Launch Library 2](https://thespacedevs.com/llapi). Mission, rocket, pad, and agency names are left in their official wording, as are mission descriptions. Launch times often change; treat the official announcement from the launch provider as authoritative.
