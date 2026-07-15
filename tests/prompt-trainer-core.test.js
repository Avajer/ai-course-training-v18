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

function loadCommonJsTrainer() {
  const source = fs.readFileSync(new URL("../prompt-trainer-core.js", import.meta.url), "utf8");
  const sandbox = { window: {}, module: { exports: {} } };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports;
}

test("exports the trainer through CommonJS and window APIs", () => {
  const trainer = loadCommonJsTrainer();
  assert.equal(typeof trainer.normalize, "function");
  assert.equal(typeof trainer.analyze, "function");
});

test("normalizes Russian prompt without losing the original", () => {
  const trainer = loadTrainer();
  const result = trainer.normalize("  Проверь документ.\nУкажи риски!  ");
  assert.equal(result.original, "Проверь документ.\nУкажи риски!");
  assert.equal(result.normalized, "проверь документ.\nукажи риски!");
  assert.deepEqual(Array.from(result.tokens), ["проверь", "документ", "укажи", "риски"]);
  assert.deepEqual(Array.from(result.sections), ["Проверь документ.", "Укажи риски!"]);
  assert.equal(result.wordCount, 4);
  assert.equal(result.charCount, 30);
  assert.deepEqual(Array.from(result.sentences), ["Проверь документ.", "Укажи риски!"]);
});

test("analyzes a prompt with the supplied options", () => {
  const trainer = loadTrainer();
  const options = { profile: "document", errorCost: "high", dataType: "internal" };
  const result = trainer.analyze("Сделай отчет.", options);

  assert.equal(result.text.original, "Сделай отчет.");
  assert.equal(result.text.normalized, "сделай отчет.");
  assert.equal(Object.hasOwn(result.text, "options"), false);
  assert.deepEqual(result.options, options);
});

test("exposes immutable work profiles with required definitions", () => {
  const trainer = loadTrainer();
  const expectedIds = [
    "document", "letter", "data", "audit", "construction",
    "planning", "comparison", "extraction", "report", "universal"
  ];

  assert.deepEqual(Object.keys(trainer.PROFILES), expectedIds);
  expectedIds.forEach((id) => {
    const profile = trainer.PROFILES[id];
    assert.equal(typeof profile.name, "string", id + ": name");
    assert.ok(Array.isArray(profile.signals), id + ": signals");
    assert.ok(Array.isArray(profile.requiredDimensions), id + ": required dimensions");
    assert.equal(typeof profile.weights, "object", id + ": weights");
    assert.ok(Object.isFrozen(profile), id + ": immutable profile");
  });
  assert.ok(Object.isFrozen(trainer.PROFILES));
});

test("classifies audit and construction tasks", () => {
  const trainer = loadTrainer();
  const audit = trainer.analyze("Проверь выборку операций, найди нарушения и укажи аудиторские доказательства.");
  const construction = trainer.analyze("Сопоставь акт КС-2 со сметой и журналом строительных работ.");

  assert.equal(audit.classification.primary, "audit");
  assert.equal(construction.classification.primary, "construction");
  assert.ok(audit.classification.confidence >= 0.34 && audit.classification.confidence <= 1);
  assert.ok(construction.classification.evidence.length >= 2);
});

test("prefers a valid audit profile over a tied one-signal letter profile", () => {
  const trainer = loadTrainer();
  const classification = trainer.classify(trainer.normalize("Подготовь письмо: проверь выборку операций"));

  assert.equal(classification.primary, "audit");
  assert.deepEqual(Array.from(classification.evidence, (item) => item.phrase), ["выборк", "операци"]);
});

test("normalizes weak audit evidence by the profile signal total", () => {
  const trainer = loadTrainer();
  const classification = trainer.classify(trainer.normalize("Проверь контроль операций."));
  const totalWeight = Array.from(trainer.PROFILES.audit.signals)
    .reduce((sum, signal) => sum + signal.weight, 0);

  assert.equal(classification.primary, "universal");
  assert.equal(classification.confidence, 6 / totalWeight);
  assert.ok(classification.confidence < 0.34);
});

test("uses universal profile when specialized evidence is insufficient", () => {
  const trainer = loadTrainer();
  const classification = trainer.classify(trainer.normalize("Проверь документ."));

  assert.equal(classification.primary, "universal");
  assert.equal(classification.secondary, null);
  assert.ok(classification.confidence < 0.34);
  assert.deepEqual(Array.from(classification.evidence, (item) => item.phrase + ":" + item.weight), ["документ:3"]);
});

test("manual profile overrides automatic classification", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Подготовь отчет по проверке", { profile: "report" });

  assert.equal(result.profile, "report");
  assert.equal(result.classification.overridden, true);
  assert.equal(result.classification.primary, "universal");
});

test("element labels without content do not create a strong prompt", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Роль: роль. Контекст: контекст. Задача: задача. Формат: формат. Ограничения: ограничения.");

  assert.ok(result.qualityScore < 40);
  assert.ok(result.issues.some((issue) => issue.id === "empty-shell"));
});

test("long repeated text without task evidence does not create a strong prompt", () => {
  const trainer = loadTrainer();
  const padding = Array.from({ length: 120 }, () => "важный").join(" ");
  const result = trainer.analyze("Контекст: " + padding + ".");

  assert.ok(result.text.wordCount > 100);
  assert.ok(result.qualityScore < 40);
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

test("sensitive identifiers lower safety without lowering structural quality", () => {
  const trainer = loadTrainer();
  const prompt = "Для руководителя отдела проверь приложенную таблицу операций. Сверь каждую операцию с критериями: дата, сумма и контрагент. Верни таблицу с колонками «операция», «нарушение», «обоснование» и отдельный список неопределенностей. Не выноси окончательное решение: отметь позиции для ручной проверки.";
  const safe = trainer.analyze(prompt, { profile: "audit", errorCost: "medium", dataType: "internal" });
  const sensitive = trainer.analyze(prompt + " Контакт: user@example.com, +7 999 123-45-67.", {
    profile: "audit", errorCost: "medium", dataType: "internal"
  });

  assert.ok(safe.qualityScore >= 60);
  assert.equal(sensitive.qualityScore, safe.qualityScore);
  assert.ok(sensitive.safetyScore < safe.safetyScore);
  assert.ok(sensitive.risks.some((risk) => risk.id === "sensitive-identifiers"));
});

test("contradictory requirements reduce clarity", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Дай максимально подробный отчет, но ответ должен состоять из одного предложения.");

  assert.ok(result.contradictions.length > 0);
  assert.ok(result.dimensions.find((item) => item.id === "clarity").score < 70);
});

test("task overload is explained as a quality penalty", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Проанализируй документ, проверь цифры, сравни варианты, подготовь отчет и составь письмо.");

  assert.ok(result.issues.some((issue) => issue.id === "task-overload"));
});
