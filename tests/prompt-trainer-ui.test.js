import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("loads trainer core before feature UI", () => {
  const page = read("index.html");

  assert.match(page, /prompt-trainer-core\.js[^]*features\.js/);
});

test("trainer offers manual profile, risk, data and display controls", () => {
  const features = read("features.js");

  [
    "sbInput",
    "sbProfile",
    "sbErrorCost",
    "sbDataType",
    "sbMode",
    "sbCheck",
    "sbResult",
    "sbHistory",
    "data-trainer-recheck",
    "data-trainer-replace"
  ].forEach((id) => assert.match(features, new RegExp(id)));
  assert.match(features, /Анализ выполняется на этом устройстве/);
  assert.match(features, /Автоматически/);
});

test("trainer UI consumes the shared core and removes the legacy keyword analyzer", () => {
  const features = read("features.js");

  assert.match(features, /window\.PromptTrainer/);
  assert.match(features, /trainer\.PROFILES/);
  assert.match(features, /trainer\.analyze\(/);
  assert.match(features, /trainer\.improve\(/);
  assert.match(features, /trainer\.compare\(/);
  ["PROMPT_ELEMENTS", "analyzePrompt", "trainerVerdict", "promptPriority", "buildImprovedPrompt"].forEach((legacy) => {
    assert.doesNotMatch(features, new RegExp(legacy));
  });
});

test("trainer renders quality, safety, contextual findings and comparison", () => {
  const features = read("features.js");

  [
    "trainer-score-grid",
    "trainer-dimensions",
    "trainer-commentary",
    "trainer-strengths",
    "trainer-issues",
    "trainer-risks",
    "trainer-highlight",
    "trainer-improve-tabs",
    "trainer-compare"
  ].forEach((className) => assert.match(features, new RegExp(className)));
  assert.match(features, /Качество/);
  assert.match(features, /Безопасность/);
  assert.match(features, /Краткая версия/);
  assert.match(features, /Полная версия/);
  assert.match(features, /До улучшения/);
  assert.match(features, /После улучшения/);
});

test("trainer has a graceful fallback when the shared core is unavailable", () => {
  const features = read("features.js");

  assert.match(features, /if \(!trainer\)/);
  assert.match(features, /Тренажер временно недоступен\. Остальные разделы курса продолжают работать\./);
});
