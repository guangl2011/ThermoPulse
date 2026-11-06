# ThermoPulse-AI Testing Plan (D3)

Every test file in the repository is listed here, mapped to the **failure mode it
pins** — the specific way the product could silently break if that test were
deleted. The plan is checked against reality in CI: the acceptance criterion for
D3 is that no test described here is nonexistent and no existing test file is
missing from this map.

## How to run everything

| Scope | Command |
| --- | --- |
| Core unit + property tests | `pnpm --filter @thermopulse/core test` |
| Studio unit + component tests | `pnpm --filter @thermopulse/studio test` |
| Studio e2e (Playwright, boots Vite) | `pnpm --filter @thermopulse/studio test:e2e` |
| Lint + typecheck (CI runs both) | `pnpm -r lint && pnpm -r typecheck` |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, both Vitest suites
(including the fast-check property tests), and the Playwright e2e suite on every
pull request. Property tests use 200 runs per property per the spec's acceptance
criteria.

## Failure modes this plan exists to catch

The five headline failure modes from the product spec, and where each is pinned:

1. **Thermal-band excursion undetected** — a buffered or unbuffered run steps
   the SOFC outside `tempBandC` and nothing records it. Pinned in
   `packages/core/src/thermal.test.ts` and `packages/core/src/scoring.test.ts`,
   and composed end-to-end in `packages/studio/src/lib/runner.test.ts`.
2. **Buffering shortfall clamped silently** — storage exhausts mid-pulse and the
   deficit is clamped instead of recorded as an unmet event, so a failing
   configuration looks healthy. Pinned in `packages/core/src/buffer.test.ts`
   and `packages/core/src/scoring.test.ts`.
3. **Aliasing on sub-timestep pulses** — a millisecond-scale checkpoint drop on
   a coarse grid aliases to near-zero energy instead of being captured as an
   intermediate average. Pinned in `packages/core/src/pulse.test.ts`.
4. **NaN propagation to the dashboard** — malformed input reaches the core or
   the render layer and NaN appears as a dashboard number instead of an
   actionable error. Pinned in `packages/core/src/validate.test.ts`,
   `packages/studio/src/lib/validate.test.ts`,
   `packages/studio/src/lib/parse.test.ts`,
   `packages/studio/src/lib/format.test.ts`, and asserted in e2e
   (`packages/studio/e2e/studio.spec.ts`).
5. **Export missing the scorecard** — the exported Markdown system spec omits
   the compliance scorecard or its verdict, breaking the AIDC onboarding
   artifact. Pinned in `packages/studio/src/lib/specExport.test.ts` and e2e.

## packages/core — physics engine

Pure engine: no I/O, no UI. These tests are the Phase I credibility layer.

