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

test("medical, legal, financial, and control final decisions require a human", () => {
  const trainer = loadTrainer();
  const prompts = [
    "Поставь окончательный диагноз пациенту по анкете.",
    "Прими окончательное правовое решение по иску.",
    "Вынеси окончательное финансовое решение о выдаче кредита.",
    "Подтверди окончательное решение о нарушении контроля."
  ];

  prompts.forEach((prompt) => {
    const result = trainer.analyze(prompt);
    const risk = result.risks.find((item) => item.id === "final-decision-without-human");

    assert.equal(risk?.severity, "critical", prompt);
    assert.ok(result.safetyScore < 60, prompt);
  });
});

test("detects payment cards, passport, SNILS, and INN identifiers locally", () => {
  const trainer = loadTrainer();
  const prompts = [
    "Карта для оплаты: 4111 1111 1111 1111.",
    "Паспорт: 45 08 123456.",
    "СНИЛС: 112-233-445 95.",
    "ИНН: 7707083893."
  ];

  prompts.forEach((prompt) => {
    const result = trainer.analyze(prompt);
    assert.ok(result.risks.some((item) => item.id === "sensitive-identifiers"), prompt);
  });
});

test("does not treat an invalid long order number as a payment card", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Номер заказа: 1234 5678 9012 3456.");

  assert.equal(result.risks.some((item) => item.id === "sensitive-identifiers"), false);
});

test("catches impossible precision in natural word order", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Дай прогноз с точностью 100%.");

  assert.ok(result.issues.some((item) => item.id === "impossible-precision"));
});

test("catches fabricated sources after the source request", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Укажи источники, даже если придется придумать.");

  assert.ok(result.issues.some((item) => item.id === "fabricated-sources"));
  assert.ok(result.risks.some((item) => item.id === "fabricated-sources"));
});

test("does not treat refusal resilience as a high-stakes refusal", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Прими окончательное решение по отказоустойчивости системы.");

  assert.equal(result.risks.some((item) => item.id === "final-decision-without-human"), false);
});

test("does not treat a non-detailed adjective as a detailed requirement", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Отчет может быть неподробным и состоять из одного предложения.");

  assert.equal(result.contradictions.length, 0);
});

test("multiline references without payload stay unresolved", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("По данным ниже:\nПодготовь отчет.");

  assert.ok(result.issues.some((item) => item.id === "unresolved-reference"));
});

test("structured payloads and placeholders resolve multiline references", () => {
  const trainer = loadTrainer();
  const prompts = [
    "По данным ниже:\nСумма: 1200\nПодготовь отчет.",
    "По данным ниже:\n[таблица операций]\nПодготовь отчет."
  ];

  prompts.forEach((prompt) => {
    const result = trainer.analyze(prompt);
    assert.equal(result.issues.some((item) => item.id === "unresolved-reference"), false, prompt);
  });
});

test("yes-or-no-only answer conflicts with detailed justification", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Ответь только «да» или «нет», но дай подробное обоснование.");

  assert.ok(result.contradictions.some((item) => item.id === "detail-vs-binary-answer"));
});

test("high-stakes action-object commands require human verification without a decision noun", () => {
  const trainer = loadTrainer();
  const prompts = [
    "Поставь диагноз пациенту по симптомам.",
    "Одобри выдачу кредита клиенту.",
    "Подтверди нарушение контроля.",
    "Признай договор недействительным."
  ];

  prompts.forEach((prompt) => {
    const result = trainer.analyze(prompt);
    const risk = result.risks.find((item) => item.id === "final-decision-without-human");

    assert.equal(risk?.severity, "critical", prompt);
    assert.ok(result.safetyScore < 60, prompt);
  });
});

test("ordinary approval, confirmation, and recognition commands stay outside high-stakes risk", () => {
  const trainer = loadTrainer();
  const prompts = [
    "Одобри выдачу пропуска клиенту.",
    "Подтверди нарушение формата в документе.",
    "Признай договор полезным."
  ];

  prompts.forEach((prompt) => {
    const result = trainer.analyze(prompt);
    assert.equal(result.risks.some((item) => item.id === "final-decision-without-human"), false, prompt);
  });
});

test("human verification permits a high-stakes action-object review", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Одобри выдачу кредита клиенту только после ручной проверки.");

  assert.equal(result.risks.some((item) => item.id === "final-decision-without-human"), false);
});

test("detects SNILS when the checksum remainder is 100", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("СНИЛС: 002-999-989 00.");

  assert.ok(result.risks.some((item) => item.id === "sensitive-identifiers"));
});

test("does not treat negated precision as impossible precision", () => {
  const trainer = loadTrainer();
  const prompts = ["Дай неточный прогноз.", "Дай не точный прогноз."];

  prompts.forEach((prompt) => {
    const result = trainer.analyze(prompt);
    assert.equal(result.issues.some((item) => item.id === "impossible-precision"), false, prompt);
  });
});

test("does not treat separated negation as a detailed requirement", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("Ответ не должен быть подробным, но должен состоять из одного предложения.");

  assert.equal(result.contradictions.length, 0);
});

test("semicolon-delimited instructions do not resolve a missing data reference", () => {
  const trainer = loadTrainer();
  const result = trainer.analyze("По данным ниже:\nСначала проверь документ; затем подготовь отчет.");

  assert.ok(result.issues.some((item) => item.id === "unresolved-reference"));
});
