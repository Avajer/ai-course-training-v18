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

test("trainer history is participant-scoped and capped", () => {
  const features = read("features.js");

  assert.match(features, /trainerHistory:\s*"aiCoursePromptTrainerHistoryV1"/);
  assert.match(features, /lsGet\(uKey\(LS\.trainerHistory\),\s*\[\]\)/);
  assert.match(features, /slice\(0,\s*20\)/);
  assert.match(features, /createdAt:/);
  assert.match(features, /qualityScore:/);
  assert.match(features, /safetyScore:/);
  assert.match(features, /commentary:/);
  assert.match(features, /improved:/);
});

test("trainer history supports restore, delete and clear after explicit checks", () => {
  const features = read("features.js");

  assert.match(features, /data-trainer-history-restore/);
  assert.match(features, /data-trainer-history-delete/);
  assert.match(features, /data-trainer-history-clear/);
  assert.match(features, /data-trainer-history-toggle/);
  assert.match(features, /runTrainer\(null,\s*true\)/);
  assert.match(features, /runTrainer\(null,\s*false\)/);
  assert.match(features, /slice\(0,\s*100\)/);
});

test("trainer has stable responsive and reduced-motion styles", () => {
  const css = read("features.css");

  assert.match(css, /\.trainer-controls\s*\{/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[^]*\.trainer-controls/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[^]*\.trainer-/);
  assert.match(css, /\.feat-panel-trainer\s*\{[^]*width:\s*min\(940px,\s*100%\)/);
  assert.match(css, /\.trainer-result[^}]*min-width:\s*0/);
});

test("trainer accessibility contract includes labels, live results and keyboard tabs", () => {
  const features = read("features.js");
  const css = read("features.css");

  ["sbInput", "sbProfile", "sbErrorCost", "sbDataType", "sbMode"].forEach((id) => {
    assert.match(features, new RegExp(`(?:for|id)="${id}"`));
  });
  assert.match(features, /id="sbResult"[^>]*aria-live="polite"/);
  assert.match(features, /data-trainer-history-toggle aria-expanded=/);
  assert.match(features, /role="tablist"/);
  assert.match(features, /role="tab"/);
  assert.match(features, /ArrowLeft/);
  assert.match(features, /ArrowRight/);
  assert.match(css, /\.trainer-[^{]*:focus-visible/);
});
