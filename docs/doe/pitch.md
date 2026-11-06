# ThermoPulse-AI — DOE FY26 Fall Opportunity Pitch (ConnectWerx Format)

**Topic:** Oil and Gas RD&D — Next-Generation AI-Driven Heat Transfer Systems for SOFC Embedded Gas Turbines Integration in High-Performance AI Data Centers (FECM)

**Project:** ThermoPulse-AI: Physics-Constrained Thermal-Electrical Dynamic Control for SOFC-GT Hybrid Microgrids in AI Data Centers

_Non-proprietary. Word counts below are conservative: they include inline bracketed source notes and placeholder flags, so the pitch stays under cap however a reviewer counts._

---

## 1. Summary and Topic Alignment (≤100 words)

AI data centers face grid-interconnection queues of five to seven years, driving rapid adoption of behind-the-meter SOFC–gas-turbine hybrid power. Paired directly with GPU clusters, these plants fail: compute loads pulse in milliseconds while thermal systems respond in minutes, causing compressor surge and irreversible SOFC stack cracking. ThermoPulse-AI is a physics-constrained control layer that decouples compute dynamics from thermal generation, using solid-state transformer buffering and hybrid storage to hold the SOFC-GT plant in a safe thermal zone while cascade heat recovery targets over 70% combined electric-thermal efficiency.

## 2. Technical Promise (≤200 words)

The core obstacle is a six-orders-of-magnitude timescale mismatch: GPU load pulses at 0.001–0.01 seconds (checkpoint saves, all-reduce synchronization, 30–70% depth), power electronics at 0.001–0.1 seconds, fast storage at 1–10 seconds, and SOFC-GT thermal dynamics at 100–1,000 seconds. Forcing a heat engine to follow GPU pulses drives the compressor into surge and cracks the ceramic stack through thermal stress.

ThermoPulse-AI resolves the mismatch with a four-layer architecture: (1) an AI workload-shaping and control layer built on physics-informed models; (2) a silicon-carbide solid-state transformer providing millisecond power buffering and direct 800 V DC interconnection; (3) hybrid storage — ultracapacitors or flywheels with batteries — absorbing transients from milliseconds to tens of seconds; and (4) the SOFC-GT plant, held within a protected thermal comfort zone whose ramp limits keep stack temperature inside its safety band. Buffering absorbs what thermal generation cannot follow; absorption-chiller heat recovery on turbine exhaust raises combined efficiency past 70%.

This mirrors active NETL Hybrid Performance (Hyper) priorities: dynamic load following in hybrid cycles, compressor-surge mitigation through fast cyber-physical bypass control, and SOFC-GT hybrid cyber-physical systems. Phase I delivers a validated multi-physics simulation core, the control-layer prototype, and quantified compliance metrics for thermal stress, surge margin, and storage adequacy.

## 3. Commercialization Potential (≤200 words)

The solid oxide fuel cell market is projected to grow from $2.3 billion in 2026 to $14.3 billion by 2033, a 29.4% CAGR, with data centers the fastest-growing demand segment [Grand View Research, 2026–2033 outlook]. Behind-the-meter gas power for AI campuses is demand-proven: Bloom Energy has announced supply agreements — several non-binding — including up to 2.8 GW with Oracle, over 100 MW across 19 sites with Equinix, and 900 MW with NTT DATA [company announcements, 2026]. No incumbent ships an AI-aware control layer that decouples GPU load dynamics from thermal generation; that is our wedge.

Our onboarding product is the ThermoPulse-AI Sizing & Simulation Studio: an operator enters a campus load profile and plant architecture and receives a defensible engineering assessment — thermal-stress envelope, dynamic compliance score, efficiency, and heat-recovery yield — in minutes, without hardware commitment. The studio converts evaluation into pilot deployments and licenses the control layer to fuel-cell, turbine, and data-center OEMs. Phase I exit targets a validated digital twin, an AI-data-center pilot onboarding playbook, and named OEM partnerships. We sell the intelligence layer, not hardware, keeping capital requirements low while serving gigawatt-scale deployments.

