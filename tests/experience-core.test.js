import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../experience-core.js";

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
