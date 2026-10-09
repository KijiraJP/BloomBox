# Plan: Make every frontend page render full-page (all pages, all viewports)

## Diagnosis (confirmed by code inspection)

1. **Root cause — `frontend/src/index.css:57`** (`#root`, Vite scaffold default):
   ```css
   #root { width: 1126px; max-width: 100%; margin: 0 auto;
           text-align: center; border-inline: 1px solid var(--border); ... }
   ```
   Every page is boxed into a 1126px centered column with visible side borders and inherited
   centered text → "not in full page".
2. **`index.css` dark-scheme flip**: `color-scheme: light dark` + `@media (prefers-color-scheme: dark)`
   rewrites `--text / --text-h / --bg`. `h1,h2 { color: var(--text-h) }` from index.css would render
   near-white text on the light florist theme in dark OS mode (invisible headings, dark scrollbars/inputs).
3. **Two page shells capped** (would still letterbox after the root fix):
   - `bloombox.css:2314` — `.customer-home { max-width: 1100px; margin: 0 auto }`
   - `RiderDashboard.css:1` — `.rider-header` / `.rider-main` `{ max-width: 1180px; margin: auto }`
4. `frontend/index.html` — `<title>frontend</title>`.
5. `App.css` is dead code (never imported) — leave untouched.

Everything else (cart, catalog, checkout, product, profile, auth, admin, role selection) is already
fluid with vw/%-padding and has content-sized `max-width`s on text blocks (intentional — keep).

**User decisions**: remove inherited `text-align: center`; remove the 1100/1180px caps entirely.

## Changes

### A. `frontend/src/index.css` (global shell)
- `#root` → `width: 100%; max-width: 100%; margin: 0; border-inline: none;`
  and **delete** `text-align: center`.
  Keep `min-height: 100svh; display: flex; flex-direction: column; box-sizing: border-box`.
- Set `color-scheme: light` on `:root`; **delete** the `@media (prefers-color-scheme: dark)` block
  (app is a light-themed florist design; bloombox.css sets all real component colors).
- Keep everything else in index.css (`:root` 18px font base, `h1/h2` typography, `body { margin: 0 }`) —
  every hero already overrides its own fonts; touching typography would cause unrelated visual shifts.

### B. `frontend/src/bloombox.css:2314`
- `.customer-home`: remove `max-width: 1100px; margin: 0 auto` (keep `background: var(--cream)` etc.).
  Sections already use `padding: 90px 11%` so content spacing scales with viewport.

### C. `frontend/src/components/RiderDashboard.css`
- Remove `max-width:1180px;margin:auto` from `.rider-header` and `.rider-main` (keep their padding).

### D. `frontend/index.html`
- `<title>frontend</title>` → `<title>BloomBox Florals</title>` (viewport meta already correct).

### E. Responsive sweep — verify/add breakpoints (the "all POV" pass)
Audit each page shell at 375 / 768 / 1024 / 1440 / 1920 and add anything missing:
- **auth.css**: confirm `.auth-layout { grid-template-columns: 1fr 1fr }` stacks to 1 column and
  `.auth-visual` hides/condenses below ~900px (file is minified — inspect its existing `@media`,
  add rules if absent).
- **RiderDashboard.css**: confirm its `@media` collapses `.rider-metrics` / `.rider-grid` (3-col)
  and header nav on mobile; add if missing.
- **AdminDashboard.css**: confirm sidebar/topbar stack on small screens; add if missing.
- Already have breakpoints (no change expected): role-selection (700), customer-home (1050/760),
  cart / catalog / checkout / product (1050/760), profile (760), notifications (480), bootstrap for admin.
- Keep `body { overflow-x: hidden }` (bloombox.css) as the horizontal-overflow guard.

### F. Explicitly NOT changing
- Component-level content `max-width`s on text blocks/cards/heroes (intentional readability caps).
- Any JS/JSX logic — CSS/markup metadata only. No backend changes.

## Verification
1. `npm run lint` in `frontend/` — must stay at **0 errors** (baseline 4 warnings).
2. Vite transform checks — fetch changed files from `:5173` and assert new markers
   (`#root` without `1126`, `.customer-home` without `max-width:1100px`, etc.).
3. Headless Edge screenshots at 375 / 768 / 1440 / 1920 of public pages
   (role selection, login/register) — I cannot view images, so final visual sign-off from the user,
   including logged-in pages (home, catalog, cart, checkout, product, profile, rider, admin).
4. Lint + CSS reasoning review for alignment side-effects: explicit `text-align: center` rules
   (heroes, empty states, announcement) still center as before; unaligned text goes left.

## Risks
- Removing inherited centering changes appearance of any text that lacked its own alignment
  (user explicitly approved this — restores template intent).
- Removing caps stretches rider/customer-home grids on ultrawide monitors (user approved full edge-to-edge).
- Possible follow-up: small visual tweaks the user notices after review (breakpoints added in E mitigate).
