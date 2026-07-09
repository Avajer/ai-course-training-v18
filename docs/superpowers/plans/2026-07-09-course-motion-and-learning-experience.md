# Course Motion and Learning Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AI course a memorable but professional animated learning experience, personalized collapsible navigation, and practical learning support without changing the existing authentication or Google Sheets result contract.

**Architecture:** Keep domain content and result submission in `script.js`. Add `experience-core.js` for deterministic UI-state and recommendation rules that can run in Node tests, and `experience.js` for DOM rendering and event wiring. Add `experience.css` for the new components and motion; `styles.css` retains the existing course design. Persist UI preferences inside the existing per-participant progress object under `experience`, so two participants on one computer never share collapsed panels or personal prompt selections.

**Tech Stack:** Static HTML, vanilla JavaScript, CSS/SVG, Node built-in test runner, GitHub Pages, existing localStorage and Google Apps Script integration.

## Global Constraints

- Do not change `RESULTS_ENDPOINT`, registration, access-code validation, or the payload fields sent to Google Apps Script.
- Keep all course functions usable without network access except the existing result transmission.
- Use Russian interface copy; use an English term only where it is a product or technical name.
- New motion must honor `prefers-reduced-motion: reduce`; no external animation libraries.
- Main-screen and key learning diagrams must create a visible first-impression effect; routine lesson motion remains short and low-intensity.
- Every disclosure and menu control uses a native `button`, visible label, `aria-expanded`, and keyboard support.
- New storage belongs to the authenticated participant’s `aiCourseProgressV26::<passwordHash>` object, not to a browser-global key.
- Bump asset and service-worker cache version from `v55` to `v56` only after the implementation is complete.

---

## File Structure

- Create: `experience-core.js` — pure data rules for UI preferences, next learning action, task classification, error insights, and personal prompt collection.
- Create: `experience.js` — DOM rendering of the cycle diagram, collapsible layout, disclosures, progress feedback, and practical tools.
- Create: `experience.css` — visual treatment, responsive layouts, keyframes, and reduced-motion fallbacks.
- Create: `tests/experience-core.test.js` — Node tests for all non-DOM rules.
- Modify: `index.html` — hero visualization host, top progress host, and ordered asset loading.
- Modify: `script.js` — extend personal progress state, expose narrow integration hooks, render lesson disclosure hosts, and keep existing navigation/results behavior.
- Modify: `styles.css` — reserve layout for the new hosts and mobile/print behavior where it belongs to the existing shell.
- Modify: `sw.js`, `README.md` — cache the new files and document the versioned enhancement.

---

### Task 1: Create tested core rules for the experience layer

**Files:**
- Create: `experience-core.js`
- Create: `tests/experience-core.test.js`

**Interfaces:**
- Produces `window.CourseExperienceCore` in a browser and `module.exports` in Node.
- Produces `blankExperience()`, `normalizeExperience(value)`, `toggleExperiencePanel(experience, panel)`, `findNextAction(modules, progress)`, `classifyTask(input)`, `buildErrorInsights(finalQuestions, finalAnswers)`, `toggleSavedPrompt(experience, promptId)`.
- Consumes `modules` and existing progress fields only as plain objects; no DOM and no `localStorage` access.

- [ ] **Step 1: Write the failing test**

```js
// tests/experience-core.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../experience-core.js");

test("normalizes a missing experience state without sharing preferences", () => {
  assert.deepEqual(core.normalizeExperience(), {
    panels: { objectives: true, progress: true, modules: true, actions: false },
    roadmapCollapsed: true,
    lessonSections: {},
    savedPrompts: [],
    promptNotes: {}
  });
});

test("classifies sensitive, high-cost external work as restricted", () => {
  assert.equal(core.classifyTask({ data: "sensitive", cost: "high", goal: "external" }).level, "restricted");
});

test("selects the first unfinished module as the next action", () => {
  const modules = [{ id: "intro", title: "Введение" }, { id: "prompt", title: "Промпт" }];
  assert.equal(core.findNextAction(modules, { modules: { intro: { submitted: true } } }).moduleId, "prompt");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/experience-core.test.js`

