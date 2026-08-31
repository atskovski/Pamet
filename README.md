# Pamet — Web (v1.0.1)

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
| **Welcome / Login** | Secured account gate (first name, last name, email + password). Only the **first name** shows on the Home greeting. |
| **Home** | Time-aware greeting + honor-system badge, day-streak card (toggleable), live AI insight banner (toggleable), 4 metric cards, recent entries |
| **Log** | Bottom-sheet form: symptom/mood/activity/medication chips with **"+" custom-field buttons** (scrollable), severity slider, sleep/stress/water/energy sliders, notes |
| **Calendar** | Monthly grid with color-coded days (mild / significant / healthy), month navigation, per-day detail |
| **Patterns** | AI pattern cards with confidence bars — **detected live from your actual entries**. Free is capped at 10; Pro is unlimited. |
| **Report** | Doctor-ready report with overview, symptom breakdown, AI patterns, medications, notes + **Email** and **Download PDF** |
| **Settings** | Dark mode, home-screen toggles (streak/insight), notifications, AI/privacy + **Primary Care Access**, custom symptoms, Free/Pro plan comparison, CSV/JSON export, change password, log out, delete account — each with a **? help tooltip** |

## v1.0.1 — what's new

- **Welcome / login screen.** A secured account gate appears before the app.
- **Honor-system badges.** A small medical-medal badge (bronze → silver → gold → platinum → beast) appears next to your name, earned by total days logged.
- **Free vs Pro plans.** You start on Free; upgrade to Pro in Settings. Free is capped at **10 AI patterns** and **5 custom fields per category**; Pro is unlimited.
- **New settings.** "Show day streak" and "Show AI insight" toggles, a **Primary Care Access** toggle (Pro), and a **? help tooltip** next to every option.
- **Custom fields anywhere.** "+" buttons in the Log sheet let you add custom symptoms, moods, activities, and medications (scrollable).
- **Green confirmations.** Saves and key actions confirm in the app's sage-green palette.

### Security note (auth)
This is a **static, client-side app**. Your password is salted and hashed with **PBKDF2 (Web Crypto)** and stored in your browser — the plaintext is never saved. This is a **local privacy gate**, not server authentication. It works on `localhost` and HTTPS (e.g. GitHub Pages). For true multi-device accounts, a backend is required. When opened via `file://` (no Web Crypto), a lighter hash is used and the app shows a warning.

## How it differs from the iOS app (in a good way)

- **Real pattern detection.** The iOS app shipped with hardcoded sample patterns. This version runs a lightweight correlation engine on your stored entries, so the "AI Patterns" screen reflects *your* data and updates as you log.
- **Real exports.** PDF (via print-to-PDF), CSV, and JSON export actually download.
- **Live metrics.** Streak, averages, top symptom, and the doctor report are all computed from your entries.
- **Persistence.** Entries and settings save to `localStorage` — your data survives refreshes, on your device.
- **Dark mode** works and persists.

## Structure

```
pamet-web/
├── index.html        ← welcome/auth + all screens, tab bar, log sheet
├── css/styles.css    ← palette, welcome/badges/tooltips/plan theming
└── js/
    ├── store.js      ← data model, tiers, plans, limits, pattern engine, metrics
    ├── auth.js       ← local PBKDF2 account gate (register/login/session)
    └── app.js        ← rendering + interactivity for every screen
```

## Design tokens

All colors are CSS custom properties in `styles.css`, mirroring `Colors.swift`:
`--warm-terracotta #C4673A`, `--sage-green #5C7A62`, `--rose-pink #C45C6A`, `--warm-amber #D4882A`, plus the ink/neutral and surface tones. Dark mode redefines the surface/ink tokens.

## Notes & next steps

- Data is local to the browser (no account server). For multi-device sync, point `store.js` persistence at a backend (Supabase/Firebase).
- The pattern engine is intentionally simple and transparent. Swap `detectPatterns()` in `js/store.js` for a real ML call when you're ready.
- Add a PWA manifest + service worker to make it installable on phones.

Built with ❤️ as a companion to the Pamet iOS app.