| Test file | What it covers | Failure mode pinned |
| --- | --- | --- |
| `src/index.test.ts` | The shared `clamp` helper: in-band passthrough, both edges, NaN rejection, inverted-band rejection. | NaN propagation to the dashboard — a NaN injected anywhere upstream is stopped at this primitive instead of flowing into a series. |
| `src/pulse.test.ts` | `synthesizeLoad`: steady profiles, single-pulse shape and closed-form energy, sub-timestep capture, overlapping-pulse stacking, horizon clipping, boundary rejection, and fast-check properties (bounded/finite series, energy conservation across grid refinement, invalid-mutation rejection). | Aliasing on sub-timestep pulses — a 10 ms transient on a 0.5 s grid must be captured as an intermediate average with grid-independent horizon energy; aliasing would make checkpoint drops invisible and the plant's central hazard untestable. |
| `src/thermal.test.ts` | `runSofcThermal` power and thermal channels (ramp limiting, must-run floor, steady-state start, excursion recording), energy book closure, `runTurbine` first-order lag and surge-margin dip, `allocateDemand` oversubscription and must-run dump, combined `simulateThermal`, boundary rejection, and property tests (energy book within 0.1%, bounded/finite state, excursion/band agreement, surge margin bounds). | Thermal-band excursion undetected — an unbuffered pulse that steps the command must record an excursion, and the excursion ledger must agree exactly with the band series; a silent miss here voids the safety claim. |
| `src/buffer.test.ts` | `dispatchStorage`: unbuffered baseline equals raw demand allocation, buffered dispatch keeps the SOFC on its capability trajectory, checkpoint coverage with zero unmet energy, mid-pulse exhaustion recorded as FAIL evidence (never clamped), power-limited propagation, SST power limits in both directions, the energy book inside [0, capacity], efficiency-dependent drain, partial state of charge, config validation, and fast-check properties (book bounds, no unmet power while the buffer retains energy and headroom). | Buffering shortfall clamped silently — storage exhaustion must surface as recorded unmet energy, not a clamped command that hides the deficit from scoring. |
| `src/scoring.test.ts` | `worstVerdict` ordering, `scoreThermalStress` (no excursion / small / large breach), `scoreSurge` (design margin consumed), `scoreStorageAdequacy` (unmet energy, oversubscription, floor-riding buffer, healthy and zero-capacity plants), threshold validation and documented default cuts, the composed buffered-vs-unbuffered reference scenario, and fast-check properties (overall is the worst criterion, threshold-relaxation monotonicity, unbounded buffer PASS on a feasible plant). | Both a thermal-band excursion undetected and a buffering shortfall clamped silently — scoring is where excursions and unmet events must become FAIL/MARGINAL verdicts; monotonicity properties guarantee the score never improves when constraints tighten. |
| `src/efficiency.test.ts` | `integratePowerMWh`, `accountEfficiency` on the composed reference run (electrical from the delivery book, combined decomposition, COP conversion, return-water sensitivity), accounting guards (turbine credit capped at the rejection stream, no >100% when the buffer donates initial charge, non-finite fuel rejection, recovery clamping), and fast-check properties (all three efficiencies bounded, thermal yield monotone in return-water temperature, combined ≥ each channel). | An efficiency figure above 100% or NaN on the dashboard — accounting bugs that would embarrass the DOE submission if a reviewer reran the numbers. |
| `src/validate.test.ts` | `assertValidLoadProfile` (nominal, horizon, timestep band, step budget, pulse array/shape/ramp/depth/hold), `assertValidSystemConfig` (SOFC, temp band, ramp, turbine, surge margin, zero storage as legal baseline, technology/topology enums, efficiency ranges), and `assertValidCommandSeries` (finite series with offending index). | NaN propagation to the dashboard — the core boundary rejects absurd inputs with actionable messages so they can be rendered, never crash or silently clamp. |

## packages/studio — runner and UI