Expected: FAIL with `Cannot find module '../experience-core.js'`.

- [ ] **Step 3: Implement the minimal pure module**

```js
// experience-core.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CourseExperienceCore = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const PANEL_DEFAULTS = { objectives: true, progress: true, modules: true, actions: false };

  function blankExperience() {
    return { panels: { ...PANEL_DEFAULTS }, roadmapCollapsed: true, lessonSections: {}, savedPrompts: [], promptNotes: {} };
  }

  function normalizeExperience(value) {
    const next = value && typeof value === "object" ? value : {};
    return {
      ...blankExperience(),
      ...next,
      panels: { ...PANEL_DEFAULTS, ...(next.panels || {}) },
      lessonSections: { ...(next.lessonSections || {}) },
      savedPrompts: Array.isArray(next.savedPrompts) ? next.savedPrompts : [],
      promptNotes: { ...(next.promptNotes || {}) }
    };
  }

  function toggleExperiencePanel(experience, panel) {
    const next = normalizeExperience(experience);
    next.panels[panel] = !next.panels[panel];
    return next;
  }

  function findNextAction(modules, progress) {
    const next = modules.find((module) => !progress?.modules?.[module.id]?.submitted);
    return next ? { moduleId: next.id, title: next.title, complete: false } : { moduleId: null, title: "Курс завершён", complete: true };
  }

  function classifyTask(input) {
    const highRisk = input.data === "sensitive" && input.cost === "high";
    if (highRisk || input.goal === "external" && input.data === "sensitive") return { level: "restricted", title: "Нужен разрешённый контур" };
    if (input.data === "internal" || input.cost === "high") return { level: "guarded", title: "Можно с ограничениями" };
    return { level: "allowed", title: "Можно использовать для черновика" };
  }

  function buildErrorInsights() { return []; }
  function toggleSavedPrompt(experience, promptId) {
    const next = normalizeExperience(experience);
    next.savedPrompts = next.savedPrompts.includes(promptId)
      ? next.savedPrompts.filter((id) => id !== promptId)
      : [...next.savedPrompts, promptId];
    return next;
  }

  return { blankExperience, normalizeExperience, toggleExperiencePanel, findNextAction, classifyTask, buildErrorInsights, toggleSavedPrompt };
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/experience-core.test.js`

Expected: three passing subtests.

- [ ] **Step 5: Commit the tested core**

```bash
git add experience-core.js tests/experience-core.test.js
git commit -m "feat: add course experience state core"
```

### Task 2: Persist experience preferences per authenticated participant

**Files:**
- Modify: `script.js:1-90, 3330-3430`
- Test: `tests/experience-core.test.js`

**Interfaces:**
- Consumes `CourseExperienceCore.normalizeExperience`.
- Extends `PROGRESS_FIELDS` with `experience` and extends `blankProgress()` with `experience: CourseExperienceCore.blankExperience()`.
- Produces `getExperienceState()`, `updateExperience(nextExperience)`, and `window.courseExperienceHost` with narrow callbacks for rendering course views.

- [ ] **Step 1: Add a failing migration assertion**

```js
test("keeps existing progress usable when experience preferences are absent", () => {
  assert.equal(core.normalizeExperience({ savedPrompts: ["summary"] }).panels.modules, true);
  assert.deepEqual(core.normalizeExperience({ savedPrompts: ["summary"] }).savedPrompts, ["summary"]);
});
```

- [ ] **Step 2: Run the test to verify it fails before the normalization merge is added**

Run: `node --test tests/experience-core.test.js`

Expected: FAIL if `normalizeExperience` drops default panel values.

- [ ] **Step 3: Integrate the property without changing the Google Sheets payload**

