# Travel Phase 1 baseline

Captured before the Trips redesign batch. The worktree already contained the prior safe-theme/toaster changes and planning documents.

| Command | Exit result | Existing errors / warnings |
| --- | --- | --- |
| `git status --short` | 0 | Five existing source modifications and planning/report documents were present. |
| `git diff --stat` | 0 | Existing tracked diff: 5 files, 15 insertions, 19 deletions. |
| `npm run build` | 2 | `TS5103`: `ignoreDeprecations: "6.0"` is invalid at `tsconfig.app.json:24`. |
| `npm run typecheck` | 2 | Same existing `TS5103`. |
| `npm run lint` | 1 | 37 errors and 3 warnings in unrelated existing files; no Trips-file error was reported. |
