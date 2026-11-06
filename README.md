# ThermoPulse-AI

A sizing & simulation studio for SOFC–GT hybrid power plants serving AI data
centers: enter a campus load profile and an architecture, get back a defensible
engineering assessment — thermal-stress envelope, dynamic compliance,
efficiency, and heat-recovery yield.

## Repository layout

| Path                | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `packages/core`     | Pure TypeScript physics engine — no I/O, no UI dependencies    |
| `packages/studio`   | React + Vite client-only web app (the onboarding product)      |
| `.github/workflows` | CI: lint + format check + typecheck + test + build on every PR |

## Prerequisites

- Node.js >= 20
- pnpm (enabled automatically via corepack from the `packageManager` field):

```sh
corepack enable
```

## Setup

```sh
pnpm install
```

## Common commands

Run from the repo root (each fans out across the workspaces):

```sh
pnpm lint        # ESLint (flat config) over both packages
pnpm typecheck   # tsc --noEmit per package, TypeScript strict
pnpm test        # Vitest per package
pnpm build       # core emits dist/, studio produces the Vite production bundle
pnpm dev         # Vite dev server for the studio
pnpm format      # Prettier write
pnpm format:check
```

CI runs `pnpm install --frozen-lockfile` followed by lint, format check,
typecheck, test, and build on every pull request to `main` and every push to
`main`.

## Documentation

- Product & DOE Phase I spec: the pinned ThermoPulse-AI spec in the Obvious
  project (deliverables D1–D6, acceptance criteria, locked stack decisions).
- The testing plan and product development plan land under `docs/` with their
  respective deliverables.