```js
const PROGRESS_FIELDS = [
  "modules", "moduleSync", "finalAnswers", "finalAttempt", "practice",
  "openAnswers", "checks", "finalSubmitted", "resultStatus", "experience"
];

function blankProgress() {
  return {
    modules: {}, moduleSync: {}, finalAnswers: {}, finalAttempt: null,
    practice: {}, openAnswers: {}, checks: {}, finalSubmitted: false,
    resultStatus: "не отправлено",
    experience: window.CourseExperienceCore.blankExperience()
  };
}

function getExperienceState() {
  state.experience = window.CourseExperienceCore.normalizeExperience(state.experience);
  return state.experience;
}

function updateExperience(next) {
  state.experience = window.CourseExperienceCore.normalizeExperience(next);
  saveState();
}
```

Create the host only after the existing render functions are declared:

```js
window.courseExperienceHost = {
  getState: () => state,
  getExperienceState,
  updateExperience,
  getModules: () => modules,
  renderModule,
  renderRoadmap,
  renderNav,
  renderResultsOverview,
  showToast,
  isAuthenticated
};
```

- [ ] **Step 4: Run static and core checks**

Run: `node --check script.js && node --test tests/experience-core.test.js`

Expected: syntax check succeeds and all core tests pass.

- [ ] **Step 5: Commit persistence integration**

```bash
git add script.js tests/experience-core.test.js
git commit -m "feat: persist course experience by participant"
```

### Task 3: Build the high-impact animated hero cycle

**Files:**
- Modify: `index.html:58-91`
- Create: `experience.js`
- Create: `experience.css`
- Test: `tests/experience-core.test.js`

**Interfaces:**
- Consumes `window.courseExperienceHost` and six semantic route ids.
- Produces `window.CourseExperience.init()` and `renderHeroCycle(host)`.
- Hero links resolve to existing module IDs or named render functions; the map must be declared once:

```js
const CYCLE_STEPS = [
  { id: "task", label: "Задача", detail: "Определите рабочий результат", moduleId: "intro" },
  { id: "context", label: "Контекст", detail: "Укажите адресата и условия", moduleId: "prompt" },
  { id: "request", label: "Запрос", detail: "Соберите сильный промпт", moduleId: "formula" },
  { id: "draft", label: "Черновик", detail: "Получите первый вариант", moduleId: "iterations" },
  { id: "verify", label: "Проверка", detail: "Проверьте факты и риски", moduleId: "verification" },
  { id: "apply", label: "Применение", detail: "Сохраните рабочий шаблон", moduleId: "final-practice" }
];
```

- [ ] **Step 1: Extend the test with route and reduced-motion-safe data assertions**

```js
test("cycle steps always point to known learning destinations", () => {
  const ids = new Set(["intro", "prompt", "formula", "iterations", "verification", "final-practice"]);
  assert.ok(["intro", "prompt", "formula", "iterations", "verification", "final-practice"].every((id) => ids.has(id)));
});
```

- [ ] **Step 2: Run the test before adding the cycle mapping**

Run: `node --test tests/experience-core.test.js`

Expected: FAIL until the tested mapping is exported from `experience-core.js`.

- [ ] **Step 3: Add the host and visual renderer**

Add this host directly after `.hero-stats` in `index.html`:

```html
<section id="heroCycle" class="hero-cycle" aria-label="Рабочий цикл использования ИИ"></section>
```

Render semantic buttons and an inline SVG path in `experience.js`. Each button must call `host.renderModule(index)` after locating `moduleId`; set focus to `#contentView`. Use CSS `animation-delay` variables for the first reveal, a dashed SVG path with a short moving marker, and a static visible fallback when reduced motion is active.

- [ ] **Step 4: Add bounded motion and responsive styles**

```css
.hero-cycle { position: relative; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: .5rem; margin-top: 1.5rem; }
.hero-cycle__step { min-height: 7rem; animation: cycle-step-in 560ms both; animation-delay: calc(var(--index) * 90ms); }
.hero-cycle__path { position: absolute; inset: 1.8rem 0 auto; width: 100%; pointer-events: none; }
@keyframes cycle-step-in { from { opacity: 0; transform: translateY(18px) scale(.96); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .hero-cycle__step { animation: none; } .hero-cycle__marker { animation: none; } }
@media (max-width: 760px) { .hero-cycle { grid-template-columns: repeat(2, 1fr); } .hero-cycle__path { display: none; } }
```

- [ ] **Step 5: Verify hero behavior manually and commit**

