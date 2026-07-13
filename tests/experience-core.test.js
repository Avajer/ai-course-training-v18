import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("визуализации книги и каталога используют исходные классы Claude Design", () => {
  const experience = fs.readFileSync(new URL("../experience.js", import.meta.url), "utf8");
  const course = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../experience.css", import.meta.url), "utf8");

  assert.match(experience, /class="book-scene"/);
  assert.match(experience, /class="book-cover"/);
  assert.match(course, /nav-item nav-item--/);
  assert.match(course, /class="nav-thread"/);
  assert.match(styles, /@keyframes book-cover/);
  assert.match(styles, /@keyframes nav-flow/);
});

test("рабочий цикл остается на стартовом экране и не возвращается при переходе по блокам", () => {
  const course = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");

  assert.match(course, /setHeroVisibility\(Boolean\(options\.showHero\)\)/);
  assert.match(course, /renderModule\(0, \{ showHero: true \}\)/);
});

const source = fs.readFileSync(new URL("../experience-core.js", import.meta.url), "utf8");
const sandbox = { window: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(source, sandbox);
const core = sandbox.window.CourseExperienceCore;

test("normalizes a missing experience state without sharing preferences", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(core.normalizeExperience())), {
    panels: { objectives: true, progress: true, modules: true, actions: false },
    roadmapCollapsed: true,
    resultsCollapsed: true,
    lessonSections: {},
    savedPrompts: [],
    promptNotes: {},
    libraryBookSeen: false
  });
});

test("сохраняет выбранное состояние панели прогресса и ответов", () => {
  assert.equal(core.normalizeExperience({}).resultsCollapsed, true);
  assert.equal(core.normalizeExperience({ resultsCollapsed: false }).resultsCollapsed, false);
});

test("classifies sensitive, high-cost external work as restricted", () => {
  assert.equal(
    core.classifyTask({ data: "sensitive", cost: "high", goal: "external" }).level,
    "restricted"
  );
});

test("selects the first unfinished module as the next action", () => {
  const modules = [{ id: "intro", title: "Введение" }, { id: "prompt", title: "Промпт" }];
  const progress = { modules: { intro: { submitted: true } } };
  assert.equal(core.findNextAction(modules, progress).moduleId, "prompt");
});

test("adds personal experience preferences to legacy progress without replacing answers", () => {
  const progress = core.withExperience({ modules: { intro: { score: 4 } }, openAnswers: { "intro:0": "Ответ" } });
  assert.equal(progress.modules.intro.score, 4);
  assert.equal(progress.openAnswers["intro:0"], "Ответ");
  assert.equal(progress.experience.panels.modules, true);
});

test("defines six learning-cycle steps with unique course destinations", () => {
  assert.equal(core.CYCLE_STEPS.length, 6);
  assert.equal(new Set(core.CYCLE_STEPS.map((step) => step.moduleId)).size, 6);
  assert.equal(core.CYCLE_STEPS[0].label, "Задача");
});

test("returns only weak final-test categories as personal insights", () => {
  const questions = [
    { category: "security", answer: 1 },
    { category: "prompt", answer: 0 },
    { category: "prompt", answer: 2 }
  ];
  const insights = core.buildErrorInsights(questions, { 0: 0, 1: 0, 2: 2 });
  assert.deepEqual(
    JSON.parse(JSON.stringify(insights.map((item) => [item.category, item.count]))),
    [["security", 1]]
  );
});

test("removes a prompt from the collection on the second action", () => {
  const saved = core.toggleSavedPrompt(core.blankExperience(), "audit-plan");
  const removed = core.toggleSavedPrompt(saved, "audit-plan");
  assert.deepEqual(JSON.parse(JSON.stringify(removed.savedPrompts)), []);
});

test("derives catalog states from actual course progress", () => {
  assert.equal(core.getCatalogState({ locked: false, active: true, submitted: false }), "active");
  assert.equal(core.getCatalogState({ locked: false, active: false, submitted: true }), "done");
  assert.equal(core.getCatalogState({ locked: true, active: false, submitted: false }), "locked");
  assert.equal(core.getCatalogState({ locked: false, active: true, submitted: true, department: true }), "department");
});

test("defines work-case data before the course initializes", () => {
  const script = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
  assert.ok(script.indexOf("const WORK_CASES") < script.lastIndexOf("initializeCourse();"));
});
