# Pamet — Web

A faithful web port of the **Pamet** iOS symptom-journal app. Same warm terracotta / sage / rose design language, same five screens — rebuilt as a responsive, framework-free website that runs entirely in the browser.

## Run it

It's a static site — no build step, no dependencies.

**Option 1 — just open it:**
Double-click `index.html`. Everything works from `file://` (data persists in your browser's localStorage).

**Option 2 — local server (recommended):**
```bash
cd pamet-web
python3 -m http.server 8099
# then visit http://localhost:8099
```

## What's included

| Screen | Features |
|--------|----------|
| **Home** | Time-aware greeting, day-streak card, live AI insight banner, 4 metric cards (computed from your data), recent entries |
| **Log** | Bottom-sheet form: 16+ symptom chips, severity slider, sleep/stress/water/energy sliders, mood, activity, medications, notes |
| **Calendar** | Monthly grid with color-coded days (mild / significant / healthy), month navigation, per-day detail |
| **Patterns** | AI pattern cards with confidence bars — **detected live from your actual entries** via correlation analysis |
| **Report** | Doctor-ready report with overview, symptom breakdown, AI patterns, medications, notes + **Email** and **Download PDF** |
| **Settings** | Dark mode, notifications, AI/privacy toggles, custom symptoms, plan, CSV/JSON export, reset |

## How it differs from the iOS app (in a good way)

- **Real pattern detection.** The iOS app shipped with hardcoded sample patterns. This version runs a lightweight correlation engine on your stored entries, so the "AI Patterns" screen reflects *your* data and updates as you log.
- **Real exports.** PDF (via print-to-PDF), CSV, and JSON export actually download.
- **Live metrics.** Streak, averages, top symptom, and the doctor report are all computed from your entries.
- **Persistence.** Entries and settings save to `localStorage` — your data survives refreshes, on your device.
- **Dark mode** works and persists.

## Structure

```
pamet-web/
├── index.html        ← all screens, tab bar, log sheet
├── css/styles.css    ← full palette + responsive/dark theming
└── js/
    ├── store.js      ← data model, persistence, pattern engine, metrics, report
    └── app.js        ← rendering + interactivity for every screen
```

## Design tokens

All colors are CSS custom properties in `styles.css`, mirroring `Colors.swift`:
`--warm-terracotta #C4673A`, `--sage-green #5C7A62`, `--rose-pink #C45C6A`, `--warm-amber #D4882A`, plus the ink/neutral and surface tones. Dark mode redefines the surface/ink tokens.

## Notes & next steps

- Data is local to the browser (no account, no server). For multi-device sync, point `store.js` persistence at a backend (Supabase/Firebase).
- The pattern engine is intentionally simple and transparent. Swap `detectPatterns()` in `js/store.js` for a real ML call when you're ready.
- Add a PWA manifest + service worker to make it installable on phones.

Built with ❤️ as a companion to the Pamet iOS app.