Run: `node --check experience-core.js && node --check experience.js && node --test tests/experience-core.test.js`

Manual browser checks: hero opens without layout shift; all six nodes are keyboard reachable; each node opens the intended block; reduced-motion mode has no animated marker.

```bash
git add index.html experience-core.js experience.js experience.css tests/experience-core.test.js
git commit -m "feat: add animated AI work cycle hero"
```

### Task 4: Add personalized collapsible navigation and a compact lesson bar

**Files:**
- Modify: `index.html:29-57, 93-108`
- Modify: `script.js:3560-3650, 4203-4260, 4395-4550`
- Modify: `experience.js`
- Modify: `experience.css`
- Test: `tests/experience-core.test.js`

**Interfaces:**
- Consumes `getExperienceState()` and `updateExperience(next)`.
- Produces `renderSidebarDisclosure(sectionId, title, content)` and `renderContinueCard(host)`.
- Uses panel keys `objectives`, `progress`, `modules`, `actions`, and preserves the existing `roadmapCollapsed` property under `experience`.

- [ ] **Step 1: Write failing state tests**

```js
test("toggles only the requested panel", () => {
  const next = core.toggleExperiencePanel(core.blankExperience(), "modules");
  assert.equal(next.panels.modules, false);
  assert.equal(next.panels.progress, true);
});

test("saved prompt ids do not duplicate", () => {
  const once = core.toggleSavedPrompt(core.blankExperience(), "audit-plan");
  const twice = core.toggleSavedPrompt(once, "audit-plan");
  assert.deepEqual(twice.savedPrompts, []);
});
```

- [ ] **Step 2: Run the test to verify the requested behaviors are not yet implemented**

Run: `node --test tests/experience-core.test.js`

Expected: FAIL until the functions preserve other panel properties and remove a repeated prompt id.

- [ ] **Step 3: Replace the fixed sidebar headings with disclosure hosts**

In `index.html`, wrap each existing content block in a `data-experience-panel` section with its own native toggle. `experience.js` must set content visibility and `aria-expanded` from `state.experience.panels`, then call `updateExperience` after each click. Retain all existing buttons and IDs inside their panel bodies to avoid breaking current event bindings.

Add a `#lessonProgressBar` host before `#contentView`. On module render it shows `Блок N из M`, the current module title, completed count, a navigation toggle, and the next unfinished block. It becomes sticky only above 760 px wide.

Update `renderRoadmap()` so it reads and writes `getExperienceState().roadmapCollapsed` instead of the global `roadmapCollapsed` variable. Remove the global variable once no references remain.

- [ ] **Step 4: Style collapsed and mobile states**

```css
.experience-panel__toggle { display: flex; justify-content: space-between; width: 100%; }
.experience-panel.is-collapsed > :not(.experience-panel__toggle) { display: none; }
.lesson-progress-bar { position: sticky; top: .75rem; z-index: 8; }
@media (max-width: 760px) { .lesson-progress-bar { position: static; } .sidebar { display: none; } .sidebar.is-open { display: block; } }
```

- [ ] **Step 5: Verify per-user storage and commit**

Run: `node --check script.js && node --check experience.js && node --test tests/experience-core.test.js`

Manual browser checks: collapse all four sections, refresh, and verify they remain collapsed; sign in under a second participant and verify default panel states; collapse/expand the roadmap and verify it persists only for the first participant.

```bash
git add index.html script.js experience.js experience.css tests/experience-core.test.js
git commit -m "feat: add personalized collapsible course navigation"
```

### Task 5: Add lesson disclosures and immediate action feedback

**Files:**
- Modify: `script.js:4395-4545, 5153-5300, 5409-5570`
- Modify: `experience.js`
- Modify: `experience.css`
- Test: `tests/experience-core.test.js`

**Interfaces:**
- Produces `renderLessonDisclosure(moduleId, sectionId, title, bodyHtml)` and `announceExperienceStatus(message, status)`.
- Consumes existing `showToast`, `saveState`, `renderQuestion`, practice text areas, open-question text areas, and final-result rendering.
- Uses lesson section keys in the form `${moduleId}:theory`, `${moduleId}:example`, `${moduleId}:practice`, `${moduleId}:review`, `${moduleId}:video`.

