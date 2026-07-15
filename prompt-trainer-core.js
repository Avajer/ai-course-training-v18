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
        { phrase: "аудит", weight: 4 }, { phrase: "нарушени", weight: 3 },
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
      if (!inCharacterClass && character === "\\" && next === "b") {
        index += 1;
        continue;
      }
      if (character === "\\" && next === "w") {
        compiled += inCharacterClass ? "\\p{L}\\p{N}_" : "[\\p{L}\\p{N}_]";
        index += 1;
        continue;
      }
      if (character === "[" && source.charAt(index - 1) !== "\\") inCharacterClass = true;
      if (character === "]" && source.charAt(index - 1) !== "\\") inCharacterClass = false;
      compiled += character;
    }
    var flags = pattern.flags;
    if (flags.indexOf("u") === -1) flags += "u";
    if (flags.indexOf("g") === -1) flags += "g";
    return {
      expression: new RegExp(compiled, flags),
      startsAtBoundary: source.slice(0, 2) === "\\b",
      endsAtBoundary: source.slice(-2) === "\\b"
    };
  }

  function isTokenCharacter(character) {
    return Boolean(character) && /^[\p{L}\p{N}_]$/u.test(character);
  }

  function hasTokenBoundary(text, index) {
    return isTokenCharacter(text.charAt(index - 1)) !== isTokenCharacter(text.charAt(index));
  }

  function findNextMatch(text, compiled) {
    var match;
    while ((match = compiled.expression.exec(text))) {
      var startsCorrectly = !compiled.startsAtBoundary || hasTokenBoundary(text, match.index);
      var endsCorrectly = !compiled.endsAtBoundary || hasTokenBoundary(text, match.index + match[0].length);
      if (startsCorrectly && endsCorrectly) return match;
      if (!match[0].length) compiled.expression.lastIndex += 1;
    }
    return null;
  }

  function firstMatchWhere(text, patterns, acceptsMatch) {
    for (var index = 0; index < patterns.length; index += 1) {
      var compiled = compileRussianPattern(patterns[index]);
      var match;
      while ((match = findNextMatch(text, compiled))) {
        if (!acceptsMatch || acceptsMatch(text, match.index, match)) {
          return {
            phrase: match[0],
            ranges: [{ start: match.index, end: match.index + match[0].length }]
          };
        }
      }
    }
    return null;
  }

  function firstMatch(text, patterns) {
    return firstMatchWhere(text, patterns, function () { return true; });
  }

  function isNegatedAt(text, index) {
    return /(?:^|[^\p{L}\p{N}_])не\s*$/u.test(text.slice(0, index));
  }

  function isNegatedDetailAt(text, index) {
    var context = text.slice(Math.max(0, index - 60), index);
    return /(?:^|[^\p{L}\p{N}_])не\s+(?:(?:долж[\p{L}\p{N}_]*|нужно|следует)\s+)?(?:быть\s+)?$/u.test(context);
  }

  function firstUnnegatedMatch(text, patterns) {
    return firstMatchWhere(text, patterns, function (source, index) { return !isNegatedAt(source, index); });
  }

  function firstUnnegatedDetailMatch(text, patterns) {
    return firstMatchWhere(text, patterns, function (source, index) { return !isNegatedDetailAt(source, index); });
  }

  function appendEvidence(target, evidence) {
    if (!target.some(function (item) {
      return item.ranges[0] && evidence.ranges[0]
        && item.ranges[0].start === evidence.ranges[0].start
        && item.ranges[0].end === evidence.ranges[0].end;
    })) target.push(evidence);
  }

  function collectIdentifierMatches(text, pattern, captureIndex, validator) {
    var evidence = [];
    var match;
    while ((match = pattern.exec(text))) {
      var phrase = match[captureIndex] || match[0];
      if (validator && !validator(phrase)) continue;
      var start = match.index + match[0].indexOf(phrase);
      appendEvidence(evidence, { phrase: phrase, ranges: [{ start: start, end: start + phrase.length }] });
    }
    return evidence;
  }

  function isLuhnValid(value) {
    var digits = value.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return false;
    var sum = 0;
    var shouldDouble = false;
    for (var index = digits.length - 1; index >= 0; index -= 1) {
      var digit = Number(digits.charAt(index));
      if (shouldDouble) digit = digit > 4 ? digit * 2 - 9 : digit * 2;
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  function isValidSnils(value) {
    var digits = value.replace(/\D/g, "");
    if (digits.length !== 11) return false;
    var sum = 0;
    for (var index = 0; index < 9; index += 1) sum += Number(digits.charAt(index)) * (9 - index);
    var remainder = sum % 101;
    var check = sum < 100 ? sum : remainder === 100 || remainder === 101 ? 0 : remainder;
    return check === Number(digits.slice(9));
  }

  function innCheckDigit(digits, weights) {
    var total = 0;
    weights.forEach(function (weight, index) { total += Number(digits.charAt(index)) * weight; });
    return total % 11 % 10;
  }

  function isValidInn(value) {
    var digits = value.replace(/\D/g, "");
    if (digits.length === 10) return innCheckDigit(digits, [2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(digits.charAt(9));
    if (digits.length === 12) {
      return innCheckDigit(digits, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(digits.charAt(10))
        && innCheckDigit(digits, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(digits.charAt(11));
    }
    return false;
  }

  function collectIdentifierEvidence(text) {
    var evidence = collectSignals(text, [
      [/\b[\w.+-]+@[\w.-]+\.[a-zа-я]{2,}\b/i],
      [/(?:\+7|8)[\s()-]*\d{3}[\s()-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/i]
    ]);
    var cardEvidence = collectIdentifierMatches(
      text,
      /(?:^|[^\p{L}\p{N}])((?:\d[ -]?){12,18}\d)(?=$|[^\p{L}\p{N}])/gu,
      1,
      isLuhnValid
    );
    var passportEvidence = collectIdentifierMatches(
      text,
      /(?:^|[^\p{L}\p{N}])((?:\d{2}[ -]){2}\d{6})(?=$|[^\p{L}\p{N}])/gu,
      1
    );
    var snilsEvidence = collectIdentifierMatches(
      text,
      /(?:^|[^\p{L}\p{N}])(\d{3}-\d{3}-\d{3}[ -]?\d{2})(?=$|[^\p{L}\p{N}])/gu,
      1,
      isValidSnils
    );
    var innEvidence = collectIdentifierMatches(
      text,
      /(?:^|[^\p{L}\p{N}])инн\s*[:№#-]?\s*(\d{10}|\d{12})(?!\d)/giu,
      1,
      isValidInn
    );
    cardEvidence.concat(passportEvidence, snilsEvidence, innEvidence).forEach(function (item) { appendEvidence(evidence, item); });
    return evidence;
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
    var detailed = firstUnnegatedDetailMatch(text, [/\b(?:максимально\s+)?подробн\w*\b/i, /\bразвернут\w*\b/i]);
    var oneSentence = firstMatch(text, [/\b(?:одного|одним)\s+предложени\w*\b/i]);
    var binaryOnly = firstMatch(text, [/\b(?:только|лишь)\s+(?:[«"]?да[»"]?\s+или\s+[«"]?нет[»"]?|да\s*\/\s*нет|yes\s*\/\s*no)(?=[^\p{L}\p{N}_]|$)/i]);
    var brief = firstMatch(text, [/\b(?:кратк\w*|лаконичн\w*|без\s+объяснен\w*)\b/i]);
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
    if (detailed && binaryOnly) {
      contradictions.push(makeFinding(
        "detail-vs-binary-answer",
        "warning",
        "Противоречивый формат ответа",
        "Ответ только «да» или «нет» не позволяет дать подробное обоснование.",
        "Выберите краткий бинарный ответ или разрешите отдельное обоснование.",
        detailed.ranges.concat(binaryOnly.ranges)
      ));
    } else if (detailed && brief && !oneSentence) {
      contradictions.push(makeFinding(
        "detail-vs-brief-answer",
        "warning",
        "Противоречивая детализация ответа",
        "Требование подробного ответа конфликтует с требованием краткости.",
        "Укажите, что важнее: полнота обоснования или краткость результата.",
        detailed.ranges.concat(brief.ranges)
      ));
    }
    return contradictions;
  }

  function isInstructionLine(line) {
    return /^(?:подготовь|составь|верни|выведи|оформи|проверь|сверь|сравни|проанализируй|дай)\s/i.test(line);
  }

  function hasReferencePayload(text, referenceRange) {
    var content = text.slice(referenceRange.end).replace(/^[\s:—-]+/, "");
    if (!content) return false;
    var lines = content.split("\n").map(function (line) { return line.trim(); }).filter(Boolean);
    return lines.some(function (line) {
      if (/^\[[^\]\n]{3,}\]$/.test(line)) return true;
      if (isInstructionLine(line)) return false;
      return /^[^:\n]{1,40}:\s*\S+/.test(line)
        || /\|/.test(line)
        || /\d/.test(line) && line.split(/\s+/).length >= 2;
    });
  }

  function hasHighStakesDomain(text) {
    return Boolean(firstMatch(text, [
      /\b(?:диагноз\w*|пациент\w*|лечени\w*|медицин\w*|терапи\w*)\b/i,
      /\b(?:правов\w*|судебн\w*|иск\w*|юридическ\w*)\b/i,
      /\b(?:финансов\w*|кредит\w*|займ\w*|налог\w*|платеж\w*)\b/i,
      /\b(?:нарушени\w*|аудит\w*|контрол\w*|провер\w*)\b/i,
      /\b(?:одобрени\w*|отказ(?:а|е|ом|у|ы|ать|ано|ан))\b/i
    ]));
  }

  function findHighStakesActionObject(text) {
    return firstMatch(text, [
      /\b(?:поставь|определи|подтверди)\b[^.!?\n]{0,45}\bдиагноз\w*\b/i,
      /\bодобри\b[^.!?\n]{0,45}\b(?:выдач\w*\s+(?:кредит\w*|займ\w*)|кредит\w*|займ\w*)\b/i,
      /\bподтверди\b[^.!?\n]{0,45}\bнарушени\w*\s+контрол\w*\b/i,
      /\bпризнай\b[^.!?\n]{0,45}\bдоговор\w*\s+недействительн\w*\b/i
    ]);
  }

  function findUsableHumanReview(text) {
    var review = firstMatch(text, [
      /\b(?:ручн\w*\s+провер\w*|передай[^.!?\n]{0,30}специалист\w*|провер\w*\s+человек\w*)\b/i
    ]);
    if (!review) return null;
    var preceding = text.slice(Math.max(0, review.ranges[0].start - 30), review.ranges[0].start);
    return /(?:без|исключая|вместо)\s*$/i.test(preceding) ? null : review;
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
      [/\b(?:в\s+рамках|по\s+проекту|по\s+договору|за\s+период|для\s+внутренн\w*\s+(?:аудит\w*|контрол\w*)|для\s+аналитик\w*)\b/i]
    ]);
    dimensions.push(makeDimension(definitions.purpose, scoreSignals(purposeEvidence.length), purposeEvidence));

    var dataEvidence = collectSignals(text, [
      [/\b(?:приложенн\w*|вложенн\w*|из\s+файла|на\s+основании\s+(?:таблиц\w*|документ\w*|договора))\b/i],
      [/\[[^\]\n]{3,}\]/],
      [/\b(?:данн\w*\s+ниже|в\s+таблице|в\s+документе|по\s+выборке|(?:по|из)\s+(?:приложенн\w*\s+)?(?:таблиц\w*|документ\w*|договора|смет\w*|реестр\w*))\b/i]
    ]);
    dimensions.push(makeDimension(definitions.data, scoreSignals(dataEvidence.length), dataEvidence));

    var outputEvidence = collectSignals(text, [
      [/\b(?:верни|подготовь|составь|выведи|оформи|дай)\b[^.!?\n]{0,50}\b(?:таблиц\w*|спис\w*|отчет\w*|заключени\w*|письм\w*|предложени\w*|план\w*|сообщени\w*)\b/i],
      [/\b(?:колонк\w*|раздел\w*|пункт\w*|отдельн\w*\s+спис\w*)\b/i],
      [/\b(?:в\s+одном\s+предложени|краткое\s+резюме|структурированн\w*\s+вид)\b/i]
    ]);
    dimensions.push(makeDimension(definitions.output, scoreSignals(outputEvidence.length), outputEvidence));

    var criteriaEvidence = collectSignals(text, [
      [/\b(?:критери\w*|правил\w*|требовани\w*|услови\w*|ограничени\w*)\b/i],
      [/\b(?:дата|сумм\w*|контрагент\w*|срок\w*|пункт\w*|показател\w*|стоимост\w*|регламент\w*|лимит\w*|допуск\w*|объем\w*|гаранти\w*)\b/i],
      [/\b(?:не\s+более|не\s+менее|только|исключи|включи|за\s+период)\b/i]
    ]);
    dimensions.push(makeDimension(definitions.criteria, scoreSignals(criteriaEvidence.length), criteriaEvidence));

    var verificationEvidence = collectSignals(text, [
      [/\b(?:сверь|сопоставь|проверь)\b\s+[^.!?\n]{0,40}\b(?:с|по)\b/i],
      [/\b(?:неопределен\w*|недостаточно\s+данных|укажи\s+сомнен\w*)\b/i],
      [/\bне\s+(?:придумывай|выдумывай|добавляй)\s+[^.!?\n]{0,40}\b(?:факт\w*|данн\w*|источник\w*)\b/i],
      [/\b(?:не\s+выноси|не\s+принимай)\s+окончательн\w*\b/i]
    ]);
    var humanReviewEvidence = findUsableHumanReview(text);
    if (humanReviewEvidence) verificationEvidence.push(humanReviewEvidence);
    dimensions.push(makeDimension(definitions.verification, scoreSignals(verificationEvidence.length), verificationEvidence));

    var privacyEvidence = collectSignals(text, [
      [/\b(?:не\s+передавай|обезлич\w*|не\s+указывай\s+персональн\w*|скрой\s+идентификатор\w*)\b/i]
    ]);
    var identifierEvidence = collectIdentifierEvidence(text);
    var sensitiveDataType = options && (options.dataType === "personal" || options.dataType === "sensitive");
    var privacyScore = 100;
    if (sensitiveDataType && !privacyEvidence.length) privacyScore = 55;
    if (identifierEvidence.length) privacyScore = privacyEvidence.length ? 60 : 35;
    var allPrivacyEvidence = privacyEvidence.concat(identifierEvidence);
    if (!allPrivacyEvidence.length) allPrivacyEvidence.push({ phrase: "Явные идентификаторы не обнаружены", ranges: [] });
    dimensions.push(makeDimension(definitions.privacy, privacyScore, allPrivacyEvidence));

    var nextStepEvidence = collectSignals(text, [
      [/\b(?:задай\s+(?:уточняющие\s+)?вопрос\w*|укажи[^.!?\n]{0,30}(?:не\s+хватает|нужно\s+уточнить)|при\s+(?:нехватке|отсутствии)\s+данных\s+(?:задай|укажи)|предложи\s+(?:вопрос|следующ\w*\s+шаг))\b/i],
      [/\b(?:ручн\w*\s+провер\w*|передай[^.!?\n]{0,30}специалист\w*|согласуй[^.!?\n]{0,30}(?:человек\w*|эксперт\w*))\b/i],
      [/\b(?:после\s+проверки|затем\s+(?:предложи|перейди))\b/i]
    ]);
    dimensions.push(makeDimension(definitions.nextStep, scoreSignals(nextStepEvidence.length), nextStepEvidence));

    var clarityEvidence = collectSignals(text, [
      [/\b(?:проанализируй|проверь|сверь|сравни|подготовь|составь|извлеки|выдели|определи|найди|оцени|дай|спланируй|напиши)\b/i],
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

  function severityRank(severity) {
    return { critical: 3, warning: 2, info: 1 }[severity] || 0;
  }

  function priorityWeight(finding, profile) {
    var dimensionId = /^missing-(.+)$/.exec(finding.id);
    return dimensionId && profile.weights[dimensionId[1]] || 0;
  }

  function findPriorityFinding(analysis) {
    var profile = PROFILES[analysis.profile];
    var findings = analysis.issues.concat(analysis.risks).slice();
    findings.sort(function (left, right) {
      return severityRank(right.severity) - severityRank(left.severity)
        || priorityWeight(right, profile) - priorityWeight(left, profile)
        || left.id.localeCompare(right.id);
    });
    return findings[0] || null;
  }

  function composeCommentary(analysis) {
    var profile = PROFILES[analysis.profile];
    var strongest = analysis.dimensions.filter(function (dimension) {
      return dimension.id !== "privacy" && dimension.score >= 45;
    }).sort(function (left, right) {
      return right.score - left.score || left.name.localeCompare(right.name);
    }).slice(0, 2);
    var priority = findPriorityFinding(analysis);
    var summary = "Профиль «" + profile.name + "»: распознана задача " + profile.name.toLowerCase() + ".";
    var strengthsText = strongest.length
      ? "Уже заданы: " + strongest.map(function (dimension) { return dimension.name.toLowerCase(); }).join("; ") + "."
      : "Пока нет измерений, подтвержденных достаточными признаками.";
    var priorityText = priority
      ? "Приоритетный пробел: " + priority.title + ". " + priority.detail
      : "Приоритетных пробелов по текущим правилам не обнаружено.";
    var nextStepText = priority
      ? "Следующее изменение: " + priority.recommendation
      : "Следующее изменение: сохраните текущую структуру и проверьте, достаточно ли исходных данных.";
    return {
      summary: summary,
      strengthsText: strengthsText,
      priorityText: priorityText,
      nextStepText: nextStepText
    };
  }

  function missingField(profile, dimensionId) {
    var labels = {
      action: "Конкретное действие и объект работы",
      purpose: "Цель, адресат и рабочий контекст",
      data: "Исходные материалы или точный источник",
      output: "Вид результата и обязательные части",
      criteria: "Критерии проверки, границы и допустимые расхождения",
      verification: "Порядок отметки неопределенности и ручной проверки",
      privacy: "Правила работы с идентификаторами и персональными данными",
      nextStep: "Действие при нехватке данных или после проверки",
      clarity: "Однозначная формулировка требований"
    };
    return "[" + labels[dimensionId] + " для профиля «" + profile.name + "»]";
  }

  function collectFactualFragments(source) {
    var facts = [];
    var addMatches = function (pattern, captureIndex) {
      collectIdentifierMatches(source, pattern, captureIndex).forEach(function (evidence) {
        var range = evidence.ranges[0];
        facts.push({ phrase: evidence.phrase, start: range.start });
      });
    };
    [
      [/(?:^|[^\p{L}\p{N}_])((?:акт|договор|отчет|смета|приложение|письмо|счет|накладная)\s+(?:№\s*)?[A-Za-zА-Яа-яЁё]+\s*[-–]?\s*\d+(?:[-/]\d+)?)(?=$|[^\p{L}\p{N}_])/giu, 1],
      [/(?:^|[^\p{L}\p{N}_])((?:КС|ОС|СМР)-\d+)(?=$|[^\p{L}\p{N}_])/giu, 1],
      [/(?:^|[^\p{L}\p{N}_])(\d{1,2}\.\d{1,2}\.\d{4})(?=$|[^\p{L}\p{N}_])/gu, 1],
      [/(?:^|[^\p{L}\p{N}_])(\d{1,3}(?:[ \u00a0]\d{3})*(?:[,.]\d{2})?\s*(?:руб\.?|₽|долл[\p{L}\p{N}_]*|евро))(?=$|[^\p{L}\p{N}_])/giu, 1]
    ].forEach(function (definition) {
      addMatches(definition[0], definition[1]);
    });
    facts.sort(function (left, right) { return left.start - right.start || right.phrase.length - left.phrase.length; });
    return facts.filter(function (fact, index) {
      return !facts.slice(0, index).some(function (previous) {
        return fact.start >= previous.start && fact.start < previous.start + previous.phrase.length;
      });
    }).map(function (fact) { return fact.phrase; });
  }

  function improve(text, analysis, options) {
    var source = text === undefined || text === null ? "" : String(text);
    var effectiveAnalysis = analysis && analysis.dimensions && analysis.profile ? analysis : analyze(source, options);
    var profile = PROFILES[effectiveAnalysis.profile];
    var insertedFields = profile.requiredDimensions.filter(function (id) {
      return findDimension(effectiveAnalysis.dimensions, id).score < 45;
    }).map(function (id) {
      return missingField(profile, id);
    });
    var preservedFacts = collectFactualFragments(source);
    var fieldsText = insertedFields.length
      ? "\n\nПоля для заполнения:\n" + insertedFields.map(function (field) { return "- " + field; }).join("\n")
      : "";
    return {
      concise: source + fieldsText,
      full: "Исходная задача:\n" + source + fieldsText,
      insertedFields: insertedFields,
      preservedFacts: preservedFacts
    };
  }

  function compare(before, after) {
    var afterById = {};
    after.dimensions.forEach(function (dimension) { afterById[dimension.id] = dimension; });
    var dimensionDeltas = before.dimensions.map(function (dimension) {
      var afterDimension = afterById[dimension.id];
      var afterScore = afterDimension ? afterDimension.score : 0;
      return {
        id: dimension.id,
        name: dimension.name,
        before: dimension.score,
        after: afterScore,
        delta: afterScore - dimension.score
      };
    });
    return {
      qualityDelta: after.qualityScore - before.qualityScore,
      safetyDelta: after.safetyScore - before.safetyScore,
      dimensionDeltas: dimensionDeltas,
      improved: dimensionDeltas.filter(function (item) { return item.delta > 0; }),
      regressed: dimensionDeltas.filter(function (item) { return item.delta < 0; })
    };
  }

  function findRange(text, patterns) {
    var match = firstMatch(text, patterns);
    return match ? match.ranges : [];
  }

  function countMatches(text, pattern) {
    var compiled = compileRussianPattern(pattern);
    var count = 0;
    var match;
    while ((match = findNextMatch(text, compiled))) {
      count += 1;
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

    var impossiblePrecision = firstUnnegatedMatch(sourceText, [
      /(?:\b100\s*%|\bсто\s+процентов)\s+[^.!?\n]{0,30}(?:точн\w*|гарантир\w*)/i,
      /\b(?:прогноз\w*|предсказани\w*|оценк\w*|вывод\w*)\b[^.!?\n]{0,30}\bточност\w*\b\s*(?:в\s*)?(?:100\s*%|сто\s+процент\w*)/i,
      /\b(?:точн\w*|гарантир\w*)\b\s+[^.!?\n]{0,30}(?:прогноз\w*|вывод\w*|результат\w*)/i
    ]);
    var impossiblePrecisionRanges = impossiblePrecision ? impossiblePrecision.ranges : [];
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
      /\b(?:придумай|сфабрикуй|выдумай)\b[^.!?\n]{0,40}\b(?:источник\w*|ссылк\w*|цитат\w*|факт\w*|данн\w*)\b/i,
      /\b(?:источник\w*|ссылк\w*|цитат\w*|факт\w*|данн\w*)\b[^.!?\n]{0,60}\b(?:придумать|придумай|выдумать|выдумай|сфабриковать|сфабрикуй)\b/i
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

    var unresolvedReference = firstMatch(sourceText, [/\b(?:сделай\s+это|как\s+выше|эти\s+данные|данн\w*\s+ниже)\b/i]);
    if (unresolvedReference && !hasReferencePayload(normalized.original, unresolvedReference.ranges[0])) {
      qualityPenalties += 10;
      addUniqueFinding(issues, makeFinding(
        "unresolved-reference",
        "warning",
        "Ссылка на отсутствующий материал",
        "Запрос ссылается на данные или указания, которых в нем нет.",
        "Добавьте материал в запрос или укажите точный источник.",
        unresolvedReference.ranges
      ));
    }

    var humanVerification = Boolean(findUsableHumanReview(sourceText));
    var finalDecision = firstMatch(sourceText, [
      /\b(?:вынеси|прими|дай|подтверди|определи|поставь|назначь|одобри|откажи)\b[^.!?\n]{0,60}\b(?:решени\w*|вердикт\w*|приговор\w*|диагноз\w*|лечени\w*|заключени\w*)\b/i
    ]);
    var highStakesActionObject = findHighStakesActionObject(sourceText);
    var highStakesFinal = highStakesActionObject || finalDecision && hasHighStakesDomain(sourceText);
    if (highStakesFinal && !humanVerification) {
      safetyPenalty += 55;
      addUniqueFinding(risks, makeFinding(
        "final-decision-without-human",
        "critical",
        "Окончательное решение без участия человека",
        "Высокозначимый вывод нельзя передавать модели без обязательной проверки специалистом.",
        "Попросите подготовить материалы и отметить основания для решения человека.",
        highStakesActionObject ? highStakesActionObject.ranges : finalDecision.ranges
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

    var analysis = {
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
    analysis.commentary = composeCommentary(analysis);
    return analysis;
  }

  return { PROFILES: PROFILES, normalize: normalize, classify: classify, analyze: analyze, improve: improve, compare: compare };
});
