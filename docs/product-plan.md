# ThermoPulse-AI Product Development Plan

**MVP → Phase I exit → AIDC pilot.** This plan picks up where the MVP spec (art_B7GK27w7, approved 2026-11-06) leaves off: it names who ThermoPulse-AI sells the Sizing & Simulation Studio to, what they get, how they plug in, and what "Phase I exit" means in numbers a DOE reviewer and a prospective pilot partner can both check. Source evidence: research findings (art_nPfk8NY5, retrieved 2026-11-06) and the source memo (`ThermoPulse-AI DOE2026.md`, fl_TBoEfNlx).

**Load-bearing assumption:** the studio's simulation evidence — buffering keeps the SOFC inside its thermal band while an unbuffered baseline fails — is what convinces both AIDC buyers and DOE reviewers. That claim is physically grounded but not yet experimentally validated; the MVP engine is its first confirmation instrument. If pilot or partner data contradict the pulse-severity model, the compliance thresholds, the DOE pitch's technical claims, and the exit targets below all get revised together.

**Scope boundary (inherited, not reopened):** no hardware design or procurement, no vendor selection, no customer data ingestion in the MVP, no real-time firmware. This plan stays inside those lines — pilot-phase data intake is described as Phase I/pilot work, never MVP scope.

## 1. AIDC partnership assessment

The buyer market divides into three segments with the same underlying problem — grid interconnection queues of roughly 5–7 years in major US markets (findings, 2026-11-06) are forcing behind-the-meter SOFC–GT generation, and nobody ships an AI-aware control layer that decouples GPU pulse dynamics from thermal generation — but they buy different things from the studio.

### 1.1 Target segments

| Segment                                              | Named buyers (from memo + findings)                                                                           | What they get from the studio                                                                                                                                                                                                         | Why they engage                                                                                                                                                   | Integration surface                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Hyperscale / AI campus operators**                 | Microsoft, AWS, Google, Meta, CoreWeave; neoclouds racing time-to-power                                       | A defensible engineering assessment of a candidate BTM SOFC–GT plant against their actual GPU load profiles — thermal-stress envelope, compliance score, efficiency, heat-recovery yield — in minutes, before any hardware commitment | They buy time-to-power; every month waiting on interconnection is lost AI revenue. They need to trust a plant type no one has run against GPU dynamics            | Upload campus load profile; receive exported system spec for internal engineering review                                        |
| **Colocation & infrastructure developers**           | Equinix, Digital Realty, CyrusOne, Compass                                                                    | Same assessment, plus the "buffered vs. unbuffered" comparison as evidence they can hand tenants and utilities: this plant survives checkpoint pulses without stack cracking                                                          | They build where grid quota is exhausted and must sell "self-powered" halls to tenants; thermal-risk evidence de-risks the capex case                             | Preset + custom load profiles matching tenant commitments; system-spec export as onboarding artifact                            |
| **Energy OEMs & EPCs** (GT packages and SOFC stacks) | Bloom Energy (SOFC); Solar Turbines/Caterpillar, Capstone Green Energy (turbines); data-center microgrid EPCs | A standard dynamic-compliance report for their equipment against AI load profiles — turning "our stack will crack under GPU pulses" from an objection into a spec line they can qualify                                               | They face AIDC buyers who will otherwise default to grid-plus-batteries; a simulation standard helps them sell into dynamic duty without bespoke studies per deal | Load-profile intake preloaded with representative AIDC pulse patterns; system-spec export formatted for their proposal packages |

Named-vendor note: the companies above come from the memo's buyer list and Bloom's announced pipeline (findings, 2026-11-06: Oracle up to 2.8 GW, Equinix >100 MW across 19 sites, NTT DATA 900 MW, AEP 1 GW with Google offtaking 702 MW, Brookfield $25B framework). Several commitments are non-binding — all outbound language says "announced," never "deployed." Listing these companies as segment evidence is not vendor selection; the spec's non-goal stands.

### 1.2 The integration surface (two contract points)

The studio touches a partner through exactly two interfaces, both shipped in the MVP:

1. **Load-profile intake.** A `LoadProfile` (nominal MW, pulse list with start time, ramp-down time, depth fraction 0.30–0.70 per memo field data, horizon, timestep) enters as a preset or a custom-edited profile. MVP accepts synthetic and preset profiles only. Pilot phase adds file-based intake of partner-derived profiles — that work is Phase I scope, not MVP.
2. **System-spec export.** Every run produces an exportable Markdown system-spec document: the configuration, the compliance scorecard (thermal stress, surge, storage adequacy, overall), efficiency figures, and heat-recovery yield. This document is the onboarding artifact — the thing a partner's engineering team reviews, files, and forwards. Pilot phase extends it with partner branding and a signed-assessment cover page.

Keeping the surface at two points is deliberate: it makes "embed the studio in a pre-sales workflow" a one-meeting conversation, and it keeps the MVP client-only and stateless per the spec.

### 1.3 Qualification signals

A prospect qualifies as a partnership target when at least two of these are true:

- **Announced BTM power commitment** — publicly announced behind-the-meter or bridge generation for AI capacity (the Bloom pipeline pattern above), announced rather than deployed.
- **Site in an interconnection-constrained market** — campuses in Northern Virginia, ERCOT, Ohio, or comparable 5–7-year queue regions (memo, 2026-11-06).
- **Stated time-to-power pressure** — public statements about AI capacity delivery speed, meaning the buyer prices waiting in lost revenue.
- **Hybrid or SOFC equipment in their power roadmap** — an OEM with hybrid product lines, or an operator whose announced architecture includes fuel cells or turbines.
- **Willingness to share a representative load profile** (pilot stage) — the single strongest signal, because it converts the studio from a demo into their evaluation instrument.

