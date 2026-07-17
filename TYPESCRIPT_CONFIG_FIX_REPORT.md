# TypeScript configuration fix report

## Root cause

The installed compiler is TypeScript 5.9.3. Its implementation accepts only `"5.0"` as an `ignoreDeprecations` value when the option is supplied. The existing `"6.0"` value targets a future compiler version and produced TS5103.

## Change

- File: `tsconfig.app.json`
- Previous value: `"ignoreDeprecations": "6.0"`
- Correction: removed the configuration line.

No configuration in this project extends another TypeScript configuration, and no other file uses `ignoreDeprecations`. Removing an unnecessary invalid option is valid under TypeScript 5.9.3 and avoids suppressing deprecations that are not present.

## Results

| Command | Before | After |
| --- | --- | --- |
| `npm run build` | Failed (exit 2), TS5103 | Passed (exit 0) |
| `npm run typecheck` | Failed (exit 2), TS5103 | Passed (exit 0) |
| `git diff --check` | N/A | Passed (exit 0) |

No TypeScript errors were exposed. The successful build reports pre-existing Rollup circular-chunk and chunk-size warnings only.

## Rollback

Restore the single removed `ignoreDeprecations` line in `tsconfig.app.json` (not recommended while TypeScript remains 5.9.3).
