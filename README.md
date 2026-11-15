# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mjima8354-sys/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mjima8354-sys/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama tracks, keeps the protocols that still record no token (and are not a wrapped or staked product of one that trades), and ranks them by what their token launch would be worth.

## The model

`lib/model.ts` calibrates a market-cap/TVL multiple per category from the snapshot's own live-token protocols (the comparables), then scores every pre-token protocol:

```
implied = TVL × category_mult × growth_mult × maturity_mult × chain_mult
```

- **category_mult** — the median mcap/TVL of that category's live protocols (blended toward the global median when a category is thin), clamped to [0.15, 6].
- **growth_mult** — `1 + 0.4 × clamp(change_7d, -60, +150)/100`.
- **maturity_mult** — `0.75 + 0.5 × min(age_days, 1460)/1460`: longer with no token, scarcer the launch.
- **chain_mult** — chain count and tier weights derived from the snapshot's `chains` array.

Live-token protocols are set aside as the comps set and never ranked. Each row carries its factor breakdown, a plain-English "why", an airdrop-readiness score and a concrete, costed farm plan.

The board holds 183 rows: all 40 watchlist protocols plus 143 early pre-token finds below the watchlist floor.

## The dashboard

A dependency-free dark mission-control page in `dashboard/` (vanilla JS, no network): sortable board, search, category/chain/watchlist filters, a detail drawer per protocol with the full value-model breakdown and its farm plan, a market-comps view and a methodology page.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output directory. Node 22.18+, standard library only; two runs produce identical bytes.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