## 2. Trajectory: MVP → Phase I exit → pilot

### Phase 0 — MVP (current build)

The sizing studio per spec: pure physics core, React/Vite studio, preset-to-first-result in under five minutes, buffered runs pass the reference pulse suite while the unbuffered baseline fails. The MVP is evidence infrastructure — it exists so that everything after it can point at a running model instead of prose.

### Phase I — PINN controller prototype and digital-twin validation

Phase I research converts the deterministic physics surrogate into a learning controller and closes the loop against the studio.

**PINN controller prototype.** The memo's control thesis (PINN/RL heat-transfer control plus workload shaping) is Phase I research by design — no PINN training happens in the MVP. Phase I work: train a physics-informed controller that predicts SOFC exhaust and turbine-expansion temperature distribution and modulates cooling-medium flow and bypass valves, keeping thermal stress inside the fatigue-safe band under dynamic load. Validation target: the PINN controller matches or beats the MVP's rule-based buffering dispatch on the same reference pulse suite, measured through the studio's own compliance scoring — the studio becomes the benchmark harness for the research contribution.

**Digital-twin validation against the studio.** Rutgers ISE (subaward, 23% of Phase I effort) builds the multi-physics digital twin — thermal-mechanical-electrical fidelity beyond the lumped-parameter MVP core. Cross-validation discipline: the digital twin runs the same scenarios as the studio, and the studio's compliance verdicts are checked against the twin's higher-fidelity results. The studio stays the fast, front-door instrument; the twin is the fidelity referee that tells us where the surrogate is trustworthy and where it needs recalibration.

**AIDC pilot onboarding playbook.** Prepared during Phase I, executed at pilot: (1) qualify the prospect against the signals in §1.3; (2) run their representative load profile through the studio (first file-based intake ships here); (3) issue the system-spec export as a signed engineering assessment; (4) where warranted, sponsor a digital-twin validation run at Rutgers for the specific architecture; (5) agree a pilot scope — what the partner contributes (profiles, review cycles, a site for eventual instrumentation), what ThermoPulse-AI delivers (assessment reports, control-layer design study, efficiency and heat-recovery analysis).

### Pilot phase

Two to three AIDC pilot engagements running the playbook end to end, producing: documented onboarding time from raw profile to signed system spec, partner-validated compliance assessments, and at least one digital-twin cross-validation report co-published with the academic partner. Pilot evidence feeds the Phase II proposal and the first commercial licensing conversations.

## 3. Measurable Phase I exit targets

These targets back the DOE pitch narrative (combined efficiency above 70%, protected thermal comfort zone, surge-free operation) and are stated so a reviewer can check each one against a delivered artifact.

| #   | Target                                 | Threshold                                                                                                                                                                        | Verified by                                                               |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Buffered compliance on reference suite | SOFC temperature inside `tempBandC` for 100% of the reference pulse horizon; zero surge-margin violations                                                                        | Studio test suite, CI-green (MVP acceptance, carried forward)             |
| 2   | PINN controller parity or better       | PINN controller matches or exceeds the rule-based MVP dispatch on the reference suite: no thermal excursions, no surge violation, storage-deficit events not worse than baseline | Cross-validated runs through the studio scoring engine; Rutgers co-report |
| 3   | Digital-twin cross-validation          | Studio verdicts agree with the higher-fidelity digital twin on pass/fail for ≥90% of scenarios; identified surrogate-error regions documented                                    | Rutgers validation report                                                 |
| 4   | Combined efficiency headroom           | Simulated combined electrical + thermal efficiency ≥70% on the reference campus configuration (the pitch's headline number), with heat-recovery yield reported separately        | Studio output on the pinned reference config                              |
| 5   | Phase I deliverables                   | Phase I completed within the $300,000 cap ($306,500 with TABA, per ConnectWerx FY26 terms, retrieved 2026-11-06); all work-plan milestones with measurable targets met           | DOE reporting                                                             |
| 6   | Partnership pipeline                   | ≥2 qualified AIDC prospects (two-plus signals in §1.3) taken through playbook steps 1–3; ≥1 signed pilot agreement or letter of intent at Phase I exit                           | Pilot playbook records                                                    |
| 7   | Phase II readiness                     | Phase II proposal submitted, built on pilot evidence and the validated controller                                                                                                | Submission record                                                         |

Target 4 is the one to watch: the >70% combined-efficiency figure comes from the memo's architecture thesis and is a pitch narrative number, not a measured result. If simulation with conservative assumptions lands below it, the pitch language and this table change before submission — better we find that in the studio than a reviewer finds it in the application.

## 4. Risks this plan carries

- **Unvalidated pulse-severity model** (the load-bearing assumption): digital-twin cross-validation (target 3) is the scheduled falsification instrument; pilot profiles are the second.
- **Pathway confirmed as SBIR (2026-11-06): Enerfy 67% / Rutgers 23% / Smartburn 10%; external work at the 33% Phase I cap, verified against sbir.gov Policy Directives and ConnectWerx FY26 resources; solicitation measurement basis still TODO-VERIFY.**
- **Non-binding buyer commitments**: all partnership counts use "announced" evidence only; targets 6–7 require signed instruments, which is the honest bar.
- **Registrations and submission are human-owned**: SAM, SBA, ConnectWerx, and AMP registrations, and the December 16, 2026 2:00 p.m. ET deadline, sit with Richard Lu — no agent submits DOE materials.