## 4. Team Qualifications (≤200 words)

[Prime Applicant Entity] leads the program as prime awardee, contributing the physics-constrained control architecture, power-electronics integration, and simulation software engineering. The team is led by founder Richard Lu. [Placeholder — confirm the registered entity holding SAM and SBA registrations before submission.]

Rutgers University, Department of Industrial and Systems Engineering, is the STTR research partner performing at least 30% of the effort: multi-physics thermal-mechanical-electrical co-simulation, multi-objective optimization under thermal-stress constraints, and system reliability and degradation modeling. Rutgers ISE sustains research programs in energy-systems optimization, reliability engineering, and digital twins.

Smartburn.com serves as industrial consultant, supplying combustion and gas-turbine heat-exchanger engineering priors, validating control strategies against real high-temperature equipment constraints, and supporting commercialization. Its letter of commitment defines scope, hourly rates, and conflict-of-interest safeguards.

Together the team covers the topic's full span — combustion and thermal engineering, turbomachinery dynamics, power electronics, and AI-driven control — with simulation evidence, not slideware, at the center of the Phase I work plan.

---

## Source Notes (not part of pitch word counts)

1. **Grid interconnection 5–7 years:** industry estimates reported in ThermoPulse-AI research findings (web research, retrieved 2026-11-06).
2. **SOFC market $2.3B (2026) → $14.3B (2033), 29.4% CAGR; data centers fastest-growing segment:** Grand View Research SOFC market report, retrieved 2026-11-06. Supersedes the memo's unsourced ~$5B→$30B+ figure.
3. **Bloom Energy announced pipeline (Oracle up to 2.8 GW; Equinix >100 MW, 19 sites; NTT DATA 900 MW):** Data Center Dynamics and Bloom Energy press releases, 2026; characterized as announced, several non-binding.
4. **NETL Hyper priorities (dynamic load following, surge mitigation via fast cyber-physical bypass controls, SOFC-GT hybrid CPS):** NETL Hybrid Performance facility program descriptions, retrieved 2026-11-06.
5. **Pulse depth 30–70%, timescale bands:** ThermoPulse-AI DOE2026 memo (internal source document) — engineering design parameters, not market claims.

## Submission Checklist (internal — not part of the pitch PDF)

- [ ] **BLOCKER — Prime applicant entity:** `[Prime Applicant Entity]` is a placeholder. Confirm the registered entity (must hold SAM + SBA registrations) and replace everywhere before submission. Open question from spec art_B7GK27w7.
- [ ] Registrations current: SAM, SBA Company Registry, ConnectWerx network, AMP.
- [ ] Word counts verified by script (see counts below); re-verify after any edit.
- [ ] PDF ≤ 5 MB, uploaded to AMP by **December 16, 2026, 2:00 p.m. ET**.
- [ ] Confirm no proprietary info anywhere in the pitch (this draft is non-proprietary).
- [ ] **Verify budget-split rules** (SBIR ≥67% prime / ≤33% external; STTR 40/30/30) against the official ConnectWerx Pitch Development Guide before finalizing D5 — figures came from the internal memo, not the official guide.
- [ ] Max 3 pitches per company — confirm this pitch is within the company's quota.
- [ ] Optionally attend DOE/ConnectWerx office hours (Nov 19 and Dec 1, 2026, 3:00 p.m. ET).

## Verified Word Counts (pitch body, script-checked)

| Section           | Cap | Count | Status |
| ----------------- | --- | ----- | ------ |
| Summary           | 100 | 86    | PASS   |
| Technical Promise | 200 | 199   | PASS   |
| Commercialization | 200 | 188   | PASS   |
| Team              | 200 | 158   | PASS   |

_(Counts include inline bracketed notes, checked 2026-11-06; re-run the count after any edit.)_
