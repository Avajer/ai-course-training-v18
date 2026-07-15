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
  assert.deepEqual(result.options, options);
});
