/* ==========================================================================
   ИИ-ПРАКТИКУМ — слой расширений (features.js)
   Загружается ПОСЛЕ script.js. Работает на статике (GitHub Pages):
   тренажёр промптов, личная библиотека,
   карточки глоссария, поиск, диагностика, сертификат, онбординг,
   мобильное меню, радар результатов, конфетти.
   Любая ошибка в одном модуле не должна ронять базовый курс — всё в try.
   ========================================================================== */
(function () {
  "use strict";

  var COURSE_VERSION = "v70";
  var LS = {
    mylib: "aiCourseMyPrompts",
    tour: "aiCourseTourSeenV1",
    pretest: "aiCoursePretestDone",
    lastModule: "aiCourseLastModule"
  };

  /* ----------------- утилиты ----------------- */
  function esc(s) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(s);
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(m) { if (typeof window.showToast === "function") window.showToast(m); }
  function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  // Ключ, привязанный к текущему участнику: библиотека, резюме и диагностика
  // хранятся отдельно для каждого пользователя и не «перетекают» между людьми.
  function uKey(base) {
    try {
      var st = getState();
      var id = st && st.participant && st.participant.passwordHash ? st.participant.passwordHash : "";
      return id ? base + "::" + id : base;
    } catch (e) { return base; }
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function elFrom(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  /* ----------------- доступ к данным курса ----------------- */
  function getModules() { try { return Array.isArray(window.modules) ? window.modules : (typeof modules !== "undefined" ? modules : []); } catch (e) { return []; } }
  function getGlossary() { try { return typeof glossaryTerms !== "undefined" ? glossaryTerms : []; } catch (e) { return []; } }
  function getLibrary() { try { return typeof promptLibrary !== "undefined" ? promptLibrary : []; } catch (e) { return []; } }
  function getFinalQuestions() {
    try {
      var st = getState();
      if (st && Array.isArray(st.finalAttempt) && st.finalAttempt.length) return st.finalAttempt;
      return typeof finalQuestions !== "undefined" ? finalQuestions : [];
    } catch (e) { return []; }
  }
  function getState() { try { return typeof state !== "undefined" ? state : null; } catch (e) { return null; } }
  function authed() { try { return typeof isAuthenticated === "function" ? isAuthenticated() : false; } catch (e) { return false; } }

  /* =========================================================================
     1. УНИВЕРСАЛЬНАЯ ПАНЕЛЬ (overlay)
     ========================================================================= */
  var lastFocus = null;
  function openPanel(opts) {
    closePanel();
    lastFocus = document.activeElement;
    var overlay = elFrom(
      '<div class="feat-overlay ' + (opts.center ? "is-center" : "") + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
        '<div class="feat-panel' + (opts.panelClass ? ' ' + esc(opts.panelClass) : '') + '">' +
          '<div class="feat-panel-head">' +
            '<div><h3>' + esc(opts.title) + '</h3>' + (opts.subtitle ? '<p>' + esc(opts.subtitle) + '</p>' : "") + '</div>' +
            '<button class="feat-close" type="button" aria-label="Закрыть">✕</button>' +
          '</div>' +
          '<div class="feat-panel-body"></div>' +
        '</div>' +
      '</div>'
    );
    overlay.id = "featOverlay";
    var body = $(".feat-panel-body", overlay);
    if (typeof opts.content === "string") body.innerHTML = opts.content;
    else if (opts.content) body.appendChild(opts.content);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add("is-open"); });

    $(".feat-close", overlay).addEventListener("click", closePanel);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) closePanel(); });
    document.addEventListener("keydown", onPanelKey);
    if (typeof opts.onMount === "function") { try { opts.onMount(body, overlay); } catch (e) { console.error(e); } }
    var first = body.querySelector("input,textarea,button,select,a[href]");
    if (first) first.focus();
    return overlay;
  }
  function closePanel() {
    var overlay = $("#featOverlay");
    if (!overlay) return;
    document.removeEventListener("keydown", onPanelKey);
    document.body.classList.remove("feat-printing-cert");
    overlay.classList.remove("is-open");
    setTimeout(function () { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 240);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  function onPanelKey(e) {
    if (e.key === "Escape") { closePanel(); return; }
    if (e.key !== "Tab") return;
    var overlay = $("#featOverlay"); if (!overlay) return;
    var f = $all('a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])', overlay)
      .filter(function (n) { return n.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* =========================================================================
     2. ПРОФЕССИОНАЛЬНЫЙ ОФЛАЙН-ТРЕНАЖЁР ПРОМПТОВ
     ========================================================================= */
  function trainerProfileOptions(trainer) {
    return '<option value="auto">Автоматически</option>' + Object.keys(trainer.PROFILES).map(function (id) {
      return '<option value="' + esc(id) + '">' + esc(trainer.PROFILES[id].name) + '</option>';
    }).join("");
  }

  function trainerScoreClass(score) {
    return score >= 75 ? "is-good" : score >= 45 ? "is-warning" : "is-critical";
  }

  function trainerFindingHtml(items, className, title, emptyText) {
    var list = items || [];
    return '<section class="trainer-findings ' + className + '">' +
      '<h4>' + esc(title) + '</h4>' +
      (list.length ? '<ul>' + list.map(function (item) {
        return '<li class="severity-' + esc(item.severity || "info") + '">' +
          '<b>' + esc(item.title) + '</b>' +
          (item.detail ? '<span>' + esc(item.detail) + '</span>' : "") +
          (item.recommendation ? '<small>' + esc(item.recommendation) + '</small>' : "") +
        '</li>';
      }).join("") + '</ul>' : '<p class="trainer-empty">' + esc(emptyText) + '</p>') +
    '</section>';
  }

  function trainerEvidenceRanges(analysis) {
    var ranges = [];
    analysis.dimensions.forEach(function (dimension) {
      dimension.evidence.forEach(function (evidence) {
        (evidence.ranges || []).forEach(function (range) { ranges.push(range); });
      });
    });
    analysis.issues.concat(analysis.risks).forEach(function (finding) {
      (finding.ranges || []).forEach(function (range) { ranges.push(range); });
    });
    ranges = ranges.map(function (range) {
      return { start: Math.max(0, range.start), end: Math.max(0, range.end) };
    }).filter(function (range) { return range.end > range.start; });
    ranges.sort(function (left, right) { return left.start - right.start || right.end - left.end; });
    return ranges.filter(function (range, index) {
      return !ranges.slice(0, index).some(function (previous) {
        return range.start >= previous.start && range.end <= previous.end;
      });
    });
  }

  function trainerHighlightedText(text, analysis) {
    var source = String(text || "");
    var ranges = trainerEvidenceRanges(analysis);
    var cursor = 0;
    var html = "";
    ranges.forEach(function (range) {
      var start = Math.max(cursor, Math.min(source.length, range.start));
      var end = Math.max(start, Math.min(source.length, range.end));
      if (start > cursor) html += esc(source.slice(cursor, start));
      if (end > start) html += '<mark>' + esc(source.slice(start, end)) + '</mark>';
      cursor = Math.max(cursor, end);
    });
    if (cursor < source.length) html += esc(source.slice(cursor));
    return html || '<span class="trainer-empty">Введите промпт, чтобы увидеть найденные признаки.</span>';
  }

  function trainerDimensionsHtml(dimensions) {
    return dimensions.map(function (dimension) {
      return '<div class="trainer-dimension ' + trainerScoreClass(dimension.score) + '">' +
        '<div><b>' + esc(dimension.name) + '</b><span>' + dimension.score + '/100</span></div>' +
        '<div class="trainer-dimension-bar" role="img" aria-label="' + esc(dimension.name) + ': ' + dimension.score + ' из 100">' +
          '<i style="width:' + dimension.score + '%"></i>' +
        '</div>' +
        '<small>' + esc(dimension.recommendation) + '</small>' +
      '</div>';
    }).join("");
  }

  function trainerComparisonHtml(before, after, comparison) {
    var delta = function (value) { return (value > 0 ? "+" : "") + value; };
    var changed = comparison.dimensionDeltas.filter(function (item) { return item.delta !== 0; }).slice(0, 6);
    return '<section class="trainer-compare" aria-label="Сравнение до и после">' +
      '<h4>До улучшения и после</h4>' +
      '<div class="trainer-compare-grid">' +
        '<div><span>До улучшения</span><b>' + before.qualityScore + '</b><small>качество · ' + before.safetyScore + ' безопасность</small></div>' +
        '<div><span>После улучшения</span><b>' + after.qualityScore + '</b><small>качество · ' + after.safetyScore + ' безопасность</small></div>' +
        '<div><span>Изменение</span><b>' + delta(comparison.qualityDelta) + '</b><small>' + delta(comparison.safetyDelta) + ' к безопасности</small></div>' +
      '</div>' +
      (changed.length ? '<ul>' + changed.map(function (item) {
        return '<li><span>' + esc(item.name) + '</span><b>' + item.before + ' → ' + item.after + ' (' + delta(item.delta) + ')</b></li>';
      }).join("") + '</ul>' : '<p class="trainer-empty">Оценки измерений пока не изменились.</p>') +
    '</section>';
  }

  function renderTrainerResult(box, trainer, view, actions) {
    var analysis = view.analysis;
    var commentary = analysis.commentary;
    var profile = trainer.PROFILES[analysis.profile];
    var selectedText = view.improved[view.variant];
    box.className = "feat-sandbox-result trainer-result " + (view.mode === "compact" ? "is-compact" : "is-educational");
    box.innerHTML =
      '<section class="trainer-overview">' +
        '<div class="trainer-score-grid">' +
          '<div class="trainer-score ' + trainerScoreClass(analysis.qualityScore) + '"><span>Качество</span><b>' + analysis.qualityScore + '</b><small>' + esc(analysis.level) + '</small></div>' +
          '<div class="trainer-score ' + trainerScoreClass(analysis.safetyScore) + '"><span>Безопасность</span><b>' + analysis.safetyScore + '</b><small>' + (analysis.risks.length ? "есть риски" : "критичных рисков нет") + '</small></div>' +
          '<div class="trainer-score"><span>Профиль</span><b class="trainer-profile-name">' + esc(profile.name) + '</b><small>' + (analysis.classification.overridden ? "выбран вручную" : "определен автоматически") + '</small></div>' +
        '</div>' +
      '</section>' +
      '<section class="trainer-commentary">' +
        '<h4>Комментарий по контексту</h4>' +
        '<p>' + esc(commentary.summary) + '</p>' +
        '<p>' + esc(commentary.strengthsText) + '</p>' +
        '<p><b>' + esc(commentary.priorityText) + '</b></p>' +
        '<p>' + esc(commentary.nextStepText) + '</p>' +
      '</section>' +
      '<section class="trainer-dimensions"><h4>Измерения качества</h4>' + trainerDimensionsHtml(analysis.dimensions) + '</section>' +
      '<section class="trainer-highlight"><h4>Признаки в исходном промпте</h4><p>' + trainerHighlightedText(view.source, analysis) + '</p></section>' +
      '<div class="trainer-findings-grid">' +
        trainerFindingHtml(analysis.strengths, "trainer-strengths", "Сильные стороны", "Пока нет измерений с устойчивыми признаками.") +
        trainerFindingHtml(analysis.issues, "trainer-issues", "Приоритетные улучшения", "Существенных пробелов не найдено.") +
        trainerFindingHtml(analysis.risks, "trainer-risks", "Риски", "Критичных рисков не найдено.") +
      '</div>' +
      '<section class="trainer-improved">' +
        '<div class="trainer-improved-head"><h4>Улучшенный промпт</h4>' +
          '<div class="trainer-improve-tabs" role="tablist" aria-label="Версия улучшенного промпта">' +
            '<button type="button" role="tab" data-trainer-version="concise" aria-selected="' + (view.variant === "concise") + '" tabindex="' + (view.variant === "concise" ? "0" : "-1") + '">Краткая версия</button>' +
            '<button type="button" role="tab" data-trainer-version="full" aria-selected="' + (view.variant === "full") + '" tabindex="' + (view.variant === "full" ? "0" : "-1") + '">Полная версия</button>' +
          '</div>' +
        '</div>' +
        '<pre role="tabpanel" tabindex="0">' + esc(selectedText) + '</pre>' +
        '<div class="trainer-improved-actions">' +
          '<button class="feat-mini-btn" type="button" data-trainer-copy>Копировать</button>' +
          '<button class="feat-mini-btn" type="button" data-trainer-replace>Заменить исходный</button>' +
          '<button class="feat-mini-btn" type="button" data-trainer-recheck>Проверить снова</button>' +
        '</div>' +
      '</section>' +
      trainerComparisonHtml(view.compareBefore, view.compareAfter, view.comparison);

    $all("[data-trainer-version]", box).forEach(function (tab) {
      tab.addEventListener("click", function () { actions.selectVersion(tab.getAttribute("data-trainer-version")); });
      tab.addEventListener("keydown", function (event) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        actions.selectVersion(view.variant === "concise" ? "full" : "concise", true);
      });
    });
    $("[data-trainer-copy]", box).addEventListener("click", function () {
      copyText(selectedText);
      toast("Улучшенный промпт скопирован.");
    });
    $("[data-trainer-replace]", box).addEventListener("click", actions.replace);
    $("[data-trainer-recheck]", box).addEventListener("click", actions.recheck);
  }

  function openSandbox(prefill) {
    var content =
      '<div class="trainer-input-block">' +
        '<label class="feat-section-label" for="sbInput">Ваш промпт</label>' +
        '<textarea class="feat-field feat-prompt-field" id="sbInput" placeholder="Опишите рабочую задачу, исходные данные, требования и ограничения.">' + esc(prefill || "") + '</textarea>' +
      '</div>' +
      '<div class="trainer-controls">' +
        '<label for="sbProfile"><span>Профиль задачи</span><select class="feat-input" id="sbProfile"></select></label>' +
        '<label for="sbErrorCost"><span>Цена ошибки</span><select class="feat-input" id="sbErrorCost"><option value="low">Низкая</option><option value="medium" selected>Средняя</option><option value="high">Высокая</option></select></label>' +
        '<label for="sbDataType"><span>Тип данных</span><select class="feat-input" id="sbDataType"><option value="public">Публичные</option><option value="internal" selected>Внутренние</option><option value="personal">Персональные</option><option value="sensitive">Чувствительные</option></select></label>' +
        '<label for="sbMode"><span>Режим объяснения</span><select class="feat-input" id="sbMode"><option value="educational" selected>Подробный</option><option value="compact">Компактный</option></select></label>' +
      '</div>' +
      '<p class="trainer-privacy-note">Анализ выполняется на этом устройстве. Текст промпта не отправляется в сеть.</p>' +
      '<div class="feat-actions">' +
        '<button class="feat-btn" id="sbCheck" type="button">Проверить и улучшить</button>' +
        '<button class="feat-btn sec" id="sbSave" type="button">В мою библиотеку</button>' +
      '</div>' +
      '<div id="sbResult" class="feat-sandbox-result" aria-live="polite"></div>' +
      '<section id="sbHistory" class="trainer-history" aria-label="История проверок"></section>';

    openPanel({
      title: "Профессиональный тренажер промптов",
      subtitle: "Оценка качества и безопасности для рабочих задач.",
      content: content,
      panelClass: "feat-panel-trainer",
      onMount: function (root) {
        var input = $("#sbInput", root);
        var result = $("#sbResult", root);
        var trainer = window.PromptTrainer;
        if (!trainer) {
          result.innerHTML = '<p class="feat-verdict">Тренажер временно недоступен. Остальные разделы курса продолжают работать.</p>';
          return;
        }
        $("#sbProfile", root).innerHTML = trainerProfileOptions(trainer);
        var session = { variant: "concise", current: null };

        function currentOptions() {
          return {
            profile: $("#sbProfile", root).value,
            errorCost: $("#sbErrorCost", root).value,
            dataType: $("#sbDataType", root).value
          };
        }

        function runTrainer(compareFrom) {
          var source = input.value;
          var options = currentOptions();
          var analysis = trainer.analyze(source, options);
          var improved = trainer.improve(source, analysis, options);
          var preview = trainer.analyze(improved[session.variant], options);
          var before = compareFrom || analysis;
          var after = compareFrom ? analysis : preview;
          var view = {
            source: source,
            options: options,
            mode: $("#sbMode", root).value,
            variant: session.variant,
            analysis: analysis,
            improved: improved,
            compareBefore: before,
            compareAfter: after,
            comparison: trainer.compare(before, after)
          };
          session.current = view;
          renderTrainerResult(result, trainer, view, {
            selectVersion: function (variant, focusTab) {
              session.variant = variant;
              runTrainer(null);
              if (focusTab) $("[data-trainer-version=\"" + variant + "\"]", result).focus();
            },
            replace: function () {
              input.value = session.current.improved[session.variant];
              input.focus();
              toast("Исходный промпт заменен улучшенной версией. Нажмите «Проверить снова».");
            },
            recheck: function () { runTrainer(session.current.analysis); }
          });
        }

        $("#sbCheck", root).addEventListener("click", function () { runTrainer(null); });
        $("#sbSave", root).addEventListener("click", function () { saveToMyLib(input.value); });
        ["#sbProfile", "#sbErrorCost", "#sbDataType", "#sbMode"].forEach(function (selector) {
          $(selector, root).addEventListener("change", function () { if (session.current) runTrainer(null); });
        });
        if (prefill) runTrainer(null);
      }
    });
  }

  /* =========================================================================
     3. ЛИЧНАЯ БИБЛИОТЕКА ПРОМПТОВ
     ========================================================================= */
  function saveToMyLib(text, title) {
    text = (text || "").trim();
    if (!text) { toast("Сначала напишите промпт."); return; }
    var lib = lsGet(uKey(LS.mylib), []);
    var t = title || prompt("Название промпта:", text.slice(0, 40));
    if (t === null) return;
    lib.unshift({ id: Date.now(), title: t || "Без названия", text: text, ts: new Date().toISOString() });
    lsSet(uKey(LS.mylib), lib);
    toast("Промпт сохранён в личную библиотеку.");
  }
  function openMyLib() {
    openPanel({
      title: "★ Моя библиотека промптов",
      subtitle: "Личные шаблоны. Хранятся в браузере. Можно выгрузить в файл и перенести.",
      content: '<div class="feat-actions">' +
        '<button class="feat-btn sec" id="mlAdd" type="button">+ Добавить</button>' +
        '<button class="feat-btn sec" id="mlExport" type="button">⬇ Экспорт</button>' +
        '<button class="feat-btn sec" id="mlImport" type="button">⬆ Импорт</button>' +
        '<input type="file" id="mlFile" accept="application/json" hidden></div>' +
        '<div class="feat-mylib" id="mlList"></div>',
      onMount: function (root) {
        renderMyLibList($("#mlList", root));
        $("#mlAdd", root).addEventListener("click", function () { saveToMyLib(prompt("Текст промпта:", "") || ""); renderMyLibList($("#mlList", root)); });
        $("#mlExport", root).addEventListener("click", exportMyLib);
        $("#mlImport", root).addEventListener("click", function () { $("#mlFile", root).click(); });
        $("#mlFile", root).addEventListener("change", function (e) { importMyLib(e.target.files[0], function () { renderMyLibList($("#mlList", root)); }); });
        root.addEventListener("click", function (e) {
          var del = e.target.closest("[data-ml-del]"); var cp = e.target.closest("[data-ml-copy]"); var snd = e.target.closest("[data-ml-send]");
          if (del) { var lib = lsGet(uKey(LS.mylib), []).filter(function (p) { return String(p.id) !== del.getAttribute("data-ml-del"); }); lsSet(uKey(LS.mylib), lib); renderMyLibList($("#mlList", root)); }
          if (cp) { copyText(cp.getAttribute("data-text")); toast("Скопировано."); }
          if (snd) { closePanel(); openSandbox(snd.getAttribute("data-text")); }
        });
      }
    });
  }
  function renderMyLibList(host) {
    var lib = lsGet(uKey(LS.mylib), []);
    if (!lib.length) { host.innerHTML = '<div class="feat-mylib-empty">Пока пусто. Сохраняйте удачные промпты из песочницы или из готовой библиотеки.</div>'; return; }
    host.innerHTML = lib.map(function (p) {
      var safe = esc(p.text);
      return '<div class="feat-mylib-card"><div class="row"><h4>' + esc(p.title) + '</h4>' +
        '<small>' + new Date(p.ts).toLocaleDateString("ru-RU") + '</small></div>' +
        '<pre>' + safe + '</pre>' +
        '<div class="row"><div style="display:flex;gap:.4rem;flex-wrap:wrap">' +
          '<button class="feat-mini-btn" data-ml-copy data-text="' + safe + '" type="button">Копировать</button>' +
          '<button class="feat-mini-btn" data-ml-send data-text="' + safe + '" type="button">В песочницу</button>' +
        '</div><button class="feat-mini-btn danger" data-ml-del="' + p.id + '" type="button">Удалить</button></div></div>';
    }).join("");
  }
  function exportMyLib() {
    var lib = lsGet(uKey(LS.mylib), []);
    if (!lib.length) { toast("Библиотека пуста."); return; }
    var blob = new Blob([JSON.stringify(lib, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "moi-prompty.json"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function importMyLib(file, done) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var arr = JSON.parse(r.result);
        if (!Array.isArray(arr)) throw new Error("bad");
        var lib = lsGet(uKey(LS.mylib), []);
        arr.forEach(function (p) { if (p && p.text) lib.unshift({ id: Date.now() + Math.random(), title: p.title || "Импорт", text: String(p.text), ts: p.ts || new Date().toISOString() }); });
        lsSet(uKey(LS.mylib), lib); toast("Импортировано: " + arr.length); done && done();
      } catch (e) { toast("Не удалось прочитать файл."); }
    };
    r.readAsText(file);
  }
  function copyText(t) {
    if (navigator.clipboard) { navigator.clipboard.writeText(t).catch(function () { fallbackCopy(t); }); }
    else fallbackCopy(t);
  }
  function fallbackCopy(t) {
    var f = document.createElement("textarea"); f.value = t; f.style.position = "fixed"; f.style.left = "-9999px";
    document.body.appendChild(f); f.select(); try { document.execCommand("copy"); } catch (e) {} f.remove();
  }

  /* =========================================================================
     4. КАРТОЧКИ ГЛОССАРИЯ (флеш-карты)
     ========================================================================= */
  function openFlashcards() {
    var terms = getGlossary().slice();
    if (!terms.length) { toast("Глоссарий недоступен."); return; }
    // перемешать
    for (var i = terms.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = terms[i]; terms[i] = terms[j]; terms[j] = tmp; }
    var idx = 0;
    openPanel({
      title: "🃏 Карточки глоссария",
      subtitle: "Нажмите на карточку, чтобы перевернуть. Повторяйте до уверенного ответа.",
      content: '<div class="feat-flash-stage">' +
        '<div class="feat-flash-progress" id="fcProg"></div>' +
        '<div class="feat-flash" id="fcCard"></div>' +
        '<div class="feat-flash-nav">' +
          '<button class="feat-btn sec" id="fcPrev" type="button">‹ Назад</button>' +
          '<button class="feat-btn" id="fcFlip" type="button">Перевернуть</button>' +
          '<button class="feat-btn sec" id="fcNext" type="button">Дальше ›</button>' +
        '</div></div>',
      onMount: function (root) {
        var card = $("#fcCard", root), prog = $("#fcProg", root);
        function draw() {
          var t = terms[idx];
          card.classList.remove("is-flipped");
          card.innerHTML = '<div class="feat-flash-inner">' +
            '<div class="feat-flash-face front"><span class="feat-flash-cat">' + esc(t.cat || "Термин") + '</span>' +
              '<span class="feat-flash-term">' + esc(t.term) + '</span><span class="feat-flash-tip">нажмите, чтобы увидеть определение</span></div>' +
            '<div class="feat-flash-face back"><span class="feat-flash-cat">' + esc(t.term) + '</span>' +
              '<span class="feat-flash-def">' + esc(t.def) + '</span></div></div>';
          prog.textContent = "Карточка " + (idx + 1) + " из " + terms.length;
        }
        function flip() { card.classList.toggle("is-flipped"); }
        card.addEventListener("click", flip);
        $("#fcFlip", root).addEventListener("click", flip);
        $("#fcPrev", root).addEventListener("click", function () { idx = (idx - 1 + terms.length) % terms.length; draw(); });
        $("#fcNext", root).addEventListener("click", function () { idx = (idx + 1) % terms.length; draw(); });
        draw();
      }
    });
  }

  /* =========================================================================
     5. ПОИСК ПО КУРСУ
     ========================================================================= */
  function buildSearchIndex() {
    var mods = getModules();
    var idx = [];
    mods.forEach(function (m, i) {
      idx.push({ i: i, where: "Блок " + (i + 1), what: m.title, hay: (m.title + " " + (m.goal || "")).toLowerCase() });
      (m.learn || []).forEach(function (l) { idx.push({ i: i, where: m.title, what: l, hay: l.toLowerCase() }); });
      (m.theory || []).forEach(function (p) { idx.push({ i: i, where: m.title, what: p, hay: p.toLowerCase() }); });
      (m.theorySections || []).forEach(function (s) { idx.push({ i: i, where: m.title, what: s.title + " — " + (s.body || ""), hay: (s.title + " " + (s.body || "")).toLowerCase() }); });
      (m.quiz || []).forEach(function (q) { idx.push({ i: i, where: m.title + " · тест", what: q.q, hay: q.q.toLowerCase() }); });
    });
    getGlossary().forEach(function (t) { idx.push({ i: -1, where: "Глоссарий", what: t.term + " — " + t.def, hay: (t.term + " " + t.def).toLowerCase(), glossary: true }); });
    return idx;
  }
  function openSearch() {
    var index = buildSearchIndex();
    openPanel({
      title: "🔎 Поиск по курсу",
      subtitle: "Темы, теория, вопросы тестов и термины глоссария.",
      content: '<input class="feat-search-input" id="scInput" placeholder="Например: галлюцинация, формат, обезличивание…" autocomplete="off">' +
        '<div class="feat-search-results" id="scOut"></div>',
      onMount: function (root) {
        var input = $("#scInput", root), out = $("#scOut", root);
        function run() {
          var q = input.value.trim().toLowerCase();
          if (q.length < 2) { out.innerHTML = '<p class="feat-search-empty">Введите минимум 2 символа.</p>'; return; }
          var hits = index.filter(function (it) { return it.hay.indexOf(q) !== -1; }).slice(0, 30);
          if (!hits.length) { out.innerHTML = '<p class="feat-search-empty">Ничего не найдено.</p>'; return; }
          out.innerHTML = hits.map(function (h) {
            var snippet = h.what.length > 160 ? h.what.slice(0, 160) + "…" : h.what;
            snippet = esc(snippet).replace(new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
            return '<button class="feat-result" type="button" data-go="' + h.i + '" data-glossary="' + (h.glossary ? 1 : 0) + '">' +
              '<span class="where">' + esc(h.where) + '</span><span class="what">' + snippet + '</span></button>';
          }).join("");
        }
        input.addEventListener("input", run);
        out.addEventListener("click", function (e) {
          var b = e.target.closest("[data-go]"); if (!b) return;
          closePanel();
          if (b.getAttribute("data-glossary") === "1") { if (typeof renderGlossary === "function") renderGlossary(); return; }
          var i = Number(b.getAttribute("data-go"));
          if (i >= 0 && typeof renderModule === "function") {
            if (authed()) renderModule(i); else toast("Войдите, чтобы открыть блок.");
          }
        });
        run();
      }
    });
  }

  /* =========================================================================
     6. ДИАГНОСТИКА (пре-тест) → рекомендация старта
     ========================================================================= */
  var PRETEST = [
    { q: "От чего сильнее всего зависит качество ответа ИИ?", o: ["От качества запроса", "От цвета интерфейса", "От длины названия файла"], a: 0, topic: "prompt" },
    { q: "Что обязательно делать с ответом ИИ по важной задаче?", o: ["Сразу отправлять", "Проверять факты и выводы", "Удалять примеры"], a: 1, topic: "verification" },
    { q: "Что можно отправлять во внешний ИИ-сервис?", o: ["Любые данные", "Обезличенный фрагмент без персональных данных", "Сканы паспортов"], a: 1, topic: "security" },
    { q: "Как выбирать нейросеть?", o: ["По задаче и критериям", "По громкому названию", "По первому совету"], a: 0, topic: "tools" },
    { q: "Сильный промпт обычно содержит…", o: ["Только вопрос", "Роль, задачу, контекст, формат и ограничения", "Случайные слова"], a: 1, topic: "prompt" },
    { q: "Первый ответ модели лучше считать…", o: ["Финальным результатом", "Черновиком для доработки", "Истиной в последней инстанции"], a: 1, topic: "prompt" }
  ];
  var TOPIC_TO_MODULE = { prompt: "prompt", verification: "verification", security: "security", tools: "tools" };
  function openPretest() {
    var answers = {};
    function body() {
      return '<p style="color:var(--muted);margin:0 0 .4rem">6 коротких вопросов помогут понять, с чего начать. Это не влияет на итоговый тест.</p>' +
        PRETEST.map(function (q, i) {
          return '<div class="feat-pretest-q"><p>' + (i + 1) + ". " + esc(q.q) + '</p>' +
            q.o.map(function (opt, oi) { return '<button class="feat-pretest-opt" type="button" data-q="' + i + '" data-o="' + oi + '">' + esc(opt) + '</button>'; }).join("") +
          '</div>';
        }).join("") +
        '<button class="feat-btn" id="ptDone" type="button">Показать рекомендацию</button>';
    }
    openPanel({
      title: "🎯 Диагностика: с чего начать",
      subtitle: "Быстрый вход в курс под ваш уровень.",
      content: body(),
      onMount: function (root) {
        root.addEventListener("click", function (e) {
          var opt = e.target.closest(".feat-pretest-opt");
          if (opt) {
            var qi = opt.getAttribute("data-q");
            $all('.feat-pretest-opt[data-q="' + qi + '"]', root).forEach(function (n) { n.classList.remove("is-picked"); });
            opt.classList.add("is-picked"); answers[qi] = Number(opt.getAttribute("data-o"));
          }
        });
        $("#ptDone", root).addEventListener("click", function () {
          var correct = 0, weak = {};
          PRETEST.forEach(function (q, i) { if (answers[i] === q.a) correct++; else weak[q.topic] = (weak[q.topic] || 0) + 1; });
          lsSet(uKey(LS.pretest), true);
          var pct = Math.round((correct / PRETEST.length) * 100);
          var weakTopic = Object.keys(weak).sort(function (a, b) { return weak[b] - weak[a]; })[0];
          var startId = correct >= 5 ? "formula" : (weakTopic && TOPIC_TO_MODULE[weakTopic]) || "intro";
          var mods = getModules();
          var startIdx = Math.max(0, mods.findIndex(function (m) { return m.id === startId; }));
          var startTitle = mods[startIdx] ? mods[startIdx].title : "Введение";
          var level = pct >= 84 ? "Уверенный старт" : pct >= 50 ? "Базовый уровень" : "Начинаем с основ";
          var body2 = $(".feat-panel-body");
          body2.innerHTML = '<div class="feat-pretest-result"><div class="big">' + pct + '%</div>' +
            '<strong>' + esc(level) + '</strong>' +
            '<p style="color:var(--muted)">Рекомендуем начать с блока: <b>' + esc(startTitle) + '</b>.' +
            (correct >= 5 ? " Базу вы уже знаете — можно сразу к формуле запроса и практике." : " Пройдите блоки по порядку и выполняйте практику после каждого.") + '</p>' +
            '<button class="feat-btn" id="ptGo" type="button">Открыть блок «' + esc(startTitle) + '»</button></div>';
          $("#ptGo", body2).addEventListener("click", function () {
            closePanel();
            if (authed() && typeof renderModule === "function") renderModule(startIdx);
            else toast("Зарегистрируйтесь или войдите, чтобы открыть блок.");
          });
        });
      }
    });
  }

  /* =========================================================================
     7. СЕРТИФИКАТ
     ========================================================================= */
  function computeFinalScore() {
    var st = getState(), fq = getFinalQuestions();
    if (!st || !fq.length) return null;
    var correct = fq.reduce(function (s, q, i) { return s + (Number(st.finalAnswers[i]) === q.answer ? 1 : 0); }, 0);
    var percent = Math.round((correct / fq.length) * 100);
    var byCat = fq.reduce(function (acc, q, i) {
      if (!acc[q.category]) acc[q.category] = { c: 0, t: 0 };
      acc[q.category].t++; if (Number(st.finalAnswers[i]) === q.answer) acc[q.category].c++;
      return acc;
    }, {});
    return { correct: correct, total: fq.length, percent: percent, byCat: byCat };
  }
  function certificateMarkSvg() {
    return '' +
      '<svg class="feat-cert-mark" viewBox="0 0 240 240" aria-hidden="true">' +
        '<defs>' +
          '<linearGradient id="certGold" x1="0" x2="1">' +
            '<stop offset="0%" stop-color="#d7b66a"/>' +
            '<stop offset="50%" stop-color="#f3df9e"/>' +
            '<stop offset="100%" stop-color="#b98d31"/>' +
          '</linearGradient>' +
          '<linearGradient id="certInk" x1="0" x2="1">' +
            '<stop offset="0%" stop-color="#1f2940"/>' +
            '<stop offset="100%" stop-color="#41547d"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<circle cx="120" cy="120" r="102" fill="none" stroke="url(#certGold)" stroke-width="4"/>' +
        '<circle cx="120" cy="120" r="88" fill="rgba(255,255,255,0.72)" stroke="rgba(39,56,92,0.16)" stroke-width="2"/>' +
        '<circle cx="120" cy="120" r="72" fill="none" stroke="rgba(39,56,92,0.12)" stroke-width="1.4" stroke-dasharray="3 7"/>' +
        '<path d="M120 46 137 88 182 92 148 122 158 166 120 142 82 166 92 122 58 92 103 88Z" fill="url(#certInk)" opacity="0.1"/>' +
        '<path d="M120 58 134 94 172 98 143 122 152 160 120 141 88 160 97 122 68 98 106 94Z" fill="none" stroke="url(#certGold)" stroke-width="3.2" stroke-linejoin="round"/>' +
        '<circle cx="120" cy="120" r="26" fill="#fff" stroke="url(#certGold)" stroke-width="2.6"/>' +
        '<text x="120" y="129" text-anchor="middle" font-family="Geologica, Onest, sans-serif" font-size="24" font-weight="800" fill="#22304c">AI</text>' +
        '<path d="M70 160c14 16 30 25 50 29" fill="none" stroke="url(#certGold)" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M170 160c-14 16-30 25-50 29" fill="none" stroke="url(#certGold)" stroke-width="3" stroke-linecap="round"/>' +
      '</svg>';
  }
  function certificateBackdropSvg() {
    return '' +
      '<svg class="feat-cert-watermark" viewBox="0 0 960 680" preserveAspectRatio="none" aria-hidden="true">' +
        '<defs>' +
          '<linearGradient id="certLineFade" x1="0" x2="1">' +
            '<stop offset="0%" stop-color="rgba(53,75,120,0)"/>' +
            '<stop offset="45%" stop-color="rgba(53,75,120,0.18)"/>' +
            '<stop offset="100%" stop-color="rgba(53,75,120,0)"/>' +
          '</linearGradient>' +
          '<radialGradient id="certGlow" cx="50%" cy="50%" r="55%">' +
            '<stop offset="0%" stop-color="rgba(216,186,108,0.26)"/>' +
            '<stop offset="100%" stop-color="rgba(216,186,108,0)"/>' +
          '</radialGradient>' +
        '</defs>' +
        '<rect x="0" y="0" width="960" height="680" fill="transparent"/>' +
        '<circle cx="790" cy="120" r="140" fill="url(#certGlow)"/>' +
        '<circle cx="150" cy="530" r="120" fill="url(#certGlow)" opacity="0.55"/>' +
        '<path d="M24 176c140-60 260-76 422-56 160 19 290 73 490 32" fill="none" stroke="url(#certLineFade)" stroke-width="1.3"/>' +
        '<path d="M12 502c178-56 341-56 518-8 152 42 268 44 418 0" fill="none" stroke="url(#certLineFade)" stroke-width="1.1"/>' +
        '<g stroke="rgba(43,61,101,0.12)" stroke-width="1.2" fill="none">' +
          '<circle cx="778" cy="122" r="94"/>' +
          '<circle cx="778" cy="122" r="66"/>' +
          '<circle cx="162" cy="540" r="84"/>' +
        '</g>' +
        '<g fill="rgba(43,61,101,0.12)">' +
          '<circle cx="254" cy="164" r="3.2"/>' +
          '<circle cx="314" cy="142" r="3.2"/>' +
          '<circle cx="358" cy="186" r="3.2"/>' +
          '<circle cx="680" cy="504" r="3.2"/>' +
          '<circle cx="726" cy="468" r="3.2"/>' +
          '<circle cx="782" cy="520" r="3.2"/>' +
        '</g>' +
      '</svg>';
  }
  function openCertificate() {
    var st = getState();
    var score = computeFinalScore();
    if (!st || !st.finalSubmitted || !score) { toast("Сертификат доступен после прохождения итогового теста."); return; }
    var name = (st.participant && st.participant.name) || "Участник курса";
    var dept = (st.participant && st.participant.department) || "";
    var date = new Date().toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
    var level = typeof getLevel === "function" ? getLevel(score.percent).split(".")[0] : "";
    var mods = getModules();
    var done = mods.filter(function (m) { return st.modules[m.id] && st.modules[m.id].submitted; }).length;
    var certId = "AI-" + String(score.percent).padStart(2, "0") + "-" + String(done).padStart(2, "0") + "-" + new Date().toISOString().slice(0, 10).replace(/-/g, "");
    var content =
      '<div class="feat-cert" id="certCard">' +
        certificateBackdropSvg() +
        '<div class="feat-cert-frame">' +
          '<span class="feat-cert-corner tl"></span><span class="feat-cert-corner tr"></span><span class="feat-cert-corner bl"></span><span class="feat-cert-corner br"></span>' +
          '<div class="feat-cert-topline">' +
            '<div class="feat-cert-chip">Именной сертификат</div>' +
            '<div class="feat-cert-code">№ ' + esc(certId) + '</div>' +
          '</div>' +
          '<div class="feat-cert-header">' +
            '<div class="feat-cert-hero">' + certificateMarkSvg() + '</div>' +
            '<div class="feat-cert-headcopy">' +
              '<div class="feat-cert-eyebrow">Практическая программа обучения</div>' +
              '<div class="feat-cert-title">ИИ-практикум для работников</div>' +
              '<p class="feat-cert-sub">Настоящий сертификат подтверждает успешное прохождение курса по практическому использованию нейросетей в рабочих задачах, включая постановку запросов, проверку результата и правила безопасной работы.</p>' +
            '</div>' +
          '</div>' +
          '<div class="feat-cert-award">' +
            '<div class="feat-cert-label">Выдан</div>' +
            '<div class="feat-cert-name">' + esc(name) + '</div>' +
            (dept ? '<p class="feat-cert-dept">' + esc(dept) + '</p>' : "") +
            '<p class="feat-cert-text">Участник подтвердил понимание базовых и продвинутых сценариев работы с ИИ, умение собирать проверяемые промпты и применять нейросети как инструмент профессионального усиления, а не замены ответственного решения.</p>' +
          '</div>' +
          '<div class="feat-cert-meta">' +
            '<div><strong>' + score.percent + '%</strong><span>результат диагностики</span></div>' +
            '<div><strong>' + done + "/" + mods.length + '</strong><span>пройдено блоков</span></div>' +
            '<div><strong>' + esc(date) + '</strong><span>дата выдачи</span></div>' +
          '</div>' +
          '<div class="feat-cert-footer">' +
            '<div class="feat-cert-sign">' +
              '<span class="feat-cert-line"></span>' +
              '<strong>Агван</strong>' +
              '<small>Автор и ведущий курса</small>' +
            '</div>' +
            '<div class="feat-cert-sign is-right">' +
              '<span class="feat-cert-line"></span>' +
              '<strong>' + esc(level || "Базовый уровень") + '</strong>' +
              '<small>Подтверждённый уровень прохождения</small>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="feat-actions"><button class="feat-btn" id="certPrint" type="button">🖨 Печать / сохранить в PDF</button>' +
      '<button class="feat-btn sec" id="certPng" type="button">⬇ Скачать картинкой</button></div>';
    openPanel({
      title: "🎓 Ваш сертификат",
      subtitle: "Печать → «Сохранить как PDF» даёт именной документ.",
      content: content,
      center: true,
      panelClass: "feat-panel-certificate",
      onMount: function (root) {
        $("#certPrint", root).addEventListener("click", function () {
          document.body.classList.add("feat-printing-cert");
          window.print();
          setTimeout(function () { document.body.classList.remove("feat-printing-cert"); }, 500);
        });
        $("#certPng", root).addEventListener("click", function () { certToPng($("#certCard", root), name); });
      }
    });
  }
  function certToPng(node, name) {
    // Рендер через SVG foreignObject → canvas (без внешних библиотек)
    try {
      var rect = node.getBoundingClientRect();
      var w = Math.ceil(rect.width), h = Math.ceil(rect.height);
      var clone = node.cloneNode(true);
      var css = collectCss();
      var html = '<div xmlns="http://www.w3.org/1999/xhtml" style="background:#fff">' + new XMLSerializer().serializeToString(clone) + '</div>';
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><foreignObject width="100%" height="100%"><style>' + css + '</style>' + html + '</foreignObject></svg>';
      var img = new Image();
      var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      img.onload = function () {
        var c = document.createElement("canvas"); c.width = w * 2; c.height = h * 2;
        var ctx = c.getContext("2d"); ctx.scale(2, 2); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0);
        c.toBlob(function (blob) {
          if (!blob) { toast("Не удалось создать картинку. Используйте печать в PDF."); return; }
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "sertifikat-" + (name || "kurs").replace(/\s+/g, "-").toLowerCase() + ".png"; a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        });
      };
      img.onerror = function () { toast("Не удалось создать картинку. Используйте печать в PDF."); };
      img.src = url;
    } catch (e) { toast("Не удалось создать картинку. Используйте печать в PDF."); }
  }
  function collectCss() {
    var out = "";
    try {
      for (var i = 0; i < document.styleSheets.length; i++) {
        var sheet = document.styleSheets[i];
        try { var rules = sheet.cssRules || []; for (var j = 0; j < rules.length; j++) out += rules[j].cssText + "\n"; } catch (e) {}
      }
    } catch (e) {}
    return out;
  }

  /* =========================================================================
     8. РАДАР РЕЗУЛЬТАТОВ + КОНФЕТТИ (обёртки render-функций)
     ========================================================================= */
  var CAT_LABELS = { prompt: "Промпты", security: "Безоп.", tools: "Инстр.", verification: "Проверка", docs: "Докум.", basics: "Основы" };
  function radarSvg(byCat) {
    var cats = Object.keys(byCat);
    if (cats.length < 3) return "";
    var cx = 100, cy = 100, R = 78, n = cats.length;
    function pt(i, r) { var ang = (Math.PI * 2 * i) / n - Math.PI / 2; return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]; }
    var rings = [0.33, 0.66, 1].map(function (f) {
      var p = cats.map(function (_, i) { return pt(i, R * f).join(","); }).join(" ");
      return '<polygon class="grid ' + (f < 1 ? "soft" : "") + '" points="' + p + '"/>';
    }).join("");
    var axes = cats.map(function (_, i) { var e = pt(i, R); return '<line class="grid soft" x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '"/>'; }).join("");
    var poly = cats.map(function (cat, i) { var v = byCat[cat]; var f = v.t ? v.c / v.t : 0; return pt(i, R * Math.max(0.05, f)).join(","); }).join(" ");
    var dots = cats.map(function (cat, i) { var v = byCat[cat]; var f = v.t ? v.c / v.t : 0; var p = pt(i, R * Math.max(0.05, f)); return '<circle class="pt" cx="' + p[0] + '" cy="' + p[1] + '" r="2.5"/>'; }).join("");
    var labels = cats.map(function (cat, i) {
      var p = pt(i, R + 14); var anchor = Math.abs(p[0] - cx) < 6 ? "middle" : (p[0] > cx ? "start" : "end");
      return '<text class="lbl" x="' + p[0] + '" y="' + (p[1] + 3) + '" text-anchor="' + anchor + '">' + esc(CAT_LABELS[cat] || cat) + '</text>';
    }).join("");
    return '<div class="feat-result-radar"><span class="feat-section-label">Профиль по темам</span>' +
      '<svg class="feat-radar-svg" viewBox="-42 -16 284 232" aria-label="Радар результатов по темам">' +
      rings + axes + '<polygon class="area" points="' + poly + '"/>' + dots + labels + '</svg></div>';
  }

  function fireConfetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var colors = ["#0d8b93", "#1668c9", "#0d8b93", "#b1832f", "#d8569c", "#8b5cf6"];
    var wrap = document.createElement("div"); wrap.className = "feat-confetti";
    for (var i = 0; i < 90; i++) {
      var p = document.createElement("i");
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (2.2 + Math.random() * 1.8) + "s";
      p.style.animationDelay = (Math.random() * 0.5) + "s";
      p.style.transform = "rotate(" + (Math.random() * 360) + "deg)";
      p.style.opacity = "0.9";
      wrap.appendChild(p);
    }
    document.body.appendChild(wrap);
    setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 4500);
  }

  /* =========================================================================
     9. ВЕРХНЯЯ ПАНЕЛЬ ИНСТРУМЕНТОВ + МОБИЛЬНОЕ МЕНЮ + SKIP-LINK
     ========================================================================= */
  function buildToolbar() {
    var topActions = $(".top-actions");
    if (!topActions || $("#featToolbar")) return;
    var bar = elFrom('<div class="feat-toolbar" id="featToolbar" aria-label="Инструменты курса"></div>');
    bar.innerHTML =
      '<button class="feat-chip-btn feat-resume-btn" id="ftResume" type="button" hidden><span class="ico">▶</span><span id="ftResumeTxt">Продолжить</span></button>' +
      '<button class="feat-chip-btn" id="ftSearch" type="button"><span class="ico">🔎</span>Поиск</button>' +
      '<button class="feat-chip-btn" id="ftSandbox" type="button"><span class="ico">🧪</span>Песочница</button>' +
      '<button class="feat-chip-btn" id="ftTrainer" type="button"><span class="ico">🎯</span>Диагностика</button>' +
      '<button class="feat-chip-btn" id="ftFlash" type="button"><span class="ico">🃏</span>Карточки</button>' +
      '<button class="feat-chip-btn" id="ftMyLib" type="button"><span class="ico">★</span>Мои промпты</button>' +
      '<button class="feat-chip-btn" id="ftCert" type="button"><span class="ico">🎓</span>Сертификат</button>' +
      '<span class="feat-version">сборка ' + COURSE_VERSION + '</span>';
    topActions.parentNode.insertBefore(bar, topActions.nextSibling);
    $("#ftSearch").addEventListener("click", openSearch);
    $("#ftSandbox").addEventListener("click", function () { openSandbox(""); });
    $("#ftTrainer").addEventListener("click", openPretest);
    $("#ftFlash").addEventListener("click", openFlashcards);
    $("#ftMyLib").addEventListener("click", openMyLib);
    $("#ftCert").addEventListener("click", openCertificate);
    $("#ftResume").addEventListener("click", function () {
      var t = resumeTarget(); if (t < 0) return;
      if (authed() && typeof renderModule === "function") renderModule(t); else toast("Войдите, чтобы продолжить.");
    });
    updateResume();
  }
  function resumeTarget() {
    var mods = getModules(), st = getState(); if (!mods.length || !st) return -1;
    var firstIncomplete = mods.findIndex(function (m) { return !(st.modules[m.id] && st.modules[m.id].submitted); });
    if (firstIncomplete >= 0) return firstIncomplete;
    var last = lsGet(uKey(LS.lastModule), 0);
    return Math.min(mods.length - 1, Math.max(0, last));
  }
  function updateResume() {
    var btn = $("#ftResume"); if (!btn) return;
    var mods = getModules(); var t = resumeTarget();
    if (!authed() || t < 0 || !mods[t]) { btn.hidden = true; return; }
    btn.hidden = false;
    var st = getState();
    var anyProgress = st && Object.keys(st.modules || {}).length > 0;
    $("#ftResumeTxt").textContent = (anyProgress ? "Продолжить: " : "Начать: ") + mods[t].title;
  }

  function buildMobileMenu() {
    if ($(".feat-menu-btn")) return;
    var btn = elFrom('<button class="feat-menu-btn" id="featMenuBtn" type="button" aria-label="Меню курса" aria-expanded="false">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>');
    var scrim = elFrom('<div class="feat-scrim" id="featScrim" aria-hidden="true"></div>');
    document.body.appendChild(scrim);
    document.body.appendChild(btn);
    function setOpen(v) { document.body.classList.toggle("nav-open", v); btn.setAttribute("aria-expanded", v ? "true" : "false"); }
    btn.addEventListener("click", function () { setOpen(!document.body.classList.contains("nav-open")); });
    scrim.addEventListener("click", function () { setOpen(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
    // закрывать при выборе блока/цели на мобильном
    var sidebar = $(".sidebar");
    if (sidebar) sidebar.addEventListener("click", function (e) { if (e.target.closest("button") && window.innerWidth <= 1120) setOpen(false); });
    window.addEventListener("resize", function () { if (window.innerWidth > 1120) setOpen(false); });
  }

  function buildSkipLink() {
    if ($(".skip-link")) return;
    var main = $(".course-main") || $("main");
    if (main && !main.id) main.id = "main";
    if (main) main.setAttribute("tabindex", "-1");
    var link = elFrom('<a class="skip-link" href="#' + (main ? main.id : "main") + '">К содержанию курса</a>');
    document.body.insertBefore(link, document.body.firstChild);
  }

  /* ----- динамические цифры на стартовом экране ----- */
  function updateHeroStats() {
    try {
      var stats = $all(".hero-stat strong");
      if (!stats.length) return;
      var mods = getModules();
      var totalQ = mods.reduce(function (s, m) { return s + ((m.quiz && m.quiz.length) || 0); }, 0) + getFinalQuestions().length;
      if (stats[0]) stats[0].textContent = mods.length;
      if (stats[1]) stats[1].textContent = totalQ;
      if (stats[2]) stats[2].textContent = getLibrary().length;
      if (stats[3]) stats[3].textContent = getGlossary().length;
    } catch (e) {}
  }

  /* =========================================================================
     10. ОНБОРДИНГ-ТУР (один раз)
     ========================================================================= */
  var TOUR = [
    { t: "Добро пожаловать 👋", b: "Это практический курс по работе с нейросетями. Слева — цели, прогресс и блоки. Проходите по порядку и выполняйте практику." },
    { t: "Тренажёр и песочница 🧪", b: "В любой момент откройте «Песочницу»: соберите промпт, получите оценку по 7 опорам, увидьте слабые места и скопируйте улучшенную заготовку." },
    { t: "Карточки и поиск 🔎", b: "Повторяйте термины во флеш-карточках, ищите по всему курсу и сохраняйте удачные промпты в личную библиотеку." },
    { t: "Сертификат 🎓", b: "После итогового теста получите именной сертификат — печать в PDF или картинкой. Готовы начать?" }
  ];
  function maybeTour() {
    if (lsGet(LS.tour, false)) return;
    var i = 0;
    var tour = elFrom('<div class="feat-tour" role="dialog" aria-modal="true" aria-label="Знакомство с курсом"><div class="feat-tour-card"></div></div>');
    document.body.appendChild(tour);
    var card = $(".feat-tour-card", tour);
    function draw() {
      var s = TOUR[i];
      card.innerHTML = '<span class="feat-tour-step">Шаг ' + (i + 1) + " из " + TOUR.length + '</span>' +
        '<h3>' + esc(s.t) + '</h3><p>' + esc(s.b) + '</p>' +
        '<div class="feat-tour-dots">' + TOUR.map(function (_, k) { return '<i class="' + (k === i ? "on" : "") + '"></i>'; }).join("") + '</div>' +
        '<div class="feat-tour-foot"><button class="feat-btn ghost" id="tourSkip" type="button">Пропустить</button>' +
        '<button class="feat-btn" id="tourNext" type="button">' + (i === TOUR.length - 1 ? "Начать" : "Дальше") + '</button></div>';
      $("#tourSkip", card).addEventListener("click", done);
      $("#tourNext", card).addEventListener("click", function () { if (i === TOUR.length - 1) done(); else { i++; draw(); } });
    }
    function done() { lsSet(LS.tour, true); if (tour.parentNode) tour.parentNode.removeChild(tour); }
    draw();
  }

  /* =========================================================================
     11. ОБЁРТКИ render-функций курса
     ========================================================================= */
  function wrapRenders() {
    // renderModule: инжект тренажёра в практику + трекинг последнего блока
    if (typeof renderModule === "function" && !renderModule.__wrapped) {
      var _rm = renderModule;
      renderModule = function (index) {
        var r = _rm.apply(this, arguments);
        try {
          lsSet(uKey(LS.lastModule), index);
          injectTrainerIntoModule(index);
          updateResume();
        } catch (e) { console.error(e); }
        return r;
      };
      renderModule.__wrapped = true;
    }
    // renderFinalResult: добавить радар и кнопку сертификата
    if (typeof renderFinalResult === "function" && !renderFinalResult.__wrapped) {
      var _fr = renderFinalResult;
      renderFinalResult = function () {
        var html = _fr.apply(this, arguments);
        try {
          var score = computeFinalScore();
          if (score) {
            html += radarSvg(score.byCat);
            html += '<button class="feat-inline-cta" type="button" onclick="window.__featCert&&window.__featCert()">🎓 Получить сертификат</button>';
          }
        } catch (e) { console.error(e); }
        return html;
      };
      renderFinalResult.__wrapped = true;
    }
    // submitFinal: конфетти при первом успешном завершении
    if (typeof submitFinal === "function" && !submitFinal.__wrapped) {
      var _sf = submitFinal;
      submitFinal = function () {
        var before = getState() && getState().finalSubmitted;
        var ret = _sf.apply(this, arguments);
        Promise.resolve(ret).then(function () {
          try { var st = getState(); if (st && st.finalSubmitted && !before) { fireConfetti(); updateResume(); } } catch (e) {}
        });
        return ret;
      };
      submitFinal.__wrapped = true;
    }
    window.__featCert = openCertificate;
  }

  function injectTrainerIntoModule(index) {
    var practice = $(".practice-box");
    if (!practice || $("#featTrainerCta", practice)) return;
    var mods = getModules(); var m = mods[index] || {};
    var cta = elFrom('<div id="featTrainerCta" style="margin-top:.8rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center">' +
      '<button class="feat-inline-cta" type="button" id="featOpenSb">🧪 Открыть тренажёр промптов</button>' +
      '<span style="font-size:.82rem;color:var(--soft)">Соберите промпт и получите мгновенную оценку по 7 опорам.</span></div>');
    practice.appendChild(cta);
    $("#featOpenSb", practice).addEventListener("click", function () {
      var seed = $(".practice-box textarea[data-practice]");
      openSandbox((seed && seed.value.trim()) || m.good || "");
    });
  }

  /* =========================================================================
     12. ИНИЦИАЛИЗАЦИЯ
     ========================================================================= */
  function init() {
    try { buildSkipLink(); } catch (e) { console.error(e); }
    try { buildMobileMenu(); } catch (e) { console.error(e); }
    try { buildToolbar(); } catch (e) { console.error(e); }
    try { updateHeroStats(); } catch (e) { console.error(e); }
    try { wrapRenders(); } catch (e) { console.error(e); }
    // если блок уже отрисован до обёртки — инжектим тренажёр в текущий
    try { if (typeof currentView !== "undefined" && currentView === "module") injectTrainerIntoModule(typeof currentModuleIndex !== "undefined" ? currentModuleIndex : 0); } catch (e) {}
    try { if (authed()) maybeTour(); } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
