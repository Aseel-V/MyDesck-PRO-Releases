# Travel Currency Baseline

| Check | Result |
| --- | --- |
| Worktree | Existing staged Travel/design work and one unstaged report update were present. |
| `npm run build` | Passed; existing Rollup circular-dependency and chunk-size warnings. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Existing 37 errors and 3 warnings. |

Current map: trips hold raw monetary values plus `currency` and optional original-currency fields; mixed currencies are possible. `CurrencyContext` fetched USD-based Frankfurter rates, cached them in local storage for 24 hours, and fell back to stale cache offline. New trips, the trip schema, and the Travel display fallback used USD.
