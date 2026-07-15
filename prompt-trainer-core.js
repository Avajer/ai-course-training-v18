(function (root, factory) {
  "use strict";
  var trainer = factory();
  root.PromptTrainer = trainer;
  if (typeof module !== "undefined" && module && module.exports) {
    module.exports = trainer;
  }
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

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  var PROFILES = freeze({
    document: {
      name: "Анализ документа",
      signals: [
        { phrase: "документ", weight: 3 }, { phrase: "договор", weight: 3 },
        { phrase: "приложени", weight: 2 }, { phrase: "пункт", weight: 2 }
      ],
      requiredDimensions: ["action", "data", "output"],
      weights: { action: 1, data: 2, output: 2, verification: 1 }
    },
    letter: {
      name: "Подготовка письма",
      signals: [
        { phrase: "письмо", weight: 4 }, { phrase: "адресат", weight: 3 },
        { phrase: "тема письма", weight: 3 }, { phrase: "обращени", weight: 2 }
      ],
      requiredDimensions: ["action", "purpose", "output"],
      weights: { action: 1, purpose: 2, output: 2, clarity: 1 }
    },
    data: {
      name: "Анализ данных",
      signals: [
        { phrase: "таблиц", weight: 3 }, { phrase: "данные", weight: 2 },
        { phrase: "выборк", weight: 2 }, { phrase: "показател", weight: 3 },
        { phrase: "рассчита", weight: 2 }
      ],
      requiredDimensions: ["action", "data", "criteria"],
      weights: { action: 1, data: 3, criteria: 2, verification: 2 }
    },
    audit: {
      name: "Аудит и контроль",
      signals: [
        { phrase: "аудитор", weight: 4 }, { phrase: "нарушени", weight: 3 },
        { phrase: "доказательств", weight: 4 }, { phrase: "контроль", weight: 2 },
        { phrase: "выборк", weight: 4 }, { phrase: "операци", weight: 4 }
      ],
      requiredDimensions: ["action", "data", "criteria", "verification"],
      weights: { action: 1, data: 2, criteria: 3, verification: 3 }
    },
    construction: {
      name: "Строительный контроль",
      signals: [
        { phrase: "кс-2", weight: 4 }, { phrase: "кс-3", weight: 4 },
        { phrase: "смет", weight: 3 }, { phrase: "строительн", weight: 3 },
        { phrase: "журнал работ", weight: 4 }, { phrase: "подрядчик", weight: 2 }
      ],
      requiredDimensions: ["action", "data", "criteria", "verification"],
      weights: { action: 1, data: 3, criteria: 3, verification: 3 }
    },
    planning: {
      name: "Планирование работы",
      signals: [
        { phrase: "план", weight: 3 }, { phrase: "срок", weight: 3 },
        { phrase: "этап", weight: 2 }, { phrase: "задач", weight: 2 },
        { phrase: "приоритет", weight: 3 }
      ],
      requiredDimensions: ["action", "purpose", "criteria", "nextStep"],
      weights: { action: 1, purpose: 2, criteria: 2, nextStep: 3 }
    },
    comparison: {
      name: "Сравнение вариантов",
      signals: [
        { phrase: "сравни", weight: 4 }, { phrase: "сопостав", weight: 3 },
        { phrase: "вариант", weight: 3 }, { phrase: "критери", weight: 2 },
        { phrase: "предложени", weight: 2 }
      ],
      requiredDimensions: ["action", "data", "criteria", "output"],
      weights: { action: 2, data: 2, criteria: 3, output: 2 }
    },
    extraction: {
      name: "Извлечение информации",
      signals: [
        { phrase: "извлеки", weight: 4 }, { phrase: "выдели", weight: 2 },
        { phrase: "структурир", weight: 3 }, { phrase: "реквизит", weight: 3 },
        { phrase: "поле", weight: 2 }
      ],
      requiredDimensions: ["action", "data", "output"],
      weights: { action: 2, data: 3, output: 3, clarity: 1 }
    },
    report: {
      name: "Подготовка отчета",
      signals: [
        { phrase: "отчет", weight: 4 }, { phrase: "заключени", weight: 3 },
        { phrase: "вывод", weight: 2 }, { phrase: "рекомендаци", weight: 2 },
        { phrase: "итог", weight: 2 }
      ],
      requiredDimensions: ["action", "data", "output", "verification"],
      weights: { action: 1, data: 2, output: 3, verification: 2 }
    },
    universal: {
      name: "Универсальная задача",
      signals: [],
      requiredDimensions: ["action", "purpose", "output"],
      weights: { action: 1, purpose: 1, data: 1, output: 1 }
    }
  });

  function classify(normalizedText) {
    var text = typeof normalizedText === "string" ? normalizedText : normalizedText && normalizedText.normalized;
    text = String(text || "").toLowerCase();
    var candidates = Object.keys(PROFILES).filter(function (id) { return id !== "universal"; }).map(function (id) {
      var profile = PROFILES[id];
      var evidence = profile.signals.filter(function (signal) { return text.indexOf(signal.phrase) !== -1; }).map(function (signal) {
        return { phrase: signal.phrase, weight: signal.weight };
      });
      var score = evidence.reduce(function (total, signal) { return total + signal.weight; }, 0);
      var possibleWeight = profile.signals.reduce(function (total, signal) { return total + signal.weight; }, 0);
      return {
        id: id,
        evidence: evidence,
        score: score,
        confidence: possibleWeight ? score / possibleWeight : 0
      };
    });
    var byConfidence = function (left, right) {
      return right.confidence - left.confidence || right.score - left.score;
    };
    var qualified = candidates.filter(function (candidate) {
      return candidate.evidence.length >= 2 && candidate.confidence >= 0.34;
    }).sort(byConfidence);

    if (!qualified.length) {
      var fallbackCandidate = candidates.slice().sort(byConfidence)[0];
      return {
        primary: "universal",
        secondary: null,
        confidence: Math.min(0.33, fallbackCandidate.confidence),
        evidence: fallbackCandidate.evidence
      };
    }

    var primaryCandidate = qualified[0];
    var secondaryCandidate = qualified[1];

    return {
      primary: primaryCandidate.id,
      secondary: secondaryCandidate ? secondaryCandidate.id : null,
      confidence: primaryCandidate.confidence,
      evidence: primaryCandidate.evidence
    };
  }

  function analyze(text, options) {
    var normalized = normalize(text);
    var suppliedOptions = options || {};
    var classification = classify(normalized);
    var manualProfile = suppliedOptions.profile;
    var hasManualProfile = manualProfile && manualProfile !== "auto" && Object.prototype.hasOwnProperty.call(PROFILES, manualProfile);
    if (hasManualProfile) classification.overridden = true;
    return {
      text: normalized,
      options: suppliedOptions,
      classification: classification,
      profile: hasManualProfile ? manualProfile : classification.primary
    };
  }

  return { PROFILES: PROFILES, normalize: normalize, classify: classify, analyze: analyze };
});
