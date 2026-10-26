# BasisGuard

BasisGuard is a research audit and regression-testing console that evaluates whether structured AI research answers are supported by their cited evidence, routes ambiguous answers to explicit review, and measures the accuracy/latency/cost trade-offs of verification and retry policies.

BasisGuard is an independent project. It is not owned, endorsed or operated by Parallel; it only calls Parallel's public API through the official `parallel-web` SDK.

## Prerequisites

- Node 22
- pnpm 11
- Docker (for PostgreSQL 17, bound to `127.0.0.1:5432`)

## Layout

- `frontend/` - Next.js web app (`@basisguard/web`)
- `apps/worker` - durable run worker (no HTTP port)
- `packages/{contracts,core,db,providers}` - shared libraries
- `config/rate-cards/` - versioned provider rate card
- `tests/` - network-deny harness, unit-level boundary tests and Playwright E2E specs

## Setup

```bash
pnpm install
pnpm db:up   # starts PostgreSQL; creates basisguard_dev, basisguard_test, basisguard_bench
DATABASE_URL=postgres://basisguard:basisguard@127.0.0.1:5432/basisguard_dev  pnpm db:migrate
DATABASE_URL=postgres://basisguard:basisguard@127.0.0.1:5432/basisguard_test pnpm db:migrate
```

## Running in fixture mode (no keys, no network)

Fixture mode uses hand-authored synthetic provider data and may only connect to `basisguard_test`. Use the same three variables for the web app and the worker, in two terminals:

```bash
export BASISGUARD_MODE=fixture
export DATABASE_URL=postgres://basisguard:basisguard@127.0.0.1:5432/basisguard_test
export BASISGUARD_RATE_CARD=$PWD/config/rate-cards/parallel-2026-10-17.json

pnpm dev      # terminal 1: http://127.0.0.1:3000
pnpm worker   # terminal 2
```

## Tests

```bash
pnpm typecheck
pnpm --filter @basisguard/web lint
pnpm test            # unit + integration (real PostgreSQL basisguard_test, zero network)
pnpm test:coverage   # same, with an 80% gate on packages/core and packages/contracts
pnpm test:e2e        # Playwright against a fixture-mode next dev + worker
```

The unit and E2E suites share `basisguard_test`: run them one after the other, never concurrently.

## Runtime modes

| Mode | Keys | External API/HTTP | Database writes | Intended environment | Hosted allowed? |
|---|---|---|---|---|---|
| `live` | Parallel + judge, plus rate card | Only budgeted provider/judge adapters | Yes | Local development and authorized research | No |
| `fixture` | None | Zero network; fixture adapters only | Yes | Local/CI E2E on isolated test DB | No |
| `replay` | None | Zero network; recorded artifacts only | No application mutations | Public read-only demo, local replay | Yes, exclusively |

`BASISGUARD_MODE` must be exactly one of these. `HOSTED=true` requires `replay`. `live` refuses to start without `PARALLEL_API_KEY`, `OPENAI_API_KEY` and a schema-valid rate card. In Phase 1 only `fixture` is exercised end to end.

## Gate A probe (human-only, paid)

`pnpm gate-a:probe` makes one real, paid Parallel call. It is intended to be run only by the project owner, deliberately, with their own key. CI and scripts never run it.

## Limitations (honest status: Phase 1)

- Only the `baseline` policy exists (original provider output, unverified). `verify` and `verify_and_repair` return 422 `policy_unavailable`; there is no verifier yet.
- All fixture data is synthetic (`example.com`, labelled `fixture_origin`); it is not real Parallel output. The paid probe has not been run.
- A worker crash after the provider create returns but before `provider_run_id` is stored leaves that create unledgered; the run fails closed as `submission_unknown` and a Task is never re-created.
- Network deny (`tests/setup/network-deny.mjs`) is a socket-level `connect` patch with a hostname-string allow-list: only `127.0.0.1`, `::1`, `::ffff:127.0.0.1` and `localhost` are allowed, so other `127.0.0.0/8` addresses are blocked (it fails closed). DNS lookups and `dgram`/UDP are not blocked. A runtime canary in the E2E suite asserts that the hook is loaded in the Next server and in spawned workers.
- No authentication, Redis, webhooks/SSE or retry endpoint; no `cancelled` run status.
