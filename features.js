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

  var COURSE_VERSION = "v59";
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
     2. ТРЕНАЖЁР ПРОМПТОВ (эвристика, без сети)
     ========================================================================= */
  /* Примечание: \b в JS работает только для ASCII, поэтому для кириллицы
     границы слов не используем — опираемся на достаточно специфичные основы. */
  var PROMPT_ELEMENTS = [
    { key: "role", name: "Роль", hint: "Кем должна выступать модель: «Ты редактор деловых текстов…», «Действуй как аналитик…».",
      re: /(ты\s+(?:[а-яё]+\s+){0,3}(?:эксперт|аналитик|редактор|корректор|юрист|специалист|консультант|преподавател|методист|менеджер|аудитор|инспектор|секретар|копирайтер|маркетолог|ассистент|помощник|профессионал|переводчик|тренер|наставник|инженер|разработчик|программист|координатор|руководител|эйчар|hr|рекрут)|выступ(?:и|ай)\s+как|в\s+(?:рол[ие]|качестве)\s|действуй\s+как|представь,?\s+что\s+ты)/i },
    { key: "task", name: "Задача", hint: "Чёткое действие-глагол: проанализируй, составь, проверь, сравни, перепиши, резюмируй.",
      re: /(проанализируй|составь|напиши|сделай|проверь|сравни|сравнен|подготов|оцени|оцен|сформир|сформулир|выдели|выяв|перепиши|отредактир|резюмир|сократи|переведи|найди|разбер[иё]|разлож|объясни|предлож|сгенерир|создай|разработа|структурир|классифицир|извлеки|верни|построй|рассчита|посчита|опиши|придума|уточни|заполни|дополни|собери|спланир|распиши|помоги)/i },
    { key: "context", name: "Контекст / цель", hint: "Зачем это нужно и для кого: «цель — …», «аудитория — руководитель», «ситуация: …».",
      re: /(цел[ьяию]|контекст|ситуац|аудитори|адресат|тема[:\s]|объект[аыи]?\s+сравнен|для\s+(?:кого|чего|рабоч|реш|какого|руководител|клиент|совещан|отч[её]т|задач)|кто\s+будет\s+использ|желаем\S*\s+результат|период\s+прогноза|что\s+(?:известно|неизвестно)|мне\s+нужно|нам\s+нужно|у\s+меня\s+есть|чтобы\s)/i },
    { key: "data", name: "Исходные данные", hint: "Дай материал или место для него: «текст ниже», «документ: …» или поле в [квадратных скобках].",
      re: /(\[[^\]]{2,}\]|ниже|следующ(?:ий|ем|его)\s+(?:текст|документ|данны)|документ:|текст:|данные:|данных:|вставь|вставьте|приложен|на\s+основе\s+(?:текста|данных|документа|контекста))/i },
    { key: "format", name: "Формат результата", hint: "Как оформить ответ: таблица, список, по пунктам, отчёт, JSON, шаблон письма.",
      re: /(формат|в\s+виде|таблиц|матриц|схем[аыу]|диаграмм|спис(?:ок|ком|ка|ке)|по\s+пунктам|пунктам|структур|markdown|json|отч[её]т|нумерован|маркирован|шаблон|колонк|раздел[аыи]|по\s+шкале|чек-?лист|в\s+\d+\s+част)/i },
    { key: "style", name: "Стиль / тон", hint: "Тон и язык: деловой, нейтральный, кратко, простыми словами, официальный.",
      re: /(стил[ье]|тон[ае]?[:\s]|делов|официальн|нейтральн|кратк|лаконичн|простыми\s+словами|простым\s+язык|формальн|дружелюбн|сдержанн|вежлив|без\s+воды|понятн\S*\s+язык)/i },
    { key: "limits", name: "Ограничения / критерии", hint: "Рамки и контроль фактов: «не придумывай», «до 300 слов», «только проверенное», критерии качества.",
      re: /(не\s+(?:придумыв|выдумыв|добавляй|фантазир|выдавай|искажай|меняй\s+смысл|раскрыв)|если\s+(?:данных|информац)\S*\s+(?:недостаточно|нет)|ограничен|ограничь|ограничива|объ[её]м|до\s+\d+\s*(?:слов|символов|предложен|строк|вопрос)|не\s+более|только\s|без\s|критери|проверь\s+факт|требу\S+\s+(?:внешней\s+)?проверк|раздели\s+факт|уровень\s+неопредел|что\s+нельзя|укажи\s+(?:допущен|ограничен|уровень|что\s+нужно\s+уточнить))/i }
  ];

  function analyzePrompt(text) {
    var t = text || "";
    var found = PROMPT_ELEMENTS.map(function (el) { return { el: el, ok: el.re.test(t), weight: 12 }; });
    var okCount = found.filter(function (f) { return f.ok; }).length;
    var words = (t.trim().match(/\S+/g) || []).length;
    var chars = t.trim().length;
    var signals = [
      {
        key: "specific",
        name: "Конкретика",
        ok: /(\d+|период|срок|критери|порог|пример|раздел|таблиц|контрагент|сумм|документ|аудит|провер)/i.test(t),
        hint: "Добавьте период, объект, критерии, порог существенности или пример исходных данных."
      },
      {
        key: "verification",
        name: "Проверяемость",
        ok: /(проверь|сверь|укажи\s+основан|источник|цитат|факт|гипотез|допущен|неопредел|что\s+проверить)/i.test(t),
        hint: "Попросите отделить факты от гипотез и указать, что нужно проверить вручную."
      },
      {
        key: "privacy",
        name: "Безопасность данных",
        ok: /(обезлич|без\s+персональн|конфиденциальн|служебн|не\s+раскрыв|условн(?:ый|ые)\s+данн|замени\s+данные)/i.test(t),
        hint: "Если задача рабочая, явно задайте правило: использовать обезличенные или условные данные."
      },
      {
        key: "iteration",
        name: "Следующий шаг",
        ok: /(если\s+данных\s+недостаточно|задай\s+вопрос|уточни|сначала\s+спроси|предложи\s+улучшен|после\s+ответа|вариант\s+доработ)/i.test(t),
        hint: "Добавьте правило: если данных мало, сначала задать уточняющие вопросы."
      }
    ];
    var signalCount = signals.filter(function (s) { return s.ok; }).length;
    var baseScore = okCount * 12;
    var signalScore = signalCount * 4;
    var lengthScore = words >= 25 ? 8 : words >= 12 ? 4 : words >= 5 ? 2 : 0;
    var pct = Math.min(100, Math.round(baseScore + signalScore + lengthScore));
    var missing = found.filter(function (f) { return !f.ok; });
    var missingSignals = signals.filter(function (s) { return !s.ok; });
    var level = pct >= 86 ? "Сильный" : pct >= 68 ? "Рабочий" : pct >= 45 ? "Черновой" : "Слабый";
    return { found: found, okCount: okCount, words: words, chars: chars, pct: pct, level: level, missing: missing, signals: signals, signalCount: signalCount, missingSignals: missingSignals };
  }

  function trainerVerdict(pct, words) {
    if (words < 4) return "Слишком коротко — это похоже на вопрос, а не на рабочую инструкцию.";
    if (pct >= 86) return "Сильный рабочий промпт: задача, рамки и проверка заданы достаточно ясно.";
    if (pct >= 68) return "Рабочая основа. Добавьте недостающие опоры, чтобы ответ стал стабильнее.";
    if (pct >= 45) return "Промпт можно использовать как черновик, но результат будет зависеть от догадок ИИ.";
    return "Промпт расплывчатый. Соберите его по формуле: роль + задача + контекст + данные + формат + стиль + ограничения.";
  }

  function promptPriority(r) {
    var priority = [];
    ["task", "data", "format", "limits", "context", "role", "style"].forEach(function (key) {
      var miss = r.missing.find(function (f) { return f.el.key === key; });
      if (miss) priority.push(miss.el.hint);
    });
    r.missingSignals.slice(0, 2).forEach(function (s) { priority.push(s.hint); });
    if (r.words < 12) priority.unshift("Раскройте задачу минимум в 2-3 предложениях: что нужно сделать, с какими данными и для кого.");
    return priority.slice(0, 5);
  }

  function buildImprovedPrompt(text, r) {
    var clean = (text || "").trim();
    var has = function (key) { return r.found.some(function (f) { return f.el.key === key && f.ok; }); };
    var lines = [];
    lines.push(has("role") ? "Роль: используй роль, указанную в моем запросе." : "Роль: выступи как опытный специалист по [укажите сферу: аудит, контроль, финансы, документы].");
    lines.push(has("context") ? "Контекст: учитывай цель и адресата из моего запроса." : "Контекст: результат нужен для [адресат/ситуация], цель - [что должно быть принято или подготовлено].");
    lines.push(has("task") ? "Задача: выполни действие, указанное ниже." : "Задача: проанализируй / проверь / составь [что именно нужно сделать].");
    lines.push(has("data") ? "Исходные данные: используй только данные из запроса ниже." : "Исходные данные: [вставьте обезличенный текст, таблицу, перечень фактов или условия задачи].");
    lines.push(has("format") ? "Формат: сохрани требуемую структуру ответа." : "Формат результата: таблица или список с разделами: вывод, основания, риски, что проверить, рекомендации.");
    lines.push(has("style") ? "Стиль: соблюдай заданный тон." : "Стиль: деловой, краткий, без эмоциональных оценок и лишней воды.");
    lines.push(has("limits") ? "Ограничения: соблюдай указанные рамки и критерии." : "Ограничения: не придумывай факты; если данных недостаточно, укажи, что нужно уточнить; отделяй факт от предположения.");
    if (!r.signals.find(function (s) { return s.key === "verification"; }).ok) {
      lines.push("Проверка: в конце добавь список ручных проверок и спорных мест.");
    }
    if (!r.signals.find(function (s) { return s.key === "privacy"; }).ok) {
      lines.push("Безопасность: не используй персональные или конфиденциальные данные; работай с обезличенным примером.");
    }
    lines.push("");
    lines.push("Мой исходный запрос:");
    lines.push(clean || "[вставьте исходный запрос]");
    return lines.join("\n");
  }

  function renderTrainerResult(box, text) {
    var r = analyzePrompt(text);
    var priority = promptPriority(r);
    var improved = buildImprovedPrompt(text, r);
    box.innerHTML =
      '<div class="feat-score">' +
        '<div class="feat-score-top"><span class="feat-section-label">Оценка промпта</span>' +
        '<span class="feat-score-num">' + r.pct + '%</span></div>' +
        '<div class="feat-score-meter"><i style="width:' + r.pct + '%"></i></div>' +
        '<div class="feat-diagnostic-grid">' +
          '<div><b>' + esc(r.level) + '</b><span>уровень</span></div>' +
          '<div><b>' + r.okCount + '/7</b><span>опор промпта</span></div>' +
          '<div><b>' + r.signalCount + '/4</b><span>контроль качества</span></div>' +
          '<div><b>' + r.words + '</b><span>слов</span></div>' +
        '</div>' +
        '<p class="feat-verdict">' + esc(trainerVerdict(r.pct, r.words)) + '</p>' +
        '<div class="feat-elements">' +
          r.found.map(function (f) {
            return '<div class="feat-element ' + (f.ok ? "ok" : "miss") + '">' +
              '<span class="mark">' + (f.ok ? "✓" : "—") + '</span>' +
              '<div><b>' + esc(f.el.name) + '</b>' + (f.ok ? "" : '<span>' + esc(f.el.hint) + '</span>') + '</div>' +
            '</div>';
          }).join("") +
        '</div>' +
        '<div class="feat-quality">' +
          r.signals.map(function (s) {
            return '<div class="feat-quality-item ' + (s.ok ? "ok" : "miss") + '">' +
              '<b>' + (s.ok ? "✓ " : "— ") + esc(s.name) + '</b>' +
              '<span>' + esc(s.ok ? "Учтено в запросе." : s.hint) + '</span>' +
            '</div>';
          }).join("") +
        '</div>' +
        '<div class="feat-suggestion"><span class="feat-section-label">Что улучшить в первую очередь</span>' +
          '<ol>' + priority.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join("") + '</ol>' +
        '</div>' +
        '<div class="feat-improved">' +
          '<div class="feat-score-top"><span class="feat-section-label">Улучшенная заготовка</span><button class="feat-mini-btn" type="button" data-copy-improved>Копировать</button></div>' +
          '<pre>' + esc(improved) + '</pre>' +
        '</div>' +
      '</div>';
    var copy = box.querySelector("[data-copy-improved]");
    if (copy) copy.addEventListener("click", function () { copyText(improved); toast("Улучшенный промпт скопирован."); });
  }

  function openSandbox(prefill) {
    var content =
      '<div>' +
        '<span class="feat-section-label">Ваш промпт</span>' +
        '<textarea class="feat-field feat-prompt-field" id="sbInput" placeholder="Опишите рабочую задачу: роль, контекст, исходные данные, формат результата и ограничения…">' + esc(prefill || "") + '</textarea>' +
      '</div>' +
      '<div class="feat-actions">' +
        '<button class="feat-btn" id="sbCheck" type="button">Проверить и улучшить</button>' +
        '<button class="feat-btn sec" id="sbSave" type="button">★ В мою библиотеку</button>' +
      '</div>' +
      '<div id="sbResult" class="feat-sandbox-result"></div>';

    openPanel({
      title: "🧪 Песочница промптов",
      subtitle: "Офлайн-проверка промпта: структура, конкретика, безопасность и проверяемость. Ничего не отправляется во внешний сервис.",
      content: content,
      onMount: function (root) {
        var input = $("#sbInput", root);
        $("#sbCheck", root).addEventListener("click", function () { renderTrainerResult($("#sbResult", root), input.value); });
        $("#sbSave", root).addEventListener("click", function () { saveToMyLib(input.value); });
        if (prefill) renderTrainerResult($("#sbResult", root), prefill);
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
