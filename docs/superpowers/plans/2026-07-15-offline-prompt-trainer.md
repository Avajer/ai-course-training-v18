# Offline Prompt Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current keyword-based prompt sandbox with a professional, explainable, fully offline analyzer that classifies work tasks, scores prompt quality and safety, generates contextual feedback, improves the original prompt, compares revisions, and stores per-user history.

**Architecture:** Add a DOM-independent UMD module, `prompt-trainer-core.js`, loaded before `features.js`. The core owns normalization, task classification, weighted scoring, risk detection, feedback composition, prompt improvement, and comparison; `features.js` owns rendering and per-user storage. Tests load the core in a Node VM and use a fixed Russian fixture bank so scoring behavior is deterministic and regression-safe.

**Tech Stack:** Vanilla JavaScript ES2020-compatible syntax, HTML/CSS, Node built-in test runner, Node `vm`, browser `localStorage`, existing GitHub Pages/PWA structure. No API, external model, package, build step, or network request.

## Global Constraints

- Analysis must run entirely in the browser and must not call `fetch`, `XMLHttpRequest`, WebSocket, Apps Script, or third-party services.
- Keep all interface copy in professional Russian suitable for adult workers without technical training.
- Preserve source facts and terminology when generating an improved prompt; unknown content must remain an explicit `[поле для заполнения]`.
- Score prompt quality and safety separately; prompt length and element labels alone must never produce a high score.
- Automatic task classification must support a manual override.
- History must be isolated by the authenticated participant's `passwordHash` using the existing `uKey()` convention.
- Keep the current course usable if the trainer fails to initialize.
- Raise all static asset and service-worker versions from `v70` to `v71` only after implementation passes all tests.

---

## File Structure

- Create `prompt-trainer-core.js`: pure analysis engine exposed as `window.PromptTrainer` and `module.exports`-compatible VM global.
- Create `tests/prompt-trainer-core.test.js`: unit and regression tests for normalization, classification, scoring, risks, feedback, improvement, and comparison.
- Create `tests/fixtures/prompt-trainer-cases.js`: at least 60 fixed Russian prompts with expected profile, score range, and risks.
- Modify `features.js`: replace old analyzer functions with calls to `window.PromptTrainer`; add controls, results, comparison, and history.
- Modify `features.css`: trainer layout, dimension chart, risk panels, fragment highlights, history, compact mode, responsive states.
- Modify `index.html`: load core before `features.js` and raise asset version.
- Modify `sw.js`: cache the new core and raise cache version.
- Modify `README.md`: document offline behavior, limitations, and v71.
- Modify `tests/experience-core.test.js`: assert script ordering and version synchronization.

---

### Task 1: Core Module Contract and Text Normalization

**Files:**
- Create: `prompt-trainer-core.js`
- Create: `tests/prompt-trainer-core.test.js`

**Interfaces:**
- Produces: `PromptTrainer.normalize(text) -> { original, normalized, tokens, sentences, sections, wordCount, charCount }`
- Produces: `PromptTrainer.analyze(text, options) -> Analysis`
- `options`: `{ profile?: string, errorCost?: "low"|"medium"|"high", dataType?: "public"|"internal"|"personal"|"sensitive" }`

- [ ] **Step 1: Write the failing module contract test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadTrainer() {
  const source = fs.readFileSync(new URL("../prompt-trainer-core.js", import.meta.url), "utf8");
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(source, sandbox);
  return sandbox.window.PromptTrainer;
}

