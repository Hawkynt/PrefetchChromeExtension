# Prefetch Manager

[![License](https://img.shields.io/github/license/Hawkynt/PrefetchChromeExtension)](https://github.com/Hawkynt/PrefetchChromeExtension/blob/main/LICENSE)
[![Language](https://img.shields.io/github/languages/top/Hawkynt/PrefetchChromeExtension?color=8957D5)](https://github.com/Hawkynt/PrefetchChromeExtension)

[![CI](https://github.com/Hawkynt/PrefetchChromeExtension/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Hawkynt/PrefetchChromeExtension/actions/workflows/ci.yml)
![Last Commit](https://img.shields.io/github/last-commit/Hawkynt/PrefetchChromeExtension?branch=main)
![Activity](https://img.shields.io/github/commit-activity/m/Hawkynt/PrefetchChromeExtension)

[![Stars](https://img.shields.io/github/stars/Hawkynt/PrefetchChromeExtension?color=FFD700)](https://github.com/Hawkynt/PrefetchChromeExtension/stargazers)
[![Forks](https://img.shields.io/github/forks/Hawkynt/PrefetchChromeExtension?color=008080)](https://github.com/Hawkynt/PrefetchChromeExtension/network/members)
[![Issues](https://img.shields.io/github/issues/Hawkynt/PrefetchChromeExtension)](https://github.com/Hawkynt/PrefetchChromeExtension/issues)
![Code Size](https://img.shields.io/github/languages/code-size/Hawkynt/PrefetchChromeExtension?color=4CAF50)
![Repo Size](https://img.shields.io/github/repo-size/Hawkynt/PrefetchChromeExtension?color=FF9800)

[![Release](https://img.shields.io/github/v/release/Hawkynt/PrefetchChromeExtension)](https://github.com/Hawkynt/PrefetchChromeExtension/releases/latest)
[![Nightly](https://img.shields.io/github/v/release/Hawkynt/PrefetchChromeExtension?include_prereleases&sort=date&filter=nightly-*&label=nightly&color=FF9800)](https://github.com/Hawkynt/PrefetchChromeExtension/releases)
[![Downloads](https://img.shields.io/github/downloads/Hawkynt/PrefetchChromeExtension/total)](https://github.com/Hawkynt/PrefetchChromeExtension/releases)

> A browser extension that speeds up everyday browsing by intelligently prefetching the pages, scripts and assets you are likely to open next — reducing latency without wasting bandwidth on links you'll never click.

## ✨ Features

- **Smart Resource Management**: Dynamically prioritizes resources based on real-time user behavior — links get queued at low priority, boosted while visible or hovered, and drop back afterwards.
- **Prefetching Methods** (each individually switchable):
  - DNS Prefetching — resolves host names of external links ahead of time
  - Preconnect — warms up connections for links with query strings
  - Page Prefetch — fetches same-site pages you are likely to open next
  - Speculation Rules — uses the browser's native speculation API for page prefetches when supported, falling back to classic prefetch otherwise

  Links are only ever warmed as *navigations* — never as script/style preloads — so the extension cannot trigger page CSP violations or poison the cache with wrong-type entries.
- **Side-Effect Safety**: Links that look like server actions (logout, add-to-cart, subscribe, like, buy, delete, …) are never prefetched, and neither are `rel="nofollow"`, `download`, `data-no-prefetch`, or non-`http(s)` links — speculative loading can't accidentally trigger anything on your behalf. Forms are never touched at all.
- **Per-Site Disable & Blacklist**: Click the toolbar icon to disable prefetching for 5, 30 or 60 minutes — or permanently. Choose how broadly it applies: just the exact subdomain (`www.shop.example.com`) or any parent domain up to the registrable one (`example.com`, covering all its subdomains). Temporary entries re-enable themselves when they expire; the full blacklist is manageable on the options page and syncs across your browsers. Changes take effect immediately in open tabs.
- **Mouseover Boosting**: Hovered links (likely clicked next) jump to realtime priority and start prefetching immediately, even when all prefetch slots are busy.
- **Yields to Navigation**: The moment you click a link, all queued and running prefetches are cancelled so the next page gets the full connection. Modified clicks (new tab/window) and clicks handled by single-page-app routers keep prefetching alive.
- **Viewport Awareness**: Links entering the viewport are boosted, links scrolling out of view drop back to their previous priority.
- **Connection Awareness**: Prefetching pauses automatically on slow connections (2G) and while the browser's data-saver mode is active (both optional).
- **Status Overlay**: A compact on-page header shows running totals and a progress bar of how many found links are already processed; expanding it (click the header) reveals the detailed queue with per-link method, priority and state, where clicking an entry aborts that prefetch. The expand/collapse choice is remembered. The hidden overlay never blocks clicks, and it can be turned off entirely.
- **Concurrency Control**: A configurable number of prefetches run in parallel; hung hints time out so they never clog the queue.
- **Customizable Settings**: Every behavior above is configurable; settings sync across browsers via `chrome.storage.sync`.

## 📦 Installation

1. **Download or Clone the Repository**:

   ```bash
   git clone https://github.com/Hawkynt/PrefetchChromeExtension.git
   ```

2. **Load the Extension**:
   - Open your browser's extension settings.
   - Enable "Developer Mode."
   - Click "Load Unpacked" and select the extension folder.

3. **Verify Installation**:
   Ensure the extension's icon appears in the browser toolbar.

## 🧭 Usage

### Toolbar popup — disable per site

Click the extension icon on any page to open the per-site controls:

- **Scope**: pick what to disable — the exact subdomain you are on, or a parent domain (which covers all of its subdomains). Public suffixes like `co.uk` are never offered.
- **5 min / 30 min / 60 min**: temporarily disable prefetching for the chosen scope; it resumes automatically afterwards.
- **Forever**: disable the chosen scope permanently.
- **Re-enable prefetching**: remove the covering entry from the blacklist again.

Disabling takes effect immediately — running prefetches are cancelled in all open tabs of that site.

### Options page

Right-click the toolbar icon → *Options* (or open it from the extensions page) to configure:

| Setting | Default | Effect |
|---|---|---|
| Wait For Page Load | on | Start prefetching only after the page finished loading |
| Avoid Slow Connections | on | Pause on 2G/slow-2G connections |
| Avoid Data Saver Mode | on | Pause while the browser's data saver is active |
| Max Concurrent Prefetchers | 2 | Parallel prefetch limit (hovered links may exceed it) |
| Scan Interval (ms) | 3000 | How often new links are discovered; 0 disables rescanning |
| Allow Prefetching Query Links | off | Also consider links with `?query` strings |
| Enable DNS Prefetch / Prefetch / Preconnect / Speculation Rules | on/on/on/off | Toggle each prefetching method |
| Boost Priority of In-Viewport Links | on | Prioritize links currently visible |
| Boost Priority of Mouse-Over Links | on | Instantly prefetch hovered links |
| Yield to Navigation | on | Cancel everything when a link is clicked |
| Show Status Overlay | on | Show the on-page status table |
| Fadeout Delay / Menu Delay (ms) | 5000 / 5000 | How long finished entries and the overlay stay visible |
| Disabled Sites | – | Review and re-enable blacklisted domains |

## ⚙️ How It Works

1. **Resource Prioritization**: Resources are prioritized based on user interaction, such as viewport visibility or hover events, using a realtime/high/normal/low priority queue.
2. **Queue Management**: The extension manages a priority queue for resources, dynamically updating as user behavior changes; duplicate hosts collapse into a single DNS/preconnect entry.
3. **Prefetch Execution**: Resources are fetched using appropriate methods, depending on browser capabilities and resource type — via `<link rel="…">` hints or native speculation rules, never by executing anything.
4. **Safety Checks**: Before anything is queued, the link must pass the scheme check, the side-effect keyword filter, the anchor opt-outs and the per-site blacklist.

## ❤️ Support

If this project saves you time or money, consider supporting its development:

[![GitHub Sponsors](https://img.shields.io/badge/GitHub-Sponsor-EA4AAA?logo=githubsponsors)](https://github.com/sponsors/Hawkynt)
[![PayPal](https://img.shields.io/badge/PayPal-Donate-00457C?logo=paypal)](https://www.paypal.me/hawkynt)

## 📜 License

Licensed under LGPL-3.0-or-later — see [LICENSE](LICENSE).
