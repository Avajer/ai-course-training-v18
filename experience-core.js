(function (root) {
  const PANEL_DEFAULTS = Object.freeze({
    objectives: true,
    progress: true,
    modules: true,
    actions: false
  });

  const CYCLE_STEPS = Object.freeze([
    { id: "task", label: "Задача", detail: "Определите рабочий результат", moduleId: "intro" },
    { id: "context", label: "Контекст", detail: "Укажите адресата и условия", moduleId: "prompt" },
    { id: "request", label: "Запрос", detail: "Соберите сильный промпт", moduleId: "formula" },
    { id: "draft", label: "Черновик", detail: "Получите первый вариант", moduleId: "iterations" },
    { id: "verify", label: "Проверка", detail: "Проверьте факты и риски", moduleId: "verification" },
    { id: "apply", label: "Применение", detail: "Сохраните рабочий шаблон", moduleId: "final-practice" }
  ]);

  function blankExperience() {
    return {
      panels: { ...PANEL_DEFAULTS },
      roadmapCollapsed: true,
      lessonSections: {},
      savedPrompts: [],
      promptNotes: {}
    };
  }

  function normalizeExperience(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      ...blankExperience(),
      ...source,
      panels: { ...PANEL_DEFAULTS, ...(source.panels || {}) },
      lessonSections: { ...(source.lessonSections || {}) },
      savedPrompts: Array.isArray(source.savedPrompts) ? source.savedPrompts : [],
      promptNotes: { ...(source.promptNotes || {}) }
    };
  }

  function withExperience(progress) {
    const next = progress && typeof progress === "object" ? { ...progress } : {};
    next.experience = normalizeExperience(next.experience);
    return next;
  }

  function toggleExperiencePanel(experience, panel) {
    const next = normalizeExperience(experience);
    next.panels[panel] = !next.panels[panel];
    return next;
  }

  function findNextAction(modules, progress) {
    const next = (modules || []).find((module) => !progress?.modules?.[module.id]?.submitted);
    return next
      ? { moduleId: next.id, title: next.title, complete: false }
      : { moduleId: null, title: "Курс завершён", complete: true };
  }

  function classifyTask(input = {}) {
    const sensitiveExternal = input.data === "sensitive" && input.goal === "external";
    const sensitiveHighCost = input.data === "sensitive" && input.cost === "high";
    if (sensitiveExternal || sensitiveHighCost) {
      return { level: "restricted", title: "Нужен разрешённый контур" };
    }
    if (input.data === "internal" || input.cost === "high") {
      return { level: "guarded", title: "Можно с ограничениями" };
    }
    return { level: "allowed", title: "Можно использовать для черновика" };
  }

  const ERROR_INSIGHT_COPY = Object.freeze({
    basics: { title: "Недостаточно контекста", action: "Сформулируйте рабочий результат, адресата и исходные условия до запроса." },
    prompt: { title: "Нет критериев проверки", action: "Указывайте формат, ограничения, критерии качества и следующий шаг." },
    tools: { title: "Инструмент выбран без сравнения", action: "Сначала сопоставьте задачу, данные, доступный контур и нужные возможности." },
    verification: { title: "Слишком много доверия ответу", action: "Проверяйте цифры, источники, допущения и применимость вывода вручную." },
    security: { title: "Риск работы с данными", action: "Проверьте категорию данных и используйте только допустимый контур." },
    docs: { title: "Документ не проверен человеком", action: "Сверяйте важные формулировки с исходным документом и требованиями задачи." }
  });

  function buildErrorInsights(questions = [], answers = {}) {
    const counts = questions.reduce((result, question, index) => {
      if (Number(answers[index]) !== question.answer && question.category) {
        result[question.category] = (result[question.category] || 0) + 1;
      }
      return result;
    }, {});
    return Object.entries(counts).map(([category, count]) => ({
      category,
      count,
      ...(ERROR_INSIGHT_COPY[category] || { title: "Нужна дополнительная практика", action: "Вернитесь к связанному блоку и выполните практическое задание." })
    }));
  }

  function toggleSavedPrompt(experience, promptId) {
    const next = normalizeExperience(experience);
    next.savedPrompts = next.savedPrompts.includes(promptId)
      ? next.savedPrompts.filter((id) => id !== promptId)
      : [...next.savedPrompts, promptId];
    return next;
  }

  root.CourseExperienceCore = {
    CYCLE_STEPS,
    ERROR_INSIGHT_COPY,
    blankExperience,
    normalizeExperience,
    withExperience,
    toggleExperiencePanel,
    findNextAction,
    classifyTask,
    buildErrorInsights,
    toggleSavedPrompt
  };
})(window);