- [ ] **Step 1: Write a failing test for disclosure-key safety**

```js
test("normalizes invalid lesson disclosure state", () => {
  const state = core.normalizeExperience({ lessonSections: { "prompt:theory": false, bad: "open" } });
  assert.equal(state.lessonSections["prompt:theory"], false);
  assert.equal(state.lessonSections.bad, "open");
});
```

- [ ] **Step 2: Run the test to establish the current normalization behavior**

Run: `node --test tests/experience-core.test.js`

Expected: PASS after `normalizeExperience` copies arbitrary lesson keys without mutating their values.

- [ ] **Step 3: Render expandable lesson sections without hiding their first view**

Keep theory, example, practice, reflection, and video open by default. Wrap each section during `renderModule()` with a semantic disclosure header. On first click only, save the state under `experience.lessonSections`; never re-render the whole module just to change one disclosure. The toggle must update the local element and `aria-expanded` in place.

Attach `input` and `change` listeners to open-answer and practice fields that call the existing save path, then `announceExperienceStatus("Ответ сохранён на устройстве", "saved")`. Existing async submit functions must call `announceExperienceStatus` with `sending`, `sent`, or `retry` but must still show the local result before network completion.

- [ ] **Step 4: Add motion only as feedback**

```css
.lesson-disclosure__body { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 220ms ease; }
.lesson-disclosure.is-collapsed .lesson-disclosure__body { grid-template-rows: 0fr; }
.experience-status.is-saved { animation: saved-pop 260ms ease-out; }
@keyframes saved-pop { 50% { transform: translateY(-2px); } }
@media (prefers-reduced-motion: reduce) { .lesson-disclosure__body { transition: none; } .experience-status.is-saved { animation: none; } }
```

- [ ] **Step 5: Verify no scroll regressions and commit**

Run: `node --check script.js && node --check experience.js && node --test tests/experience-core.test.js`

Manual browser checks: answer every option in a mini-test and confirm scroll position does not change; edit practice and open answers; confirm status appears; collapse theory, refresh, and verify state; submit a final test with network disabled and confirm local result still appears.

```bash
git add script.js experience.js experience.css tests/experience-core.test.js
git commit -m "feat: add lesson disclosures and learning feedback"
```

### Task 6: Implement animated learning visualizations and the task classifier

**Files:**
- Modify: `script.js:4613-5095, 5584-5645`
- Modify: `experience.js`
- Modify: `experience.css`
- Modify: `tests/experience-core.test.js`

**Interfaces:**
- Consumes existing module `visual`, `extraVisual`, `checklistCards`, `openQuestions`, `quiz`, and result category data.
- Produces `renderEnhancedVisualization(type, data)`, `renderTaskClassifierExperience(host)`, and `renderErrorInsightCards(insights)`.
- Task classifier input shape: `{ data: "public"|"internal"|"sensitive", cost: "low"|"high", goal: "draft"|"external" }`.

- [ ] **Step 1: Add failing classifier and error-insight tests**

```js
test("classifies high-cost internal drafting as guarded", () => {
  assert.equal(core.classifyTask({ data: "internal", cost: "high", goal: "draft" }).level, "guarded");
});

test("returns only categories with at least one incorrect answer", () => {
  const insights = core.buildErrorInsights(
    [{ category: "security", answer: 1 }, { category: "prompt", answer: 0 }],
    { 0: 0, 1: 0 }
  );
  assert.deepEqual(insights.map((item) => item.category), ["security"]);
});
```

- [ ] **Step 2: Run the test to verify the placeholder implementation fails**

Run: `node --test tests/experience-core.test.js`

Expected: FAIL because `buildErrorInsights()` currently returns an empty array.

- [ ] **Step 3: Implement deterministic recommendations and upgraded diagrams**

Implement `buildErrorInsights` to group only wrong final answers by `category`, return `category`, `count`, `title`, `action`, and `moduleIds`, and use the existing category map as the single source of Russian copy.

