# token-launch-radar-v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dccot/token-launch-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dccot/token-launch-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar v2 ranks pre-token protocols in the sealed DefiLlama snapshot with a model that is fitted, not hand-set (radar-3): per-category mcap/TVL terms and a log-log size curve are learned from the snapshot's own already-tokenised protocols, then kept only where they survive two held-out tests — leave-one-out over the whole training sample and a chronological split-half — with the validation record (median predicted/actual ratio, within-2x and within-3x rates, against a global-ratio baseline) published in the dashboard's model panel; growth, age and chain-count terms were tested against the training residuals and dropped. Every row carries two values — implied value if a token existed, and expected value after multiplying by token odds estimated from cohort launch rates (category, age and TVL strata) — and a farm plan that is costed and netted (expected gross minus gas and capital opportunity cost, $/hour and break-even capture) with an explicit farm / thin / skip verdict. All 758 protocols in the snapshot are accounted for in a published ledger (already tokenised, ranked, rankable beyond the cap, excluded as derivative or versioned), and the static offline dashboard recomputes its own board in-page and shows the integrity checks passing. It covers the whole 40-protocol watchlist plus 134 early protocols found below the $50M floor by the same rule, for 174 ranked rows.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Then open `out/dashboard/index.html` in a browser (it reads `out/data.js`; no server and no network needed). In the grader's container the snapshot is mounted at `/input/snapshot.json` and output goes to `/output` by default.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fxn8rvgw&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
