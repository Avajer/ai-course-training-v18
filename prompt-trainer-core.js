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

  var DIMENSIONS = freeze([
    { id: "action", name: "Ясность действия", recommendation: "Назовите конкретное действие и объект работы." },
    { id: "purpose", name: "Цель и контекст", recommendation: "Укажите, для кого и для какой рабочей цели нужен результат." },
    { id: "data", name: "Исходные данные", recommendation: "Передайте данные, приложите источник или оставьте понятное поле для него." },
    { id: "output", name: "Требования к результату", recommendation: "Опишите вид результата и его обязательные части." },
    { id: "criteria", name: "Критерии и границы", recommendation: "Добавьте критерии проверки, границы и важные ограничения." },
    { id: "verification", name: "Проверка и неопределенность", recommendation: "Попросите отмечать неопределенность и предусмотреть проверку результата." },
    { id: "privacy", name: "Безопасность данных", recommendation: "Не передавайте идентификаторы без необходимости и задайте правила работы с данными." },
    { id: "nextStep", name: "Следующий шаг", recommendation: "Укажите, что делать при нехватке данных или после первичного результата." },
    { id: "clarity", name: "Ясность языка", recommendation: "Уберите противоречия и сформулируйте требования однозначно." }
  ]);

  function compileRussianPattern(pattern) {
    var source = pattern.source;
    var compiled = "";
    var inCharacterClass = false;
    for (var index = 0; index < source.length; index += 1) {
      var character = source.charAt(index);
      var next = source.charAt(index + 1);
      if (character === "\\" && next === "b") {
        index += 1;
        continue;
      }
      if (character === "\\" && next === "w") {
        compiled += inCharacterClass ? "a-zа-яё0-9_" : "[a-zа-яё0-9_]";
        index += 1;
        continue;
      }
      if (character === "[" && source.charAt(index - 1) !== "\\") inCharacterClass = true;
      if (character === "]" && source.charAt(index - 1) !== "\\") inCharacterClass = false;
      compiled += character;
    }
    return new RegExp(compiled, pattern.flags);
  }

  function firstMatch(text, patterns) {
    for (var index = 0; index < patterns.length; index += 1) {
      var pattern = compileRussianPattern(patterns[index]);
      pattern.lastIndex = 0;
      var match = pattern.exec(text);
      if (match) {
        return {
          phrase: match[0],
          ranges: [{ start: match.index, end: match.index + match[0].length }]
        };
      }
    }
    return null;
  }

  function collectSignals(text, groups) {
    var evidence = [];
    groups.forEach(function (patterns) {
      var match = firstMatch(text, patterns);
      if (match) evidence.push(match);
    });
    return evidence;
  }

  function scoreSignals(signalCount) {
    if (signalCount >= 3) return 100;
    if (signalCount === 2) return 75;
    if (signalCount === 1) return 45;
    return 0;
  }

  function dimensionStatus(score) {
    if (score >= 75) return "strong";
    if (score >= 45) return "partial";
    return "missing";
  }

  function makeDimension(definition, score, evidence) {
    return {
      id: definition.id,
      name: definition.name,
      score: Math.max(0, Math.min(100, Math.floor(score))),
      max: 100,
      status: dimensionStatus(score),
      evidence: evidence,
      recommendation: definition.recommendation
    };
  }

  function makeFinding(id, severity, title, detail, recommendation, ranges) {
    return {
      id: id,
      severity: severity,
      title: title,
      detail: detail,
      recommendation: recommendation,
      ranges: ranges || []
    };
  }

  function addUniqueFinding(target, finding) {
    if (!target.some(function (item) { return item.id === finding.id; })) target.push(finding);
  }

  function findEmptyShell(text) {
    var pattern = /(?:^|[.!?\n])\s*(роль|контекст|задача|формат|ограничения|цель|данные|критерии)\s*:\s*([^.!?\n]*)/gi;
    var labels = [];
    var match;
    while ((match = pattern.exec(text))) {
      var label = match[1].toLowerCase();
      var value = match[2].trim().toLowerCase().replace(/[«»"'()[\],:;]+/g, "");
      if (!value || value === label || value.length < 4) {
        labels.push({ start: match.index, end: match.index + match[0].length });
      }
    }
    return labels.length >= 3 ? labels : [];
  }

  function hasDominantRepeatedToken(tokens) {
    if (tokens.length < 20) return false;
    var counts = {};
    tokens.forEach(function (token) { counts[token] = (counts[token] || 0) + 1; });
    return Object.keys(counts).some(function (token) { return counts[token] / tokens.length >= 0.6; });
  }

  function detectContradictions(text) {
    var contradictions = [];
    var detailed = firstMatch(text, [/\b(?:максимально\s+)?подробн\w*\b/i, /\bразвернут\w*\b/i]);
    var oneSentence = firstMatch(text, [/\b(?:одного|одним)\s+предложени\w*\b/i]);
    if (detailed && oneSentence) {
      contradictions.push(makeFinding(
        "detail-vs-one-sentence",
        "warning",
        "Противоречивый объем ответа",
        "Требование подробного отчета конфликтует с ограничением в одно предложение.",
        "Выберите один приоритет: подробный отчет или краткое резюме.",
        detailed.ranges.concat(oneSentence.ranges)
      ));
    }
    return contradictions;
  }

  function evaluateDimensions(normalized, options, contradictions, emptyShell) {
    var text = normalized.original.toLowerCase();
    var definitions = {};
    DIMENSIONS.forEach(function (definition) { definitions[definition.id] = definition; });
    var dimensions = [];

    var actionEvidence = collectSignals(text, [
      [/\b(?:проанализируй|проверь|сверь|сравни|подготовь|составь|извлеки|выдели|определи|найди|оцени|рассчитай|спланируй|сгруппируй|структурируй|дай)\b/i],
      [/\b(?:кажд\w*|все|по\s+каждому|только|исключи|включи)\b/i]
    ]);
    dimensions.push(makeDimension(definitions.action, scoreSignals(actionEvidence.length), actionEvidence));

    var purposeEvidence = collectSignals(text, [
      [/\bдля\s+(?:руковод\w*|клиент\w*|команд\w*|отдел\w*|заказчик\w*|сотрудник\w*)\b/i],
      [/\b(?:цель|чтобы|для\s+принятия|для\s+подготовки|помоги)\b/i],
      [/\b(?:в\s+рамках|по\s+проекту|по\s+договору|за\s+период)\b/i]
    ]);
    dimensions.push(makeDimension(definitions.purpose, scoreSignals(purposeEvidence.length), purposeEvidence));

    var dataEvidence = collectSignals(text, [
      [/\b(?:приложенн\w*|вложенн\w*|из\s+файла|на\s+основании\s+(?:таблиц\w*|документ\w*|договора))\b/i],
      [/\[[^\]\n]{3,}\]/],
      [/\b(?:данн\w*\s+ниже|в\s+таблице|в\s+документе|по\s+выборке)\b/i]
    ]);
    dimensions.push(makeDimension(definitions.data, scoreSignals(dataEvidence.length), dataEvidence));

    var outputEvidence = collectSignals(text, [
      [/\b(?:верни|подготовь|составь|выведи|оформи|дай)\b[^.!?\n]{0,50}\b(?:таблиц\w*|спис\w*|отчет\w*|заключени\w*|письм\w*|предложени\w*)\b/i],
      [/\b(?:колонк\w*|раздел\w*|пункт\w*|отдельн\w*\s+спис\w*)\b/i],
      [/\b(?:в\s+одном\s+предложени|краткое\s+резюме|структурированн\w*\s+вид)\b/i]
    ]);
    dimensions.push(makeDimension(definitions.output, scoreSignals(outputEvidence.length), outputEvidence));

    var criteriaEvidence = collectSignals(text, [
      [/\b(?:критери\w*|правил\w*|требовани\w*|услови\w*|ограничени\w*)\b/i],
      [/\b(?:дата|сумм\w*|контрагент\w*|срок\w*|пункт\w*|показател\w*|стоимост\w*)\b/i],
      [/\b(?:не\s+более|не\s+менее|только|исключи|включи|за\s+период)\b/i]
    ]);
    dimensions.push(makeDimension(definitions.criteria, scoreSignals(criteriaEvidence.length), criteriaEvidence));

    var verificationEvidence = collectSignals(text, [
      [/\b(?:сверь|сопоставь|проверь)\b\s+[^.!?\n]{0,40}\b(?:с|по)\b/i],
      [/\b(?:неопределен\w*|недостаточно\s+данных|укажи\s+сомнен\w*)\b/i],
      [/\b(?:ручн\w*\s+провер\w*|передай[^.!?\n]{0,30}специалист\w*|провер\w*\s+человек\w*)\b/i],
      [/\b(?:не\s+выноси|не\s+принимай)\s+окончательн\w*\b/i]
    ]);
    dimensions.push(makeDimension(definitions.verification, scoreSignals(verificationEvidence.length), verificationEvidence));

    var privacyEvidence = collectSignals(text, [
      [/\b(?:не\s+передавай|обезлич\w*|не\s+указывай\s+персональн\w*|скрой\s+идентификатор\w*)\b/i]
    ]);
    var identifierEvidence = collectSignals(text, [
      [/\b[\w.+-]+@[\w.-]+\.[a-zа-я]{2,}\b/i],
      [/(?:\+7|8)[\s()-]*\d{3}[\s()-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/i],
      [/\b\d{4}\s?\d{6}\b/]
    ]);
    var sensitiveDataType = options && (options.dataType === "personal" || options.dataType === "sensitive");
    var privacyScore = 100;
    if (sensitiveDataType && !privacyEvidence.length) privacyScore = 55;
    if (identifierEvidence.length) privacyScore = privacyEvidence.length ? 60 : 35;
    var allPrivacyEvidence = privacyEvidence.concat(identifierEvidence);
    if (!allPrivacyEvidence.length) allPrivacyEvidence.push({ phrase: "Явные идентификаторы не обнаружены", ranges: [] });
    dimensions.push(makeDimension(definitions.privacy, privacyScore, allPrivacyEvidence));

    var nextStepEvidence = collectSignals(text, [
      [/\b(?:задай\s+(?:уточняющие\s+)?вопрос\w*|укажи[^.!?\n]{0,30}(?:не\s+хватает|нужно\s+уточнить))\b/i],
      [/\b(?:ручн\w*\s+провер\w*|передай[^.!?\n]{0,30}специалист\w*|согласуй[^.!?\n]{0,30}(?:человек\w*|эксперт\w*))\b/i],
      [/\b(?:после\s+проверки|затем\s+(?:предложи|перейди))\b/i]
    ]);
    dimensions.push(makeDimension(definitions.nextStep, scoreSignals(nextStepEvidence.length), nextStepEvidence));

    var clarityEvidence = collectSignals(text, [
      [/\b(?:проанализируй|проверь|сверь|сравни|подготовь|составь|извлеки|выдели|определи|найди|оцени|дай)\b/i],
      [/\b(?:кажд\w*|отдельн\w*|по\s+каждому|с\s+колонками|за\s+период)\b/i],
      [/(?:^|\n)\s*(?:\d+[.)]|[-*])\s+/m]
    ]);
    var clarityScore = scoreSignals(clarityEvidence.length);
    if (contradictions.length) clarityScore -= 45;
    if (emptyShell.length || hasDominantRepeatedToken(normalized.tokens)) clarityScore -= 25;
    dimensions.push(makeDimension(definitions.clarity, clarityScore, clarityEvidence));

    return { dimensions: dimensions, identifierEvidence: identifierEvidence };
  }

  function findDimension(dimensions, id) {
    return dimensions.filter(function (item) { return item.id === id; })[0];
  }

  function qualityLevel(score) {
    if (score < 40) return "needs-rework";
    if (score < 60) return "draft";
    if (score < 75) return "usable";
    if (score < 90) return "strong";
    return "controlled";
  }

  function weightedQuality(dimensions, profile) {
    var qualityDimensions = dimensions.filter(function (item) { return item.id !== "privacy"; });
    var totalWeight = 0;
    var totalScore = 0;
    qualityDimensions.forEach(function (dimension) {
      var weight = profile.weights[dimension.id] || 1;
      totalWeight += weight;
      totalScore += dimension.score * weight;
    });
    return totalWeight ? totalScore / totalWeight : 0;
  }

  function findRange(text, patterns) {
    var match = firstMatch(text, patterns);
    return match ? match.ranges : [];
  }

  function countMatches(text, pattern) {
    var compiled = compileRussianPattern(pattern);
    var count = 0;
    var match;
    while ((match = compiled.exec(text))) {
      count += 1;
      if (!match[0].length) compiled.lastIndex += 1;
    }
    return count;
  }

  function analyze(text, options) {
    var normalized = normalize(text);
    var suppliedOptions = options || {};
    var classification = classify(normalized);
    var manualProfile = suppliedOptions.profile;
    var hasManualProfile = manualProfile && manualProfile !== "auto" && Object.prototype.hasOwnProperty.call(PROFILES, manualProfile);
    if (hasManualProfile) classification.overridden = true;
    var profileId = hasManualProfile ? manualProfile : classification.primary;
    var profile = PROFILES[profileId];
    var sourceText = normalized.original.toLowerCase();
    var emptyShell = findEmptyShell(normalized.original);
    var contradictions = detectContradictions(sourceText);
    var evaluation = evaluateDimensions(normalized, suppliedOptions, contradictions, emptyShell);
    var dimensions = evaluation.dimensions;
    var issues = [];
    var risks = [];
    var qualityPenalties = 0;
    var safetyPenalty = 0;

    profile.requiredDimensions.forEach(function (id) {
      var dimension = findDimension(dimensions, id);
      if (dimension.score < 45) {
        addUniqueFinding(issues, makeFinding(
          "missing-" + id,
          "warning",
          "Не хватает измерения: " + dimension.name,
          "Для профиля «" + profile.name + "» этот элемент нужен для управляемого результата.",
          dimension.recommendation,
          []
        ));
      }
    });

    if (emptyShell.length) {
      qualityPenalties += 20;
      addUniqueFinding(issues, makeFinding(
        "empty-shell",
        "warning",
        "Названия элементов не заполнены",
        "Названия разделов повторяют сами себя и не дают исполнителю рабочих сведений.",
        "Замените каждое название конкретным содержанием: объектом, данными, форматом или ограничением.",
        emptyShell
      ));
    }

    if (hasDominantRepeatedToken(normalized.tokens)) {
      qualityPenalties += 15;
      addUniqueFinding(issues, makeFinding(
        "repetitive-filler",
        "warning",
        "Повторяющийся текст не уточняет задачу",
        "Одно слово занимает большую часть запроса, но не добавляет действия, данных или критериев.",
        "Замените повторения конкретными сведениями о задаче.",
        []
      ));
    }

    contradictions.forEach(function (contradiction) {
      qualityPenalties += 12;
      addUniqueFinding(issues, contradiction);
    });

    var impossiblePrecisionRanges = findRange(sourceText, [
      /(?:\b100\s*%|\bсто\s+процентов)\s+[^.!?\n]{0,30}(?:точн\w*|гарантир\w*)/i,
      /(?:точн\w*|гарантир\w*)\s+[^.!?\n]{0,30}(?:прогноз\w*|вывод\w*|результат\w*)/i
    ]);
    if (impossiblePrecisionRanges.length) {
      qualityPenalties += 12;
      addUniqueFinding(issues, makeFinding(
        "impossible-precision",
        "warning",
        "Запрошена необоснованная точность",
        "Нельзя гарантировать точный вывод без проверяемых оснований и допущений.",
        "Укажите допустимую неопределенность и попросите раскрыть допущения.",
        impossiblePrecisionRanges
      ));
    }

    var fabricatedRanges = findRange(sourceText, [
      /\b(?:придумай|сфабрикуй|выдумай)\b[^.!?\n]{0,40}\b(?:источник\w*|ссылк\w*|цитат\w*|факт\w*|данн\w*)\b/i
    ]);
    if (fabricatedRanges.length) {
      qualityPenalties += 20;
      safetyPenalty += 30;
      addUniqueFinding(issues, makeFinding(
        "fabricated-sources",
        "critical",
        "Запрошено создание несуществующих оснований",
        "Придуманные источники, факты или данные делают результат недостоверным.",
        "Разрешите использовать только предоставленные или явно проверяемые источники.",
        fabricatedRanges
      ));
      addUniqueFinding(risks, makeFinding(
        "fabricated-sources",
        "critical",
        "Риск фабрикации",
        "Запрос предлагает выдать вымышленные сведения за основание для решения.",
        "Требуйте ссылки на реальные источники и помечайте непроверенные сведения.",
        fabricatedRanges
      ));
    }

    var actionCount = countMatches(sourceText, /\b(?:проанализируй|проверь|сверь|сравни|подготовь|составь|извлеки|выдели|определи|найди|оцени|рассчитай|спланируй|сгруппируй|структурируй|дай)\b/gi);
    if (actionCount >= 5) {
      qualityPenalties += 15;
      addUniqueFinding(issues, makeFinding(
        "task-overload",
        "warning",
        "В одном запросе слишком много действий",
        "Несколько несвязанных действий затрудняют проверку результата и приоритетов.",
        "Разделите запрос на последовательные шаги с отдельными результатами.",
        []
      ));
    }

    var unresolvedRanges = findRange(sourceText, [/\b(?:сделай\s+это|как\s+выше|эти\s+данные|данн\w*\s+ниже)\b/i]);
    if (unresolvedRanges.length && normalized.sections.length < 2) {
      qualityPenalties += 10;
      addUniqueFinding(issues, makeFinding(
        "unresolved-reference",
        "warning",
        "Ссылка на отсутствующий материал",
        "Запрос ссылается на данные или указания, которых в нем нет.",
        "Добавьте материал в запрос или укажите точный источник.",
        unresolvedRanges
      ));
    }

    var humanVerification = findDimension(dimensions, "verification").evidence.some(function (item) {
      return /ручн\w*\s+провер|специалист\w*|человек\w*/i.test(item.phrase);
    });
    var finalDecisionRanges = findRange(sourceText, [
      /\b(?:вынеси|прими|дай)\b[^.!?\n]{0,60}\b(?:окончательн\w*\s+решени\w*|вердикт\w*|приговор\w*)\b/i
    ]);
    var highStakes = Boolean(firstMatch(sourceText, [/\b(?:нарушени\w*|правов\w*|финансов\w*|медицин\w*|одобрени\w*|отказ\w*)\b/i]));
    if (finalDecisionRanges.length && highStakes && !humanVerification) {
      safetyPenalty += 55;
      addUniqueFinding(risks, makeFinding(
        "final-decision-without-human",
        "critical",
        "Окончательное решение без участия человека",
        "Высокозначимый вывод нельзя передавать модели без обязательной проверки специалистом.",
        "Попросите подготовить материалы и отметить основания для решения человека.",
        finalDecisionRanges
      ));
    }

    var highCost = suppliedOptions.errorCost === "high";
    var verification = findDimension(dimensions, "verification");
    if (highCost && (profileId === "audit" || profileId === "construction") && (verification.score < 45 || !humanVerification)) {
      safetyPenalty += 20;
      addUniqueFinding(issues, makeFinding(
        "missing-verification",
        "critical",
        "Для высокой цены ошибки нужна проверка человеком",
        "Профиль «" + profile.name + "» с высокой ценой ошибки требует оснований и ручной верификации.",
        "Добавьте проверку оснований, отметку неопределенности и обязательное решение специалиста.",
        []
      ));
    }

    if (evaluation.identifierEvidence.length) {
      safetyPenalty += 20;
      addUniqueFinding(risks, makeFinding(
        "sensitive-identifiers",
        "critical",
        "Обнаружены вероятные персональные идентификаторы",
        "В тексте есть адрес электронной почты, телефон или иной идентификатор, который не нужен для оценки качества инструкции.",
        "Удалите идентификаторы или замените их обезличенными значениями.",
        evaluation.identifierEvidence.reduce(function (ranges, item) { return ranges.concat(item.ranges); }, [])
      ));
    }

    var requiredMissing = profile.requiredDimensions.filter(function (id) { return findDimension(dimensions, id).score < 45; }).length;
    var qualityScore = weightedQuality(dimensions, profile);
    if (requiredMissing >= 3) qualityScore = Math.min(qualityScore, 39);
    else if (requiredMissing === 2) qualityScore = Math.min(qualityScore, 54);
    else if (requiredMissing === 1) qualityScore = Math.min(qualityScore, 69);
    qualityScore = Math.max(0, Math.floor(qualityScore - qualityPenalties));

    var safetyScore = Math.max(0, Math.floor(findDimension(dimensions, "privacy").score - safetyPenalty));
    var strengths = dimensions.filter(function (dimension) { return dimension.score >= 75 && dimension.id !== "privacy"; }).map(function (dimension) {
      return {
        id: dimension.id,
        title: dimension.name,
        detail: "Элемент подтвержден несколькими признаками в тексте.",
        ranges: dimension.evidence.reduce(function (ranges, item) { return ranges.concat(item.ranges); }, [])
      };
    });

    return {
      text: normalized,
      options: suppliedOptions,
      classification: classification,
      profile: profileId,
      qualityScore: qualityScore,
      safetyScore: safetyScore,
      level: qualityLevel(qualityScore),
      dimensions: dimensions,
      strengths: strengths,
      issues: issues,
      risks: risks,
      contradictions: contradictions
    };
  }

  return { PROFILES: PROFILES, normalize: normalize, classify: classify, analyze: analyze };
});
