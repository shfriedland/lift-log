# Lift Log

A personal workout tracker for Shep's phone (a replacement for the Rep Count app). It's a home-screen web app hosted on GitHub Pages at https://shfriedland.github.io/lift-log/.

## Files

No build step and no dependencies: the browser loads these files directly. Keep it that way unless asked.

- `index.html` is just the page skeleton (top bar, main area, tab bar, sheet) plus the `<link>` and `<script defer>` tags.
- `styles.css` holds all styling. Later rules override earlier ones, so order matters.
- `js/` holds the app, as plain scripts (not ES modules) that share one global scope. They load in the order listed in `index.html`, so a file can use anything from the files before it at load time, and anything from any file inside functions that run later:
  - `core.js`: helpers, `APP_VERSION`, app state `S`/`view`, the data model and history lookups (`lastFor`, `historyFor`).
  - `sync.js`: GitHub data-repo sync (push, pull, merge).
  - `media.js`: set videos and progress photos (IndexedDB, thumbnails, viewer, upload).
  - `views.js`: the screens, rendered as HTML strings (`render()`, `vWorkout()`, ...).
  - `sheets.js`: bottom sheets, including the exercise picker.
  - `motion.js`: springs, page transitions (`withTransition`), and the sheet's open / close / drag-to-dismiss.
  - `import.js`: CSV import and backup restore.
  - `actions.js`: `ACT`, the handlers for every `data-a="..."` button.
  - `app.js`: event wiring and startup. Must load last.
- `sw.js` is the service worker for offline use. It fetches the latest files when online and falls back to its cache when offline. **When you add, rename or remove a file, update its `F` list.**
- `manifest.json` and `icon-*.png` handle the home-screen install. `icon.svg` is the logo's source (Shep's design: a log book with a blue spine and a dumbbell) and the browser-tab icon; the PNGs (180, 192, 512) are rendered from it at full bleed, square, with no rounded corners, because iOS rounds them itself. To change the logo, edit `icon.svg` and re-render the PNGs.

## Shipping a change

- On every change, bump `APP_VERSION` in `js/core.js` **and** the cache name `liftlog-vN` in `sw.js` to the same number. If they aren't bumped, phones can keep showing the old version. The version shows at the bottom of the Settings tab.
- Pushing to `main` publishes to GitHub Pages in about a minute.
- To test locally, use VS Code's Live Server (`http://127.0.0.1:5500`). The service worker only registers on https, so local testing never gets stuck on a cached copy.

## Scrolling (important)

