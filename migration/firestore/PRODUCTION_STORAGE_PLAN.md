# Production Storage migration plan

Default tooling mode is `manifest-only`. `rehearsal-copy`, `production-copy`, and `final-delta` are explicit modes; production modes require the production acknowledgement and GO manifest.

## Manifest schema

Each entry stores source bucket/path, deterministic target path, business/tenant, related trip/entity, MIME type, byte size, privacy class, source SHA-256, target SHA-256, state, attempt count, last error category, and `migrationRunId`. It stores no object bytes. The complete source object listing, rather than database references alone, defines coverage.

## Bulk and delta algorithm

1. List every source bucket/object and stream each source object through SHA-256 into the manifest.
2. Compare metadata references with objects and baseline pre-existing orphans separately.
3. Stream objects to the approved Firebase bucket with bounded concurrency, conditional create semantics, backoff, and checkpoints.
4. Read target bytes and verify SHA-256 before marking `VERIFIED`.
5. Re-list source and target after bulk copy. New paths, missing paths, changed size/hash, and unexpected target paths remain failures.
6. During freeze, create a fresh complete manifest and apply only new/changed objects by path plus SHA-256.
7. Require missing = 0, unexpected = 0, SHA mismatch = 0, and migration-created orphan = 0.

The current source rehearsal baseline is 3 objects and 438,670 bytes with zero checksum mismatches and one pre-existing source orphan. The real project currently has no Storage bucket, so production copy is **NOT STARTED** and capability is blocked until billing and an approved private bucket exist.

## Privacy release gates

- signature anonymous: denied
- signature wrong tenant: denied
- signature correct tenant: allowed
- trip attachment wrong tenant: denied
- trip attachment authorized tenant: allowed
- business logo: public only through an explicitly approved public path
- signature public URL: forbidden

The candidate Storage Rules and these tests must pass against the real bucket before any byte copy.
