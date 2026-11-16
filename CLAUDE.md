# Lift Log

A personal workout tracker for Shep's phone (a replacement for the Rep Count app). It's a home-screen web app hosted on GitHub Pages at https://shfriedland.github.io/lift-log/.

## Files

- `index.html` is the whole app: HTML, CSS and JavaScript in one file, with no build step and no dependencies. Keep it that way unless asked.
- `sw.js` is the service worker for offline use. It fetches the latest files when online and falls back to its cache when offline.
- `manifest.json` and `icon-*.png` handle the home-screen install.

## Shipping a change

- On every change, bump `APP_VERSION` in `index.html` **and** the cache name `liftlog-vN` in `sw.js` to the same number. If they aren't bumped, phones can keep showing the old version. The version shows at the bottom of the Settings tab.
- Pushing to `main` publishes to GitHub Pages in about a minute.
- To test locally, use VS Code's Live Server (`http://127.0.0.1:5500`). The service worker only registers on https, so local testing never gets stuck on a cached copy.

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
- **Routine:** `{id, name, exercises: [{exId, warm, sets, target}], updatedAt}`.
- Imported Rep Count workouts have ids like `imp<hash>`, so importing the same file again updates them instead of making duplicates.

## Behavior Shep asked for (keep it)

- The "Previous" column and last-time numbers come **only from the same routine** (matched by `routineId` or by workout name). There's no fallback to other routines. A plain unnamed "Workout" uses any history.
- Warm-up sets (tap the set number) don't count toward volume, est. 1RM, heaviest, or working-set numbering. Holding the set number opens Delete / warm-up options.
- There are no check-mark buttons on sets.
- Machine settings are a single plain-text field opened from the ⚙︎ icon.
- Set videos belong to one specific set and show in that exercise's history. "Progress check" photos and videos belong to the whole workout.
- Rep Count CSV import: a new workout starts whenever the workout name **or** the "Workout Start" time changes from the row above. Muscle group comes from the Category column.
- The UI is dark, compact and phone-first, with lime (`--acc`) used only for done or tappable things.

## Testing

There's no test suite. Check changes by running the page in a phone-sized browser (390×844). To test sync without touching real data, intercept `https://api.github.com/**` with a mock.
