# Commitly v4 — Product Requirements Document

## Original Problem Statement
User request (Indonesian): "analisa code ini, lalu perbaiki dari segi UI/UX dan tambahkan fitur-fitur lainnya"
Translation: Analyze this code, improve UI/UX, and add more features.

Uploaded artifact: `index.html` — existing single-file daily task tracker called **Commitly** with dark navy/neon-green theme, GitHub-style contribution heatmap, stats cards, and swipe gestures.

## User Choices
- **Deployment approach**: Opsi C (Hybrid) — Single HTML file, fully free to deploy anywhere (GitHub Pages, Netlify, Vercel, Cloudflare Pages). PWA-ready so it can be installed on mobile/desktop.
- **Design**: Delegated to design agent → Archetype Swiss & High-Contrast with Vermilion (#FF4F00) accent
- **All 11 proposed features implemented**: dark/light toggle, pomodoro per task, sub-tasks, recurring tasks, browser notifications, import/export JSON, achievements/badges, search & advanced filter, drag & drop, PWA install, UI/UX overhaul

## Architecture
- Single HTML + inline JS + inline CSS (one portable file for final delivery)
- No backend, all state in browser `localStorage`
- Storage keys: `commitly_v4` (tasks), `commitly_settings_v1` (settings), `commitly_achievements_v1` (unlocked badges)
- Auto-migrates from `commitly_v3` legacy data
- CDN libs: Chart.js (recap chart), SortableJS (drag-drop), Phosphor Icons
- Google Fonts: Bricolage Grotesque + Manrope + Space Mono
- Served locally via `python3 -m http.server 3000` (supervisor-managed)

## Core Requirements (static)
1. Track daily tasks with streak motivation + gamification
2. Store data locally (no account required) for privacy + free deployment
3. Feel like a premium productivity instrument (not generic AI-slop UI)
4. Fully mobile-responsive with touch gestures
5. Free & portable — user can download `commitly.html` and use offline or deploy anywhere

## User Personas
- **Solo productivity fan** — wants to track daily commits, build streaks, see progress visually
- **Developer / maker** — appreciates GitHub-style heatmap, sharp design, keyboard shortcuts
- **Privacy-conscious user** — wants data local-only, no sign-up, no cloud

## What's Been Implemented (as of 2026-05-06)

### Preserved from original
- [x] Task CRUD with priority (high/medium/low) + category (6 cats)
- [x] Daily streak calculation
- [x] GitHub-style year heatmap (364 days) + month grid view
- [x] Stats cards: Today Done, Streak, All-Time, Overdue
- [x] Progress bar for today's completion %
- [x] Tabs: Today / All Tasks / History
- [x] Swipe gestures (delete-left, edit-right) on mobile
- [x] Monthly recap modal with Chart.js bar chart
- [x] Overdue banner with "Move all to today" action
- [x] Filter pills by priority + category

### NEW features (v4)
- [x] **Dark + Light theme toggle** — persists, instant switch
- [x] **Pomodoro timer per task** — inline UI, configurable focus/break minutes, counts sessions
- [x] **Sub-tasks / checklist** — nested under each task with own completion tracking
- [x] **Recurring tasks** (daily or weekly) — auto-spawns next instance on completion
- [x] **14 Achievements / Badges** — hexagonal cards with unlock animation
  - First Commit, Getting Started, Productive, Centurion, Machine
  - Streaks: Warming Up (3d), On Fire (7d), Unstoppable (30d), Legendary (100d)
  - Polymath (all 6 cats), Early Bird, Night Owl, Focused Mind, Perfect Day
- [x] **Browser notifications** — pomodoro alerts + daily reminder if no task done by 8 PM
- [x] **Import / Export JSON** — full data backup/restore with validation
- [x] **Advanced search** — keyword + date range filter (Cmd/Ctrl+K shortcut)
- [x] **Drag & drop reorder** — SortableJS-powered on pending list
- [x] **PWA install** — manifest with inline SVG icons + install prompt banner
- [x] **Complete UI/UX overhaul** — Swiss high-contrast design, Vermilion accent, distinctive typography
- [x] **New additions beyond the 11**:
  - Inline double-click edit on task text
  - Keyboard shortcuts (Esc, Cmd/Ctrl+K)
  - Auto-migration from `commitly_v3` storage
  - Daily reminder at 8 PM if zero tasks done
  - Wipe all data (with double confirmation)
  - Contextual header greeting (morning/afternoon/evening/night owl)

## Files
- `/app/public/index.html` — main HTML + inline CSS (+ external app.js)
- `/app/public/app.js` — all logic (1230 lines)
- `/app/public/commitly.html` — **single-file portable combined deliverable** (~115KB, 2425 lines)
- `/app/source/index.html` — original uploaded file (kept for reference)
- `/app/design_guidelines.json` — design system spec

## Prioritized Backlog (P0 / P1 / P2)

### P0 — Deployment & distribution
- Share `/app/public/commitly.html` as the final single-file deliverable to the user (they can double-click to run or upload to any static host)

### P1 — Polish (nice-to-have)
- Service worker for true offline support (currently PWA installs but relies on cached HTML)
- Haptic feedback on mobile swipe actions
- Sortable on 'All Tasks' view too (currently only Today-Pending)
- Time tracking: log when task was started vs completed
- Keyboard nav for heatmap cells

### P2 — Advanced / optional
- Optional cloud sync via Google Drive or GitHub Gist (BYO credentials)
- Collaborative tasks (requires backend — out of scope)
- AI task breakdown / coach (needs LLM key — can add via Emergent Universal Key later)
- Multi-language support (currently English UI)
- Calendar week view
- Time zone handling

## Testing Status
- Frontend testing agent: **100% pass (23/23 features verified)**
- Report: `/app/test_reports/iteration_1.json`
- No critical or major bugs. Minor polish items addressed.

## Deployment Options (all free)
1. **Offline**: user downloads `commitly.html`, opens in browser — works fully
2. **GitHub Pages**: push `commitly.html` to a repo, enable Pages
3. **Netlify / Vercel / Cloudflare Pages**: drag & drop `commitly.html`
4. **Self-host**: any static file server (Python http.server, nginx, caddy, etc.)
