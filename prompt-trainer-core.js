(function (root, factory) {
  "use strict";
  root.PromptTrainer = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function normalize(text) {
    var original = String(text || "").trim().replace(/\r\n?/g, "\n");
    var normalized = original.toLowerCase().replace(/[\t ]+/g, " ");
    var tokens = normalized.match(/[a-zа-яё0-9%№_-]+/gi) || [];
    var sentences = original.match(/[^.!?\n]+[.!?]?/g) || [];
    sentences = sentences.map(function (item) { return item.trim(); }).filter(Boolean);
    var sections = original.split(/\n+/).map(function (item) { return item.trim(); }).filter(Boolean);
    return { original: original, normalized: normalized, tokens: tokens, sentences: sentences,
      sections: sections, wordCount: tokens.length, charCount: original.length };
  }

  function analyze(text, options) {
    return { text: normalize(text), options: options || {} };
  }

  return { normalize: normalize, analyze: analyze };
});
