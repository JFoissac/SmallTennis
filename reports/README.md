# Evidence — autonomous tennis, weather and crowd

Regenerate everything with one command:

```bash
npm run sim
```

Optional: `node scripts/sim.mjs --matches=10 --seed=20261028` (defaults: 10 matches per run, 20 total).

The command builds the app, serves it with Vite preview, then:

1. plays 10 matches dry and 10 matches on a kept-wet court at a fixed seed,
2. steps the simulation through `window.__loveall.step()` (no real-time waiting),
3. checks scorelines, career progression, weather deltas and crowd behaviour,
4. writes screenshots for the crowd and the wet court.

## Latest result

Seed `20261028`, 20 matches, all checks passed.

| Metric | Dry | Wet |
| --- | --- | --- |
| Matches | 10 | 10 |
| Points | 694 | 736 |
| Shots | 5 887 | 5 035 |
| Error rate per shot | 8.7 % | 11.0 % |
| Average rally | 8.5 shots | 6.9 shots |
| Attendance | 15 / 22 | 15 / 22 |

Crowd: 15 seated in dry conditions, 0 under the rain/cover, 15 again after the court dries.

Performance (headed Chromium, 1000×640): 60.2 fps, p95 frame 16.8 ms, 253 meshes.
See `perf.json`.

## Files

- `sim-report.json` — full machine-readable report and checks
- `crowd-dry.png`, `crowd-rain.png`, `crowd-after-rain.png` — stand emptying and refilling
- `court-wet.png` — wet court with puddles
- `ui-ladder.png` — career line in the existing ladder panel
- `ui-mobile.png` — 390 px layout, no horizontal overflow
- `perf.json` — frame-time budget

## Notes

The simulation is deterministic for a given `?seed=` (verified twice on seed 424242, identical match summaries).
The career is in memory only: reloading the page resets it, as specified.
