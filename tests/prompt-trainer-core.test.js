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

test("normalizes Russian prompt without losing the original", () => {
  const trainer = loadTrainer();
  const result = trainer.normalize("  Проверь документ.\nУкажи риски!  ");
  assert.equal(result.original, "Проверь документ.\nУкажи риски!");
  assert.equal(result.wordCount, 5);
  assert.deepEqual(Array.from(result.sentences), ["Проверь документ.", "Укажи риски!"]);
});