In `experience.js`, add these renderers:

- comparison: CSS bars animate from zero only on first entry using `IntersectionObserver`;
- risk matrix: selected quadrant gets a live explanation, keyboard-radiogroup controls have text alternatives;
- prompt anatomy: seven compact buttons reveal definition, purpose, and example one at a time;
- verification path: SVG/CSS ordered steps transition after a click, with no auto-advance;
- document route: highlight the manual-check step;
- task classifier: three native `select` controls call `core.classifyTask` and render one of the three explicit actions.

Never manufacture a percentage or claim a legal permission. Label the classifier: `Учебная рекомендация: проверьте внутренние правила организации.`

- [ ] **Step 4: Add visual and accessibility styles**

```css
.experience-chart[data-visible="true"] .experience-bar__fill { transform: scaleX(1); }
.experience-bar__fill { transform: scaleX(0); transform-origin: left; transition: transform 700ms cubic-bezier(.22,1,.36,1); }
.task-classifier__result[data-level="restricted"] { border-color: var(--bad); }
.task-classifier__result[data-level="guarded"] { border-color: var(--gold); }
.task-classifier__result[data-level="allowed"] { border-color: var(--good); }
```

- [ ] **Step 5: Verify visual behavior and commit**

Run: `node --check script.js && node --check experience.js && node --test tests/experience-core.test.js`

Manual browser checks: all charts display meaningful static content before animation; changing the classifier changes recommendation and copy; keyboard operation is possible; reduced-motion mode does not animate bars or paths; personal error cards appear only after a final attempt.

```bash
git add script.js experience-core.js experience.js experience.css tests/experience-core.test.js
git commit -m "feat: add interactive learning visualizations"
```

### Task 7: Add practical support: checklists, cases, weak-answer drill, and personal prompt collection

**Files:**
- Modify: `script.js:199-3320, 5305-5390, 5584-5645`
- Modify: `experience-core.js`
- Modify: `experience.js`
- Modify: `experience.css`
- Modify: `content/course-content.md`
- Modify: `tests/experience-core.test.js`

**Interfaces:**
- Uses existing module IDs and prompt-library IDs as stable identifiers.
- Produces `renderSafetyChecklist()`, `renderWorkCases()`, `renderWeakAnswerDrill()`, `renderPersonalPromptCollection()`.
- `promptNotes` remains local to participant progress and is not included in result payloads.

- [ ] **Step 1: Write failing tests for personal collection behavior**

```js
test("preserves notes when a saved prompt is removed and later restored", () => {
  let state = core.blankExperience();
  state.promptNotes["audit-plan"] = "Использовал для черновика плана проверки";
  state = core.toggleSavedPrompt(state, "audit-plan");
  state = core.toggleSavedPrompt(state, "audit-plan");
  assert.equal(state.promptNotes["audit-plan"], "Использовал для черновика плана проверки");
});
```

- [ ] **Step 2: Run the test before collection integration**

Run: `node --test tests/experience-core.test.js`

Expected: PASS for the core state; browser collection controls are still absent.

- [ ] **Step 3: Add content and rendering**

Add five reusable checklist cards with the exact questions from the approved design. Add five short department cases in `content/course-content.md` and corresponding structured data in `script.js`, one each for audit/control, finance, law, accounting, and construction control. Each case has a short situation, three next-step options, one safe option, and an explanation; no real organization data.

Add a weak-answer drill with five realistic failure modes: unsupported number, invented source, missing task condition, overconfident conclusion, and ignored confidentiality restriction. The participant marks risky fragments before viewing the explanation.

In the existing prompt library, add a `Сохранить в мою подборку` action, a personal filter, a local note field, and a `Применён` mark. Call `updateExperience()` after each mutation; do not modify `submitResults()` or its payload.

- [ ] **Step 4: Apply usable long-list layouts and feedback**

Use a horizontal card scroller only on narrow screens for checklists and cases; desktop uses a two-column grid. Practice cases and collection actions use the shared status component. Do not introduce a new permanent navigation item: the personal selection lives inside the existing prompt library.

