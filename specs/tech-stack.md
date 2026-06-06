# Tech Stack

## Overview

This document defines the technology stack, tooling, and design standards for this project. All decisions here are authoritative. Changes must be reflected here before implementation.

---

## Version Control

| Concern | Decision |
| :---- | :---- |
| Platform | GitHub |
| Default branch | `main` |
| Branch strategy | Feature branches → PR → squash merge to `main` |
| Branch naming | `feat/`, `fix/`, `chore/`, `docs/` prefixes |
| Commit convention | [Conventional Commits](https://www.conventionalcommits.org/) |

---

## Frontend

| Concern | Decision |
| :---- | :---- |
| Type | Static site — no build step, no framework |
| Entry point | `index.html` |
| Languages | HTML5, CSS3, Vanilla JavaScript (ES Modules) |
| Module system | Native ES Modules (`type="module"`) |
| Package manager | None (zero dependencies by default) |
| Styling | Plain CSS; CSS Custom Properties for theming |
| Bundler | None |
| Transpiler | None |

### Project Structure

/

├── index.html          \# Entry point

├── css/

│   └── main.css        \# Global styles

├── js/

│   └── main.js         \# Application logic (ES Module)

└── assets/             \# Static assets (images, fonts, icons)

---

## Local Development

| Concern | Decision |
| :---- | :---- |
| Local dev server | Any static file server (e.g., VS Code Live Server, `python -m http.server`) |
| Port | Unspecified — use server default |

No build tooling or CLI dependency required. Open `index.html` directly or serve from a local static server.

---

## Design Standards

### Language

| Concern | Decision |
| :---- | :---- |
| Primary language | Thai |
| Secondary language | English |
| Bilingual content | Thai first; English used for labels, technical terms, or supplementary text where natural |

### Typography

| Concern | Decision |
| :---- | :---- |
| Font family | [Sarabun](https://fonts.google.com/specimen/Sarabun) — all weights |
| Font source | Google Fonts CDN |
| Fallback stack | `'Sarabun', sans-serif` |

**Google Fonts import (baseline):**

\<link rel="preconnect" href="https://fonts.googleapis.com"\>

\<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin\>

\<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700\&display=swap" rel="stylesheet"\>

body {

  font-family: 'Sarabun', sans-serif;

}

### Visual Style

| Concern | Decision |
| :---- | :---- |
| Target audience | Non-technical, general mainstream users |
| Reference aesthetic | Facebook, Google, Shopee, Lazada — familiar consumer web |
| Theme | Light, clean, high-contrast on white or near-white backgrounds |
| Color palette | Neutral whites and light greys for backgrounds; one primary accent color (blue preferred, e.g. `#1877F2` Facebook-style or `#4285F4` Google-style); black or dark grey for body text |
| Prohibited styles | Dark/black backgrounds, neon colors, cyberpunk, glassmorphism, terminal aesthetics |
| Spacing | Generous whitespace; avoid dense layouts |
| Border radius | Soft — `8px`–`16px` on cards and buttons; avoid sharp corners |
| Shadows | Subtle — `box-shadow: 0 1px 4px rgba(0,0,0,0.1)` or lighter; no dramatic drop shadows |
| Icons | Use outline-style icon sets (e.g., [Material Symbols](https://fonts.google.com/icons) or [Heroicons](https://heroicons.com/)) — no filled heavy icons |
| Imagery | Clean product/lifestyle photography; avoid abstract tech imagery |
| Motion | Minimal — transitions ≤ 200ms for hover/focus states only; no decorative animations |

### Baseline CSS Custom Properties

:root {

  /\* Colors \*/

  \--color-bg:         \#ffffff;

  \--color-surface:    \#f5f6f7;

  \--color-border:     \#e0e0e0;

  \--color-primary:    \#1a73e8;

  \--color-primary-hover: \#1558b0;

  \--color-text:       \#1c1c1e;

  \--color-text-muted: \#6e6e73;

  /\* Typography \*/

  \--font-family:      'Sarabun', sans-serif;

  \--font-size-base:   16px;

  \--line-height-base: 1.6;

  /\* Spacing \*/

  \--space-xs:  4px;

  \--space-sm:  8px;

  \--space-md:  16px;

  \--space-lg:  24px;

  \--space-xl:  40px;

  /\* Radius \*/

  \--radius-sm: 8px;

  \--radius-md: 12px;

  \--radius-lg: 16px;

  /\* Shadow \*/

  \--shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.08);

  \--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.12);

}

---

## References

- [Sarabun — Google Fonts](https://fonts.google.com/specimen/Sarabun)  
- [Material Symbols](https://fonts.google.com/icons)  
- [Heroicons](https://heroicons.com/)  
- [Conventional Commits](https://www.conventionalcommits.org/)

