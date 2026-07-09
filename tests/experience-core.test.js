import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../experience-core.js", import.meta.url), "utf8");
const sandbox = { window: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(source, sandbox);
const core = sandbox.window.CourseExperienceCore;

test("normalizes a missing experience state without sharing preferences", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(core.normalizeExperience())), {
    panels: { objectives: true, progress: true, modules: true, actions: false },
    roadmapCollapsed: true,
    lessonSections: {},
    savedPrompts: [],
    promptNotes: {}
  });
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
