# Task 2 Report: Task Profiles and Automatic Classification

## Status

DONE

## Files

- `prompt-trainer-core.js`: added immutable profile dictionaries, weighted evidence classification, confidence thresholding, universal fallback, and manual profile selection.
- `tests/prompt-trainer-core.test.js`: added coverage for the public profiles contract, audit/construction classification, insufficient evidence, and manual override.

## TDD Evidence

### RED

Command:

```sh
node --test --test-name-pattern="exposes|classifies|universal profile|manual profile" tests/prompt-trainer-core.test.js
```

Result: 4 failing tests. The failures were caused by missing `PROFILES`, `classify`, `classification`, and `profile` APIs.

### GREEN

Focused command required by Task 2:

```sh
node --test --test-name-pattern="classifies|manual profile" tests/prompt-trainer-core.test.js
```

Result: 2 passed, 0 failed.

Core suite:

```sh
node --test tests/prompt-trainer-core.test.js
```

Result: 7 passed, 0 failed.

Full suite:

```sh
node --test tests/*.test.js
```

Result: 32 passed, 0 failed.

## Self-Review

- Confirmed all ten required profile ids are exposed with `name`, `signals`, `requiredDimensions`, and `weights`; the profile definitions are deeply frozen.
- Confirmed classification sums each matched signal only once, requires at least two independent signals for a specialized profile, caps confidence at `1`, and uses `universal` below `0.34` confidence.
- Confirmed matched phrases remain in `evidence`, including a low-confidence universal result.
- Confirmed `options.profile` selects the effective `profile` unless it is `auto`, while `classification` preserves the automatic result and records an override.
- Confirmed the diff is limited to the Task 2 core and tests, and `git diff --check` passed.

No findings requiring changes.

## Commit

- `51429f0 feat: classify prompt work profiles`