test("normalizes Russian prompt without losing the original", () => {
  const trainer = loadTrainer();
  const result = trainer.normalize("  Проверь документ.\nУкажи риски!  ");
  assert.equal(result.original, "Проверь документ.\nУкажи риски!");
  assert.equal(result.wordCount, 5);
  assert.deepEqual(Array.from(result.sentences), ["Проверь документ.", "Укажи риски!"]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/prompt-trainer-core.test.js`  
Expected: FAIL because `prompt-trainer-core.js` does not exist.

- [ ] **Step 3: Implement the UMD shell and normalizer**

```js
(function (root, factory) {
  "use strict";
  root.PromptTrainer = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function normalize(text) {
    var original = String(text || "").trim().replace(/\r\n?/g, "\n");
    var normalized = original.toLowerCase().replace(/[\t ]+/g, " ");
    var tokens = normalized.match(/[a-zа-яё0-9%№_-]+/gi) || [];
    var sentences = original.match(/[^.!?\n]+[.!?]?/g) || [];
    sentences = sentences.map(function (item) { return item.trim(); }).filter(Boolean);
    var sections = original.split(/\n+/).map(function (item) { return item.trim(); }).filter(Boolean);
    return { original: original, normalized: normalized, tokens: tokens, sentences: sentences,
      sections: sections, wordCount: tokens.length, charCount: original.length };
  }

  function analyze(text, options) {
    return { text: normalize(text), options: options || {} };
  }

  return { normalize: normalize, analyze: analyze };
});
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test tests/prompt-trainer-core.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit the core contract**

```bash
git add prompt-trainer-core.js tests/prompt-trainer-core.test.js
git commit -m "feat: add offline prompt trainer core"
```

---

### Task 2: Task Profiles and Automatic Classification

**Files:**
- Modify: `prompt-trainer-core.js`
- Modify: `tests/prompt-trainer-core.test.js`

**Interfaces:**
- Produces: `PromptTrainer.PROFILES` with ids `document`, `letter`, `data`, `audit`, `construction`, `planning`, `comparison`, `extraction`, `report`, `universal`.
- Produces: `PromptTrainer.classify(normalizedText) -> { primary, secondary, confidence, evidence }`.
- `analyze()` returns `classification` and `profile`; `options.profile` overrides `classification.primary` unless set to `auto`.

- [ ] **Step 1: Add failing classification tests**

```js
test("classifies audit and construction tasks", () => {
  const trainer = loadTrainer();
  const audit = trainer.analyze("Проверь выборку операций, найди нарушения и укажи аудиторские доказательства.");
  const construction = trainer.analyze("Сопоставь акт КС-2 со сметой и журналом строительных работ.");
  assert.equal(audit.classification.primary, "audit");
  assert.equal(construction.classification.primary, "construction");
});

test("manual profile overrides automatic classification", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Подготовь отчет по проверке", { profile: "report" });
  assert.equal(result.profile, "report");
  assert.equal(result.classification.overridden, true);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test --test-name-pattern="classifies|manual profile" tests/prompt-trainer-core.test.js`  
Expected: FAIL because classification is absent.

- [ ] **Step 3: Implement weighted profile dictionaries**

Create immutable profile definitions containing `name`, `signals`, `requiredDimensions`, and `weights`. Classification must sum phrase weights, require at least two independent pieces of evidence for a specialized profile, normalize confidence to `0..1`, and fall back to `universal` below `0.34` confidence. Preserve matched phrases in `evidence` for explanation.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/prompt-trainer-core.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit classification**

```bash
git add prompt-trainer-core.js tests/prompt-trainer-core.test.js
git commit -m "feat: classify prompt work profiles"
```

---

### Task 3: Explainable Quality, Safety, and Contradiction Scoring

**Files:**
- Modify: `prompt-trainer-core.js`
- Modify: `tests/prompt-trainer-core.test.js`

**Interfaces:**
- `analyze()` returns `qualityScore`, `safetyScore`, `level`, `dimensions`, `strengths`, `issues`, `risks`, and `contradictions`.
- Each dimension is `{ id, name, score, max, status, evidence, recommendation }`.
- Each issue/risk is `{ id, severity: "info"|"warning"|"critical", title, detail, recommendation, ranges }`.

- [ ] **Step 1: Write failing anti-gaming and risk tests**

```js
test("element labels without content do not create a strong prompt", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Роль: роль. Контекст: контекст. Задача: задача. Формат: формат. Ограничения: ограничения.");
  assert.ok(result.qualityScore < 40);
  assert.ok(result.issues.some((issue) => issue.id === "empty-shell"));
});

test("high-cost audit prompt requires evidence and human verification", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("По данным ниже вынеси окончательное решение о нарушении.", {
    profile: "audit", errorCost: "high", dataType: "internal"
  });
  assert.ok(result.safetyScore < 60);
  assert.ok(result.risks.some((risk) => risk.id === "final-decision-without-human"));
  assert.ok(result.issues.some((issue) => issue.id === "missing-verification"));
});

test("contradictory requirements reduce clarity", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Дай максимально подробный отчет, но ответ должен состоять из одного предложения.");
  assert.ok(result.contradictions.length > 0);
  assert.ok(result.dimensions.find((item) => item.id === "clarity").score < 70);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test --test-name-pattern="element labels|high-cost|contradictory" tests/prompt-trainer-core.test.js`  
Expected: FAIL because dimension scoring is absent.

- [ ] **Step 3: Implement evidence-based scoring**

Implement detectors for action, purpose/audience, supplied-or-placeholder data, output structure, criteria/limits, verification/uncertainty, privacy, next step, and clarity. Require multiple signals for high dimension scores. Apply profile weights, cap quality when essential dimensions are absent, and apply explicit penalties for contradictions, impossible precision, fabricated sources, high-stakes final decisions, sensitive identifiers, task overload, and unresolved references.

- [ ] **Step 4: Run all core tests and verify GREEN**

Run: `node --test tests/prompt-trainer-core.test.js`  
Expected: PASS with deterministic scores.

- [ ] **Step 5: Commit scoring**

```bash
git add prompt-trainer-core.js tests/prompt-trainer-core.test.js
git commit -m "feat: score prompt quality and safety"
```

---

### Task 4: Contextual Feedback, Improvement, and Before/After Comparison

**Files:**
- Modify: `prompt-trainer-core.js`
- Modify: `tests/prompt-trainer-core.test.js`

**Interfaces:**
- Produces: `PromptTrainer.improve(text, analysis, options) -> { concise, full, insertedFields, preservedFacts }`.
- Produces: `PromptTrainer.compare(before, after) -> { qualityDelta, safetyDelta, dimensionDeltas, improved, regressed }`.
- `analyze()` adds `commentary: { summary, strengthsText, priorityText, nextStepText }`.

- [ ] **Step 1: Write failing personalized feedback tests**

```js
test("feedback names the detected task and its highest-priority gap", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Сравни два коммерческих предложения и выбери вариант.", { errorCost: "medium" });
  assert.match(result.commentary.summary, /сравнен/i);
  assert.match(result.commentary.priorityText, /критери/i);
});

test("improvement preserves facts and marks unknown data", () => {
  const trainer = loadTrainer();
  const source = "Проверь акт КС-2 за июнь 2026 года и найди расхождения.";
  const analysis = trainer.analyze(source, { profile: "construction" });
  const improved = trainer.improve(source, analysis);
  assert.match(improved.full, /КС-2/);
  assert.match(improved.full, /июнь 2026/);
  assert.match(improved.full, /\[[^\]]+\]/);
  assert.doesNotMatch(improved.full, /точно установлено|нарушение подтверждено/i);
});

test("comparison reports meaningful improvement", () => {
  const trainer = loadTrainer();
  const before = trainer.analyze("Проверь отчет.");
  const after = trainer.analyze("Проверь отчет за июнь по приложенному тексту. Верни таблицу: фрагмент, ошибка, основание, рекомендация. Не придумывай отсутствующие факты.");
  const comparison = trainer.compare(before, after);
  assert.ok(comparison.qualityDelta > 20);
  assert.ok(comparison.improved.length >= 2);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test --test-name-pattern="feedback|improvement|comparison" tests/prompt-trainer-core.test.js`  
Expected: FAIL because feedback/improvement APIs are absent.

- [ ] **Step 3: Implement a deterministic feedback composer and source-preserving rewriter**

Build comments from profile name, strongest two dimensions, highest-severity issue, and next actionable change. Generate concise and full improved prompts by retaining the source in a dedicated `Исходная задача` section, extracting existing facts into unchanged lines, and adding only profile-specific missing fields. Never invent names, amounts, dates, sources, or findings.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/prompt-trainer-core.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit feedback and rewriting**

```bash
git add prompt-trainer-core.js tests/prompt-trainer-core.test.js
git commit -m "feat: add contextual prompt feedback"
```

---

### Task 5: Sixty-Case Professional Regression Bank

**Files:**
- Create: `tests/fixtures/prompt-trainer-cases.js`
- Modify: `tests/prompt-trainer-core.test.js`

**Interfaces:**
- Fixture shape: `{ id, profile, text, options, minQuality, maxQuality, minSafety, maxSafety, requiredIssues, forbiddenIssues }`.

- [ ] **Step 1: Add a failing fixture harness with representative cases**

```js
import cases from "./fixtures/prompt-trainer-cases.js";

test("professional fixture bank stays inside expected ranges", () => {
  const trainer = loadTrainer();
  assert.ok(cases.length >= 60);
  cases.forEach((fixture) => {
    const result = trainer.analyze(fixture.text, fixture.options);
    assert.equal(result.profile, fixture.profile, fixture.id + ": profile");
    assert.ok(result.qualityScore >= fixture.minQuality && result.qualityScore <= fixture.maxQuality, fixture.id + ": quality");
    assert.ok(result.safetyScore >= fixture.minSafety && result.safetyScore <= fixture.maxSafety, fixture.id + ": safety");
    fixture.requiredIssues.forEach((id) => assert.ok(result.issues.concat(result.risks).some((item) => item.id === id), fixture.id + ": " + id));
  });
});
```

- [ ] **Step 2: Run the fixture test and verify RED**

Run: `node --test --test-name-pattern="fixture bank" tests/prompt-trainer-core.test.js`  
Expected: FAIL until all 60 cases and calibrated rules exist.

- [ ] **Step 3: Add and calibrate 60 fixtures**

Create at least six cases for each profile, including strong, weak, short, overloaded, empty-shell, high-risk, and before/after examples. Include at least twelve audit/control cases and eight construction-control cases. Adjust general rules rather than adding one-off checks keyed to complete fixture sentences.

- [ ] **Step 4: Run the full bank and verify GREEN**

Run: `node --test tests/prompt-trainer-core.test.js`  
Expected: all fixture cases PASS.

- [ ] **Step 5: Commit the regression bank**

```bash
git add tests/fixtures/prompt-trainer-cases.js tests/prompt-trainer-core.test.js prompt-trainer-core.js
git commit -m "test: add professional prompt fixture bank"
```

---

### Task 6: Trainer Interface, Manual Controls, and Comparison Flow

**Files:**
- Modify: `features.js` trainer section around current `analyzePrompt`, `renderTrainerResult`, and `openSandbox`.
- Modify: `index.html` script list.
- Test: `tests/prompt-trainer-ui.test.js`

**Interfaces:**
- Consumes: `window.PromptTrainer.analyze`, `.improve`, `.compare`, `.PROFILES`.
- Produces DOM ids: `sbInput`, `sbProfile`, `sbErrorCost`, `sbDataType`, `sbMode`, `sbCheck`, `sbResult`, `sbHistory`.

- [ ] **Step 1: Write failing static integration tests**

```js
test("loads trainer core before feature UI", () => {
  const page = read("index.html");
  assert.match(page, /prompt-trainer-core\.js[^]*features\.js/);
});

test("trainer offers profile, risk, data and display controls", () => {
  const features = read("features.js");
  ["sbProfile", "sbErrorCost", "sbDataType", "sbMode", "data-trainer-recheck", "data-trainer-replace"].forEach((id) => assert.match(features, new RegExp(id)));
  assert.match(features, /Анализ выполняется на этом устройстве/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/prompt-trainer-ui.test.js`  
Expected: FAIL because the core script and controls are absent.

- [ ] **Step 3: Replace the old UI analyzer**

Delete `PROMPT_ELEMENTS`, `analyzePrompt`, `trainerVerdict`, `promptPriority`, and `buildImprovedPrompt` from `features.js`. Render task selector with `auto` plus all profiles, error-cost segmented control/select, data-type selector, educational/compact mode, quality and safety scores, dimension chart, commentary, strengths, priority issues, risks, highlighted evidence, concise/full improved variants, and before/after delta. Guard initialization with:

```js
var trainer = window.PromptTrainer;
if (!trainer) {
  result.innerHTML = '<p class="feat-verdict">Тренажер временно недоступен. Остальные разделы курса продолжают работать.</p>';
  return;
}
```

- [ ] **Step 4: Run static and core tests**

Run: `node --test tests/prompt-trainer-ui.test.js tests/prompt-trainer-core.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit interface integration**

```bash
git add index.html features.js tests/prompt-trainer-ui.test.js
git commit -m "feat: integrate advanced prompt trainer UI"
```

---

### Task 7: Per-User History and Privacy Guarantees

**Files:**
- Modify: `features.js`
- Modify: `tests/prompt-trainer-ui.test.js`
- Modify: `tests/security.test.js`

**Interfaces:**
- Adds `LS.trainerHistory = "aiCoursePromptTrainerHistoryV1"`.
- History record: `{ id, createdAt, source, options, profile, qualityScore, safetyScore, commentary, improved }`.
- Maximum: 20 records per authenticated participant.

- [ ] **Step 1: Write failing privacy and storage tests**

```js
test("trainer history is participant-scoped and capped", () => {
  const features = read("features.js");
  assert.match(features, /trainerHistory:\s*"aiCoursePromptTrainerHistoryV1"/);
  assert.match(features, /lsGet\(uKey\(LS\.trainerHistory\)/);
  assert.match(features, /slice\(0,\s*20\)/);
});

test("offline trainer source contains no network API", () => {
  const core = read("prompt-trainer-core.js");
  assert.doesNotMatch(core, /fetch\s*\(|XMLHttpRequest|WebSocket|RESULTS_ENDPOINT|script\.google\.com/i);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/prompt-trainer-ui.test.js tests/security.test.js`  
Expected: FAIL because history is absent.

- [ ] **Step 3: Implement local history**

Save only after an explicit check, cap to 20, render date/profile/scores and the first 100 characters, and provide restore/delete/clear actions. Do not include history in course result payloads, exports, Apps Script requests, or Google Sheets.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/prompt-trainer-ui.test.js tests/security.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit privacy-safe history**

```bash
git add features.js tests/prompt-trainer-ui.test.js tests/security.test.js
git commit -m "feat: add private prompt trainer history"
```

---

### Task 8: Professional Styling, Responsive Layout, and Accessibility

**Files:**
- Modify: `features.css`
- Modify: `features.js`
- Modify: `tests/prompt-trainer-ui.test.js`

**Interfaces:**
- CSS components: `.trainer-controls`, `.trainer-score-grid`, `.trainer-dimensions`, `.trainer-dimension`, `.trainer-commentary`, `.trainer-risks`, `.trainer-highlight`, `.trainer-compare`, `.trainer-history`.

- [ ] **Step 1: Add failing layout-contract tests**

```js
test("trainer has stable responsive and reduced-motion styles", () => {
  const css = read("features.css");
  assert.match(css, /\.trainer-controls\s*\{/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[^]*\.trainer-controls/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[^]*\.trainer-/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test --test-name-pattern="stable responsive" tests/prompt-trainer-ui.test.js`  
Expected: FAIL because new styles are absent.

- [ ] **Step 3: Implement the visual system**

Use existing colors, radii, and typography. Keep score cards compact, use horizontal bars instead of radar charts on mobile, reserve red for critical risk, and ensure all controls have labels. Add `aria-live="polite"` to the result, `aria-expanded` to history controls, keyboard-operable tabs for concise/full versions, and no animation that ignores reduced-motion preferences.

- [ ] **Step 4: Run static tests and browser smoke test**

Run: `node --test tests/prompt-trainer-ui.test.js`  
Expected: PASS. Then open the local course at desktop and 390px mobile width, verify no overflow, open the trainer, analyze one weak and one strong prompt, replace with the improved version, recheck, and inspect console errors.

- [ ] **Step 5: Commit styling**

```bash
git add features.css features.js tests/prompt-trainer-ui.test.js
git commit -m "style: polish offline prompt trainer"
```

---

### Task 9: PWA Integration, Documentation, Full Verification, and Release

**Files:**
- Modify: `index.html`
- Modify: `sw.js`
- Modify: `features.js`
- Modify: `README.md`
- Modify: `tests/experience-core.test.js`

**Interfaces:**
- Release version: `v71` everywhere.
- Service-worker core list includes `./prompt-trainer-core.js?v=71`.

- [ ] **Step 1: Extend the version synchronization test and verify RED**

```js
assert.match(page, /prompt-trainer-core\.js\?v=71/);
assert.match(page, /features\.js\?v=71/);
assert.match(features, /COURSE_VERSION\s*=\s*"v71"/);
assert.match(sw, /CACHE\s*=\s*"ai-course-v71"/);
assert.match(sw, /prompt-trainer-core\.js\?v=71/);
```

Run: `node --test tests/experience-core.test.js`  
Expected: FAIL while files still use v70.

- [ ] **Step 2: Raise the build and cache version**

Update every versioned stylesheet/script in `index.html`, the service-worker reload key, `features.js`, `script.js`, and all `sw.js` core URLs to v71. Add the trainer core to the offline cache. Document the trainer's offline nature, supported profiles, privacy, limitations, and history behavior in `README.md`.

- [ ] **Step 3: Run complete automated verification**

Run:

```bash
node --check prompt-trainer-core.js
node --check features.js
node --check script.js
node --check sw.js
node --test tests/*.test.js
git diff --check
```

Expected: all checks pass; at least 60 trainer fixtures and all existing course tests are green.

- [ ] **Step 4: Run final browser verification**

Verify desktop and mobile: automatic classification, manual override, quality/safety split, contextual commentary, risks, concise/full improvement, replace and recheck, comparison delta, history restore/delete/clear, user isolation after account change, offline reload, reduced motion, and zero console errors.

- [ ] **Step 5: Commit and publish**

```bash
git add prompt-trainer-core.js features.js features.css index.html sw.js script.js README.md tests
git commit -m "feat: release professional offline prompt trainer"
git push origin main
```

Expected: GitHub Pages deployment succeeds and `https://avajer.github.io/ai-course-training-v18/?reload=71` serves v71 assets.