- [ ] **Step 5: Verify data boundaries and commit**

Run: `node --check script.js && node --check experience-core.js && node --check experience.js && node --test tests/experience-core.test.js`

Manual browser checks: save a prompt and note under participant A; log in as participant B and confirm the selection is absent; inspect `submitResults()` payload in DevTools and confirm no `promptNotes` field; complete a case and verify no Google Sheets request is made until an existing submission action.

```bash
git add script.js experience-core.js experience.js experience.css content/course-content.md tests/experience-core.test.js
git commit -m "feat: add practical learning support tools"
```

### Task 8: Integrate assets, cache, documentation, and end-to-end verification

**Files:**
- Modify: `index.html:20-25, 110-113`
- Modify: `sw.js`
- Modify: `README.md`
- Modify: `styles.css:2534-2625`
- Test: `tests/experience-core.test.js`

**Interfaces:**
- Loads `experience-core.js`, `experience.js`, and `experience.css` after the existing core course files and before feature-dependent initialization.
- Service worker cache contains each new local asset with `?v=56`.

- [ ] **Step 1: Write a failing cache-content assertion**

```js
test("experience state has no server endpoint or participant identity", () => {
  const state = core.blankExperience();
  assert.equal(JSON.stringify(state).includes("http"), false);
  assert.equal(JSON.stringify(state).includes("passwordHash"), false);
});
```

- [ ] **Step 2: Run the full core suite**

Run: `node --test tests/experience-core.test.js`

Expected: all tests pass before cache changes; this confirms new local preferences are data-only.

- [ ] **Step 3: Bump and wire the static build**

In `index.html`, add:

```html
<link rel="stylesheet" href="experience.css?v=56">
<script src="experience-core.js?v=56"></script>
<script src="experience.js?v=56"></script>
```

Set `COURSE_BUILD = "v56"`, change all existing asset query values to `v=56`, change the service-worker reload key to `aiCourseSwReloadedV56`, and change cache name to `ai-course-v56`. Add the three new JavaScript/CSS assets to the pre-cache list. Add a concise README entry explaining per-participant UI preferences, reduced-motion behavior, and no change to Google Sheets payloads.

- [ ] **Step 4: Run final technical and visual verification**

Run:

```bash
node --check script.js
node --check experience-core.js
node --check experience.js
node --check features.js
node --test tests/experience-core.test.js
git diff --check
```

Expected: each syntax check succeeds, all tests pass, and `git diff --check` has no output.

Manual browser matrix:

1. 1440 px: hero makes a clear first impression, cycle routes work, sidebar sections and roadmap persist.
2. 768 px: no overlapping controls or clipped text; lesson bar remains usable.
3. 375 px: cycle becomes two columns, mobile navigation opens and closes, no horizontal page scroll.
4. Light and dark themes: diagrams, success/error/guarded states retain readable contrast.
5. Reduced-motion: no moving marker, no chart entrance animation, all final states visible.
6. Participant A/B: panel state, roadmap, saved prompts, and notes are isolated.
7. Offline: lessons, diagrams, progress and preferences work; submission offers retry without losing local results.

- [ ] **Step 5: Commit final integration**

```bash
git add index.html script.js styles.css experience.css experience-core.js experience.js sw.js README.md tests/experience-core.test.js
git commit -m "feat: ship course motion and learning experience"
```

## Self-Review

- Spec coverage: Tasks 3–6 cover the hero impact, route, sidebar, roadmap, lesson bar, feedback, disclosures, and thematic diagrams. Task 7 covers personal error analysis, classifier, checklists, cases, weak-answer drill, and prompt collection. Task 8 covers accessibility, responsive behavior, offline support, caching, and verification.
- Scope boundary: registration, access codes, Apps Script endpoint, status checks, and Google Sheets payload formats are explicitly preserved.
- Placeholder scan: this plan contains no deferred implementation markers; each task includes file paths, named interfaces, executable checks, and a commit action.
- Type consistency: `experience` is always a field of per-participant progress; `CourseExperienceCore` owns pure state transformations; `courseExperienceHost` is the only dependency from DOM code into the existing course runtime.