| Test file | What it covers | Failure mode pinned |
| --- | --- | --- |
| `src/lib/presets.test.ts` | Exactly the three contract presets (training-heavy, inference-serving, mixed), each preset's profile and config passing studio validation, and profile naming. | The spec's five-minute onboarding contract breaking — a preset that fails its own validation would dead-end a new user at the empty state. |
| `src/lib/parse.test.ts` | `parseNumberInput`: ordinary numeric strings parse; empty or malformed input returns NaN for the validator to flag. | NaN propagation to the dashboard — malformed keystrokes become a validation error, not a crash or a NaN run. |
| `src/lib/validate.test.ts` | `validateLoadProfile` and `validateSystemConfig` studio-level rules: preset acceptance, nominal/depth/pulse-count/timestep bounds, NaN reporting, zero storage as the legal unbuffered baseline, half-specified storage rejection, SST efficiency range, NaN turbine capacity. | NaN propagation to the dashboard — the form layer must report NaN as an inline error before the run button enables. |
| `src/lib/runner.test.ts` | `toCoreLoadProfile` pulse synthesis and field carriage, `toCoreSystemConfig` mapping and fixed assumptions, `decimateSeries` budget capping, and `runSimulation`: complete dashboard view for the training-heavy preset, buffered beats unbuffered on thermal stress, zero storage as the legal unbuffered baseline, oversubscribed plants surfaced as shortfalls (not crashes), and `RunnerInputError` carrying the core's actionable message. | Thermal-band excursion undetected and buffering shortfall clamped silently at the composition boundary — the runner must preserve the core's verdicts and never swallow a `RunnerInputError`. |
| `src/lib/format.test.ts` | `formatPercent` / `formatNumber` decimal handling and rejection of non-finite input. | NaN propagation to the dashboard — a non-finite result renders an explicit error state, never the string "NaN". |
| `src/lib/specExport.test.ts` | `specFileName` slugging, and `buildSystemSpecMarkdown`: scorecard present on a PASS run, **equally complete on a FAIL run**, every number traced to configuration including fixed assumptions, generated-at stamp and draft-assessment caveat, end-to-end match against real runner output. | Export missing the scorecard — the onboarding artifact must carry the verdict whatever it is; a FAIL run that exports a clean-looking spec would mislead an AIDC partner. |
| `src/components/PresetSelector.test.tsx` | One option per preset with description, pressed-state marking, upward selection reporting. | The five-minute onboarding contract — preset buttons that don't reflect or report selection break the empty-state flow. |
| `src/components/LoadProfileForm.test.tsx` | Field rendering with current values, parsed numeric patches, actionable inline error for an invalid field, error clearing when valid. | NaN propagation to the dashboard — invalid profile input must render an actionable message inline. |
| `src/components/SystemConfigForm.test.tsx` | Plant field rendering, storage/SST select options, parsed numeric patches, inline error rendering. | NaN propagation to the dashboard — same as above, for plant configuration. |
| `src/components/ResultsDashboard.test.tsx` | Compliance scorecard rows and FAIL badges, efficiency percentages, thermal envelope SVG with band labels, empty-state call to action, populated dashboard, storage shortfall rows, and the runner's actionable rejection rendering instead of crashing; `RunPanel` disabled/enabled logic. | Thermal-band excursion undetected (a FAIL verdict must render as its own badge, not be hidden) and NaN propagation to the dashboard (runner rejections render as messages, never a white screen). |
| `src/App.test.tsx` | The shell: empty state with presets and both forms, preset selection loading both forms, inline invalid-input message with the run button disabled, error clearing on a valid value, preset run rendering the dashboard, runner rejection rendering instead of crashing, and export containing the compliance scorecard. | The spec's user-visible behavior contract end to end at the component level: empty state → preset → run → assessment, with actionable errors and a complete export. |

## packages/studio/e2e — Playwright (browser, real Vite server)

`studio.spec.ts` covers the spec's behavior contract in a real browser:

| Test | Contract verified | Failure mode pinned |
| --- | --- | --- |
| `preset selection through dashboard render` | Empty state → preset swap loads both forms → one-click run → full dashboard (scorecard, envelope, shortfalls, efficiency, chart). | The five-minute onboarding contract breaking in the real app even though components pass in isolation. |
| `empty state offers the three contract presets` | Before any run the page shows "No assessment yet" and all three preset buttons (Training-heavy, Inference-serving, Mixed) are present. | Empty state dead-ending a new user — the presets are the entry ramp to the first assessment. |
| `invalid input shows an actionable message without crashing` | An impossible field value produces a visible inline error and disables the run; the shell and forms remain rendered (no crash). | NaN propagation to the dashboard — a browser-level guarantee that bad input is message, not crash. |
| `system-spec export contains the compliance scorecard` | Export downloads a `.md` file containing the scorecard, plant configuration, and combined efficiency. | Export missing the scorecard. |
| `export completes on a FAIL run` | Zeroing the storage fields produces the unbuffered baseline, the scorecard records overall FAIL, and the export still completes with the FAIL verdict recorded in the document. | Export missing the scorecard on the runs that matter most — a failing assessment must still produce the complete onboarding artifact. |

## Gaps and future coverage

- No visual-regression snapshotting yet — the envelope chart is asserted
  structurally (SVG present, band labels) rather than pixel-wise.
- Playwright runs Chromium only in CI; the studio is a static client, so
  cross-browser risk is low but unmeasured.
- The e2e suite does not cover the Mixed preset's dashboard rendering; unit
  tests cover all three presets' validation and the runner's composed output.
