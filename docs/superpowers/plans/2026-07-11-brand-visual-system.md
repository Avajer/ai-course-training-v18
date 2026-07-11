# Brand Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved animated logo, book library scene, and real-state catalog to the published AI course.

**Architecture:** `experience.js` owns rendering and interaction of all three visual components. `experience.css` owns their presentation and reduced-motion fallbacks. The existing `script.js` continues to own course state and only exposes the current module and module-result state through the already existing `courseExperienceHost`.

**Tech Stack:** Static HTML, vanilla JavaScript, inline SVG, CSS keyframes, existing `localStorage` progress, Node built-in test runner, GitHub Pages.

## Global Constraints

- Do not modify registration, access-code validation, Google Sheets endpoint, or result payloads.
- Use the exact visible subtitle `курс для работников` in the logo.
- Existing module buttons remain buttons and preserve their current handlers and accessible names.
- Motion uses transform/opacity/SVG strokes only and becomes static under `prefers-reduced-motion: reduce`.
- Catalog state must be derived from current module, submitted module state, authorization state, and existing department navigation.
- Raise all asset/cache versions from `v56` to `v57` after implementation.

---

### Task 1: Add a tested brand-state model and logo renderer

**Files:**
- Modify: `experience-core.js`
- Modify: `tests/experience-core.test.js`
- Modify: `index.html:31, 82-90`
- Modify: `experience.js`
- Modify: `experience.css`

**Interfaces:**
- Produces `CourseExperienceCore.getCatalogState({ locked, active, submitted, department })` returning `locked`, `done`, `active`, `future`, or `department`.
- Produces `renderBrandLogo({ compact })` in `experience.js`.

- [ ] **Step 1: Write the failing test**

```js
test("derives catalog states from actual course progress", () => {
  assert.equal(core.getCatalogState({ locked: false, active: true, submitted: false }), "active");
  assert.equal(core.getCatalogState({ locked: false, active: false, submitted: true }), "done");
  assert.equal(core.getCatalogState({ locked: true, active: false, submitted: false }), "locked");
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test tests/experience-core.test.js`

Expected: FAIL because `getCatalogState` is not exported.

- [ ] **Step 3: Implement the pure state rule and logo hosts**

```js
function getCatalogState({ locked, active, submitted, department }) {
  if (locked) return "locked";
  if (department) return "department";
  if (active) return "active";
  return submitted ? "done" : "future";
}
```

Replace the plain `.brand` text with `#brandLogoCompact`; add `#brandLogoHero` before the existing hero kicker. `renderBrandLogo` renders the same semantic markup into both hosts with the requested compact modifier and `aria-label="ИИ-практикум, курс для работников"`.

- [ ] **Step 4: Verify the core and browser assets**

Run: `node --check experience-core.js && node --check experience.js && node --test tests/experience-core.test.js`

Expected: all checks succeed.

- [ ] **Step 5: Commit**

```bash
git add experience-core.js tests/experience-core.test.js index.html experience.js experience.css
git commit -m "feat: add animated course brand"
```

### Task 2: Add the opening book to the prompt library

**Files:**
- Modify: `script.js:5502-5550`
- Modify: `experience.js`
- Modify: `experience.css`
- Modify: `tests/experience-core.test.js`

**Interfaces:**
- `renderLibrary()` adds `<section id="promptLibraryBook" class="prompt-library-book"></section>` before `.prompt-grid`.
- `CourseExperience.enhancePromptLibrary()` renders the book after each library redraw.

- [ ] **Step 1: Write the failing test**

```js
test("normalizes a missing library-scene preference as unseen", () => {
  assert.equal(core.normalizeExperience().libraryBookSeen, false);
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test tests/experience-core.test.js`

Expected: FAIL because `libraryBookSeen` is absent.

- [ ] **Step 3: Implement one-time entry and direct library access**

Extend `blankExperience()` and `normalizeExperience()` with `libraryBookSeen: false`. Render the CSS 3D cover, pages, cards, floor and glyphs into `#promptLibraryBook`. Use one `IntersectionObserver` to add `is-open` once; set `libraryBookSeen` with the existing `updateExperience()` callback. The action button must call `document.querySelector(".prompt-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })`.

- [ ] **Step 4: Verify interactive behavior**

Run: `node --check script.js && node --check experience.js && node --test tests/experience-core.test.js`

Manual check: library filters, copying, saving and notes remain usable; book action scrolls to the actual card grid; reduced-motion display is open and static.

- [ ] **Step 5: Commit**

```bash
git add experience-core.js tests/experience-core.test.js script.js experience.js experience.css
git commit -m "feat: add animated prompt library book"
```

### Task 3: Render the real-state catalog and publish v57

**Files:**
- Modify: `script.js:3561-3630`
- Modify: `experience.js`
- Modify: `experience.css`
- Modify: `index.html`
- Modify: `features.js`
- Modify: `sw.js`
- Modify: `README.md`

**Interfaces:**
- `renderNav()` emits `data-catalog-state` on every module button from `getCatalogState` inputs.
- `CourseExperience.enhanceCatalog()` applies the vertical thread and uses no timer-driven state changes.

- [ ] **Step 1: Write the failing test for department priority**

```js
test("keeps a department block visually distinct", () => {
  assert.equal(core.getCatalogState({ locked: false, active: true, submitted: true, department: true }), "department");
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test tests/experience-core.test.js`

Expected: FAIL before `getCatalogState` checks `department` before other unlocked states.

- [ ] **Step 3: Integrate catalog state and styles**

Emit real `data-catalog-state` values from `renderNav()` and retain `is-active`, `is-locked`, `.dept-nav`, `data-module`, and all event bindings. `enhanceCatalog()` adds only one decorative `aria-hidden="true"` thread and pulse element to `#moduleNav`; do not duplicate it on redraw.

Add CSS for the thread, `done`, `active`, `future`, `department`, and `locked` states. The active ripple and thread pulse are disabled under reduced motion. At `max-width: 760px`, hide only the decorative thread, not the buttons or state dots.

- [ ] **Step 4: Bump cache version and run full verification**

Set `COURSE_BUILD`, `COURSE_VERSION`, all query values, service-worker reload key and cache name to `v57`; pre-cache the existing files under their `v57` query URLs. Run:

```bash
node --check script.js
node --check experience-core.js
node --check experience.js
node --check features.js
node --test tests/experience-core.test.js
git diff --check
```

Manual browser matrix: 1440, 768 and 375 px; light/dark theme; locked and authenticated display; prompt library; no browser console errors.

- [ ] **Step 5: Commit and publish**

```bash
git add script.js experience-core.js experience.js experience.css index.html features.js sw.js README.md tests/experience-core.test.js
git commit -m "feat: ship branded course visual system"
git push origin main
```

## Self-Review

- Logo requirements are covered by Task 1; subtitle, compact/full use, light/dark and reduced-motion behavior are explicit.
- Opening book, real library access and local first-view preference are covered by Task 2.
- Real catalog states, department state, mobile, accessibility, versioning and publication are covered by Task 3.
- Registration, results and Google Sheets contracts are excluded by the global constraints.
