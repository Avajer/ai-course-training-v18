(function (root) {
  const PANEL_DEFAULTS = Object.freeze({
    objectives: true,
    progress: true,
    modules: true,
    actions: false
  });

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

  function buildErrorInsights() {
    return [];
  }

  function toggleSavedPrompt(experience, promptId) {
    const next = normalizeExperience(experience);
    next.savedPrompts = next.savedPrompts.includes(promptId)
      ? next.savedPrompts.filter((id) => id !== promptId)
      : [...next.savedPrompts, promptId];
    return next;
  }

  root.CourseExperienceCore = {
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
