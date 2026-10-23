# Online paired comparison handoff

This is a handoff snapshot, not a claim of complete browser/device acceptance. Further optimization was stopped at the owner's request.

## Implemented

- `compare.html#compare=...` opens a configured building directly: point cloud left, mesh right, including narrow mobile widths.
- Public index fetched first; mesh verified/parsed/displayed before the current point cloud completes.
- Module-worker point parsing with deterministic display sampling (default 250,000, maximum 1,000,000); source objects are unchanged. Fallback uses the existing asynchronous parser.
- Shared mesh-derived origin and real scale; synchronized cameras do not refit when the cloud arrives. Independent pane errors and same-ID retry are supported.
- Bounded raw-byte neighbor cache (32 MiB, at most three pairs), cancellation/generation ownership, Save-Data handling and no persistent preference writes.
- Compact ID navigation/search and a quieter homepage share action.

## Verify and continue

Run `npm test`, `npm run build`, and `npm run test:artifacts` with the existing locked dependencies. Targeted coverage: `node --test tests/online-compare*.test.mjs`.

The source baseline is `b27f5a1c093457497e07e8979cba7551cb5bf9de`; the previously published deployment commit is `a3ed4a3c19f5a8cb0141d255f79e8261e70c1973` (build `18c3fc419882d16f`). This snapshot changes the web application only; it does not publish an APK, modify storage permissions or include credentials/data files.

## Remaining acceptance and limits

- Actual browser screenshots, WebGL execution/visual acceptance, browser CORS enforcement and real-device usability are NOT RUN. Renderer tests capture production upload arrays and transformations through mocked WebGL; they do not replace visual testing.
- Sampling reduces parse/render output, not downloaded bytes. Current source files retain existing 8 MiB OBJ / 64 MiB point-cloud limits; over-budget foreground files are not retained in the 32 MiB cache.
- Worker availability and fetch priority hints are browser-dependent. Test worker errors, low-memory devices and slow connections before calling this production-complete.
- Comparison pairing uses matching `<building>/mesh` and `<building>/point_cloud` entries. Missing data is reported for that pane; unrelated IDs are never paired.
- No native App/offline remote loading, automatic upload, credentials or background whole-directory download is included.

Known test stability note: one full parallel run hit the existing 100 ms delayed-HTTP chunk-cancellation assertion (`retry cancels old HTTP chunk sequence...`). This is separate from the new comparison controller tests. Keep the first-run log and check this timing-sensitive test under CI load rather than treating one successful rerun as proof of perfect stability.