- **The window never scrolls.** The title bar (`#top`, sticky) and page (`#main`) scroll inside `#scroller`, a frame pinned to the screen; the tab bar, sheets and toast sit outside it. This is what keeps the tab bar from moving on iPhone (Safari moved it when the window's scroll height changed, e.g. switching from a long Workouts list to the short Cardio list). Use `scrollToTop()` (in `js/core.js`), never `window.scrollTo`, and anything that reads scroll position must read `#scroller.scrollTop`. **`html` and `body` must stay exactly one screen tall** (`min-height: 100lvh`): on iPhone home-screen apps, a page shorter than the screen makes fixed bars sit too high (seen on the short Cardio list before v39, and on every tab in v39–40). Don't use `height: 100%` or `overflow: hidden` on them either (v39 made the page short that way). The window still can't scroll, since everything on the page is pinned. **Bottom fix:** Shep's iPhone (home-screen app) reports the app's screen as 59pt shorter than it is (exactly the status bar), so bottom-pinned things sat 59pt too high. The phone isn't consistent (after resuming from the background the layout can be right again), so **don't trust `innerHeight`**: `fixViewport()` in `js/core.js` measures where an invisible `position:fixed; bottom:0` marker actually lands, compares that with `screen.height`, and for a 15–70px gap on an iPhone home-screen app sets `--vfix`; the tab bar, `#scroller`, bottom fade, `#sheetWrap` and toast all shift down by it. It re-checks every 2s and on resume (v43 measured `innerHeight` once, and when the phone corrected itself the bar ended up half off the screen). Settings shows `screen · bottom at · bottom fix` in small print for checking.

## Data

- On the phone, state lives in `localStorage` (`liftlog.v1`). Photos and videos are stored in IndexedDB (`liftlog-media`).
- It syncs to the **private** repo `shfriedland/lift-log-data` through the GitHub Contents API, using a fine-grained token the user pastes into Settings. The token is stored only in the browser (`liftlog.gh`).
- **Never put the token, or any workout data, in this repo. It is public.**
- Data repo layout:
  - `data/meta.json` holds `{unit, unitAt, exercises, routines}`.
  - `data/m-YYYY-MM.json` holds `{workouts: {id: workout}}`, one file per month of workout dates.
  - `media/<id>.<ext>` holds photos (always uploaded) and videos (only if the user turns that on in Settings, and only up to 40 MB).
- Merging is per item by `updatedAt`, so newest wins. Deletes are tombstones (`deleted: true`). `ghCache` (`liftlog.ghsync`) remembers each file's sha so unchanged files aren't downloaded again.

## Data model (short)

- **Exercise:** `{id, name, category, machine (plain text), notes (cues), updatedAt, deleted?}`. Older exercises may still have a `settings` array, which `settingsSummary()` turns into text.
- **Workout:** `{id, date 'YYYY-MM-DD', name, routineId?, entries: [{exId, target?, sets: [{w, r, note, done, warmup?, media?}]}], media?, notes, createdAt, finishedAt?, updatedAt}`. `w` and `r` are strings exactly as typed. A set is done when it has both a weight and reps.
- **Cardio session:** its own record in `S.workouts`, marked `kind: 'cardio'`: `{id, kind, date, type, min, dist, du, note, entries: [], createdAt, updatedAt}`. Storing it there means sync, backup and restore handle it with no special code. **`liveW()` returns lifting workouts only**; `liveC()` returns cardio sessions. `min` and `dist` are strings as typed (`min` can be `30`, `30.5` or `32:15`); `du` is `'mi'` or `'km'`, fixed when logged (from the lb/kg setting).
- **Routine:** `{id, name, exercises: [{exId, warm, sets, target}], updatedAt}`.
- Imported Rep Count workouts have ids like `imp<hash>`, so importing the same file again updates them instead of making duplicates.

## Behavior Shep asked for (keep it)

- Cardio has its own tab (2nd in the tab bar), separate from workouts: a list of sessions with date boxes and a "+ Log cardio" button; tapping one opens a page with type, date, time, distance and notes. Time and distance hint the last session of the same type (`lastCardio`), and pace shows once both are filled (speed in mph/km/h for Bike).
- Workout notes sit at the top of the workout as a slim box that grows as you type.
- Workout and cardio list cards have a date box on the left: small month and weekday in blue (the touch of accent on each card) around a big white day number, year added for past years. **Workout cards** are three columns: date box | workout name in a big font with sets · lb small underneath | the exercises as a vertical list (up to 5, else 4 plus "+N more"), separated by a thin divider. Cardio cards keep name and summary stacked.
- There is no "Previous" column on the workout screen. Each set row is SET | weight | reps | an always-visible note box (the widest column; a small-text, multi-line textarea that grows to fit) | video-icon button that opens that set's videos. The weight and reps boxes show last time's numbers for that set as placeholder hints (reps falls back to the routine target).
- Last-time numbers (used to prefill new sets) come **only from the same routine** (matched by `routineId` or by workout name). There's no fallback to other routines. A plain unnamed "Workout" uses any history.
- Warm-up sets (tap the set number) don't count toward volume, est. 1RM, heaviest, or working-set numbering. Holding the set number opens Delete / warm-up options.
- There are no check-mark buttons on sets.
- Exercise ⋯ menu → "Replace exercise" swaps the exercise but keeps its sets as they are. The picker starts filtered to the same category (muscle group), with "Show all" to see every exercise.
- Machine settings are a single plain-text field opened from the ⚙︎ icon.
- Set videos belong to one specific set and show in that exercise's history. "Progress check" photos and videos belong to the whole workout.
- Rep Count CSV import: a new workout starts whenever the workout name **or** the "Workout Start" time changes from the row above. Muscle group comes from the Category column.
- Motion follows Apple's fluid-interface rules (the `apple-design` skill in `.claude/skills/` has the full guidance), all in `js/motion.js`:
  - Page changes go through `go()` → `withTransition`: opening slides in from the right, going back slides out to the right, switching tabs is a plain opacity fade (no scaling or movement, which made long lists drift) while the tab highlight slides. Tapping a tab opens that tab's main list, never a page left open inside it, **except**: coming to Workouts from another tab while a workout is in progress (`activeWorkout()`: today, not finished, under 8 hours old) opens that workout. Tapping Workouts while already on it goes to the list. Tab taps always use the fade. The slide keeps a short-lived copy of the old page (`.pageGhost`). It does not use the View Transitions API, because that froze the glass bars into flat snapshots.
  - Sheets open and close with springs (`showSheet` / `hideSheet`, never by toggling the `on` class directly) and can be dragged shut by the strip at the top (`#sheetGrab`): 1:1 with the finger, rubber-band when pulled up, flick to dismiss.
  - Animations start from where things currently are and never block taps. No bounce unless a flick caused the motion. Pressed states show within 0.1s.
  - Swipe from the left edge (within 24px) on a workout, exercise or routine to go back: the page follows the finger over a copy of the list (`.pageUnder`); past halfway or a flick commits, otherwise it springs back.
  - `haptic()` gives a light tap only for: long-press set menu, sheet flicked shut, swipe-back committing. On iPhone it toggles a hidden switch checkbox (iOS 18+ plays a haptic for that); there's no other way for a web app.
  - Text size follows the iPhone's Text Size setting (`applyTextSize()` in `js/core.js`, capped at 0.88–1.35×). **All sizes in `styles.css` are `rem` (1rem = 16px at normal size); write new ones in rem too**, except borders, shadows and blur. The set row's fixed columns are capped with `min()` so notes keep their room at big sizes.
  - iOS accessibility settings are honored in `styles.css`: Reduce Motion (plain fades, no slides or springs), Reduce Transparency (solid instead of glass), Increase Contrast.
- The UI is dark, compact and phone-first. **Current theme (v34): neutral dark with a soft blue accent, colors sampled exactly from Shep's reference screenshot**, in the "Theme" section at the very end of `styles.css` (it overrides everything above it): page `#121214`, cards `#1c1c1f` with `#2d2d33` border, date tiles/fields `#27272b`, buttons `#5c8bf7` with white text, blue text/icons/selected tab `#5987ef`, titles `#f4f4f5`, gray text `#98989f`, tab bar `#1b1b1e` with `#2b2b30` border, synced dot `#6ad09d`. Flat surfaces: no background glow, no glossy highlights or rims, no tab highlight bubble, and no blur under the top bar (Shep found it made the top of the screen look blurry; content just fades into the background there). Blue is used only for done or tappable things. Shep dislikes vibrant/saturated colors (lime and vivid indigo were both rejected).
- Earlier "liquid glass" styling (glass variables, rims, gloss, background glow) is still in `styles.css` but switched off by the Theme section. Shep tried glass again in v35 (neutral, no glow) and preferred it flat, so keep it flat unless asked.

## Testing

There's no test suite. Check changes by running the page in a phone-sized browser (390×844). To test sync without touching real data, intercept `https://api.github.com/**` with a mock.
