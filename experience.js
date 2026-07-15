(function () {
  const core = window.CourseExperienceCore;
  const host = window.courseExperienceHost;
  if (!core || !host) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

  function reducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }

  function brandLogoMarkup(compact) {
    return `
      <div class="brand-logo ${compact ? "brand-logo--compact" : "brand-logo--full"}" role="img" aria-label="ИИ-практикум, курс для работников">
        <span class="brand-logo__system" aria-hidden="true">
          <svg viewBox="0 0 140 140" class="brand-logo__orbits">
            <ellipse class="brand-logo__orbit brand-logo__orbit--one" cx="70" cy="70" rx="61" ry="25" transform="rotate(-18 70 70)" />
            <ellipse class="brand-logo__orbit brand-logo__orbit--two" cx="70" cy="70" rx="52" ry="20" transform="rotate(32 70 70)" />
            <ellipse class="brand-logo__orbit brand-logo__orbit--three" cx="70" cy="70" rx="42" ry="16" transform="rotate(-58 70 70)" />
            <ellipse class="brand-logo__orbit brand-logo__orbit--gold" cx="70" cy="70" rx="66" ry="28" transform="rotate(12 70 70)" />
          </svg>
          <i class="brand-logo__spark brand-logo__spark--one"></i><i class="brand-logo__spark brand-logo__spark--two"></i><i class="brand-logo__spark brand-logo__spark--three"></i>
          <i class="brand-logo__planet brand-logo__planet--one"></i><i class="brand-logo__planet brand-logo__planet--two"></i><i class="brand-logo__planet brand-logo__planet--three"></i>
          <span class="brand-logo__corona"></span>
          <span class="brand-logo__core">+</span>
        </span>
        <span class="brand-logo__copy"><strong>ИИ-практикум</strong><small>курс для работников</small></span>
      </div>`;
  }

  function renderBrandLogos() {
    const compact = $("#brandLogoCompact");
    const hero = $("#brandLogoHero");
    if (compact) compact.innerHTML = brandLogoMarkup(true);
    if (hero) hero.innerHTML = brandLogoMarkup(false);
  }

  function configureHeroVideo() {
    const video = $("#heroIntroVideo");
    if (!video) return;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let videoVisible = false;

    const syncPlayback = () => {
      const documentVisible = document.visibilityState === "visible";
      if (preference?.matches || !documentVisible || !videoVisible) {
        video.pause();
        video.removeAttribute("autoplay");
        return;
      }
      video.setAttribute("autoplay", "");
      const playResult = video.play();
      if (playResult && typeof playResult.catch === "function") playResult.catch(() => {});
    };

    if ("IntersectionObserver" in window) {
      const observer = new window.IntersectionObserver(([entry]) => {
        videoVisible = entry.isIntersecting;
        syncPlayback();
      }, { threshold: 0.01 });
      observer.observe(video);
    } else {
      let visibilityFrame = null;
      const updateVideoVisibility = () => {
        visibilityFrame = null;
        const rect = video.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        videoVisible = rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth;
        syncPlayback();
      };
      const scheduleVisibilityCheck = () => {
        if (visibilityFrame !== null) return;
        visibilityFrame = window.requestAnimationFrame(updateVideoVisibility);
      };
      window.addEventListener("scroll", scheduleVisibilityCheck, { passive: true });
      window.addEventListener("resize", scheduleVisibilityCheck);
      const hero = $("#courseHero");
      if (hero && "MutationObserver" in window) {
        const observer = new window.MutationObserver(scheduleVisibilityCheck);
        observer.observe(hero, { attributes: true, attributeFilter: ["hidden"] });
      }
      scheduleVisibilityCheck();
    }

    syncPlayback();
    document.addEventListener("visibilitychange", syncPlayback);
    if (preference?.addEventListener) preference.addEventListener("change", syncPlayback);
    else preference?.addListener?.(syncPlayback);
  }

  function renderHeroCycle() {
    const target = $("#heroCycle");
    if (!target) return;
    target.innerHTML = `
      <div class="hero-cycle__lead">
        <span>Рабочий цикл</span>
        <strong>От задачи к проверенному результату</strong>
      </div>
      <svg class="hero-cycle__path" viewBox="0 0 1000 80" preserveAspectRatio="none" aria-hidden="true">
        <path d="M65 40 H935" pathLength="100" />
        <circle class="hero-cycle__marker" cx="65" cy="40" r="7" />
      </svg>
      <div class="hero-cycle__steps">
        ${core.CYCLE_STEPS.map((step, index) => `
          <button class="hero-cycle__step" type="button" style="--index:${index}" data-cycle-module="${step.moduleId}">
            <span class="hero-cycle__number">0${index + 1}</span>
            <strong>${escapeHtml(step.label)}</strong>
            <small>${escapeHtml(step.detail)}</small>
          </button>
        `).join("")}
      </div>
    `;
    target.querySelectorAll("[data-cycle-module]").forEach((button) => {
      button.addEventListener("click", () => {
        host.openModuleById(button.dataset.cycleModule);
        window.setTimeout(() => $("#contentView")?.focus(), 0);
      });
    });
    target.dataset.motion = reducedMotion() ? "reduced" : "full";
  }

  function enhanceSidebar() {
    document.querySelectorAll("[data-experience-panel]").forEach((panel) => {
      if (panel.dataset.experienceReady === "true") return;
      const key = panel.dataset.experiencePanel;
      const button = $(".experience-panel__toggle", panel);
      if (!button) return;
      panel.dataset.experienceReady = "true";
      button.addEventListener("click", () => {
        const next = core.toggleExperiencePanel(host.getExperienceState(), key);
        host.updateExperience(next);
        applyPanelState(panel, next.panels[key]);
      });
    });
    const preferences = host.getExperienceState().panels;
    document.querySelectorAll("[data-experience-panel]").forEach((panel) => {
      applyPanelState(panel, preferences[panel.dataset.experiencePanel]);
    });
  }

  function applyPanelState(panel, expanded) {
    const button = $(".experience-panel__toggle", panel);
    panel.classList.toggle("is-collapsed", !expanded);
    button?.setAttribute("aria-expanded", String(Boolean(expanded)));
    const marker = button?.querySelector("span:last-child");
    if (marker) marker.textContent = expanded ? "⌃" : "⌄";
  }

  function renderLessonProgress() {
    const target = $("#lessonProgressBar");
    if (!target) return;
    if (!host.isAuthenticated()) { target.innerHTML = ""; return; }
    const modules = host.getModules();
    const currentIndex = host.getCurrentModuleIndex();
    const current = modules[currentIndex];
    const completed = modules.filter((module) => host.getState().modules[module.id]?.submitted).length;
    const next = core.findNextAction(modules, host.getState());
    target.innerHTML = current ? `
      <section class="lesson-progress-bar">
        <span class="lesson-progress-bar__index">${currentIndex + 1}/${modules.length}</span>
        <strong>${escapeHtml(current.title)}</strong>
        <span class="lesson-progress-bar__count">${completed} пройдено</span>
        <button type="button" class="lesson-progress-bar__continue" data-continue-module="${next.moduleId || ""}" ${next.complete ? "disabled" : ""}>${next.complete ? "Курс завершён" : "Продолжить"}</button>
      </section>
    ` : "";
    $("[data-continue-module]", target)?.addEventListener("click", (event) => {
      const id = event.currentTarget.dataset.continueModule;
      if (id) host.openModuleById(id);
    });
  }

  function enhanceLesson() {
    const lesson = $("#contentView .lesson");
    if (!lesson || lesson.dataset.experienceEnhanced === "true") return;
    lesson.dataset.experienceEnhanced = "true";
    const module = host.getModules()[host.getCurrentModuleIndex()];
    if (!module) return;
    const sections = [
      ["theory", ".theory-section", "Теория"],
      ["example", ".example-grid", "Пример"],
      ["practice", ".practice-box", "Практика"],
      ["review", ".open-question-box", "Рефлексия"],
      ["video", ".lesson-video-section", "Видео"]
    ];
    sections.forEach(([sectionId, selector, label]) => {
      const child = lesson.querySelector(selector);
      const section = child?.classList.contains("section-band") ? child : child?.closest(".section-band");
      if (!section || section.dataset.experienceDisclosure === "true") return;
      const key = `${module.id}:${sectionId}`;
      const saved = host.getExperienceState().lessonSections[key];
      const expanded = saved !== false;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lesson-disclosure__toggle";
      button.innerHTML = `<span>${label}</span><span aria-hidden="true">${expanded ? "Свернуть" : "Показать"}</span>`;
      button.setAttribute("aria-expanded", String(expanded));
      button.addEventListener("click", () => {
        const next = host.getExperienceState();
        next.lessonSections[key] = section.classList.contains("is-collapsed");
        host.updateExperience(next);
        setDisclosureState(section, button, next.lessonSections[key]);
      });
      section.dataset.experienceDisclosure = "true";
      section.prepend(button);
      setDisclosureState(section, button, expanded);
    });

    lesson.querySelectorAll("[data-practice], [data-open]").forEach((field) => {
      field.addEventListener("blur", () => announce("Сохранено на устройстве", "saved"));
    });
  }

  function setDisclosureState(section, button, expanded) {
    section.classList.toggle("is-collapsed", !expanded);
    button.setAttribute("aria-expanded", String(expanded));
    const status = button.querySelector("span:last-child");
    if (status) status.textContent = expanded ? "Свернуть" : "Показать";
  }

  function announce(message, status) {
    const old = $("#experienceStatus");
    old?.remove();
    const node = document.createElement("div");
    node.id = "experienceStatus";
    node.className = `experience-status is-${status}`;
    node.setAttribute("role", "status");
    node.textContent = message;
    document.body.appendChild(node);
    window.setTimeout(() => node.remove(), 2200);
  }

  function promptBookMarkup() {
    return `
      <div class="book-scene" tabindex="0" aria-label="Открывающаяся книга библиотеки промптов">
        <div class="book-floor"></div>
        <div class="book-3d">
          <div class="book-back"><div class="book-pages"></div></div>
          <div class="book-spine"></div>
          <div class="book-cards">
            <div class="book-card" style="--tx:-140px; --ty:-96px; --rot:-19deg;"><i></i><i></i><i></i><i></i></div>
            <div class="book-card" style="--tx:-74px; --ty:-128px; --rot:-9deg;"><i></i><i></i><i></i><i></i></div>
            <div class="book-card book-card--gold" style="--tx:0px; --ty:-162px; --rot:0deg;">
              <div class="book-card-star">★</div><i></i><i></i><i></i><i></i>
            </div>
            <div class="book-card" style="--tx:74px; --ty:-128px; --rot:9deg;"><i></i><i></i><i></i><i></i></div>
            <div class="book-card" style="--tx:140px; --ty:-96px; --rot:19deg;"><i></i><i></i><i></i><i></i></div>
          </div>
          <div class="book-cover">
            <div class="book-cover-mono"></div>
            <div class="book-cover-lines"><i></i><i></i></div>
          </div>
        </div>
        <div class="book-glyphs">
          <span class="book-glyph">Σ</span>
          <span class="book-glyph">λ</span>
          <span class="book-glyph">{ }</span>
          <span class="book-glyph">★</span>
          <span class="book-glyph">∞</span>
          <span class="book-glyph">→</span>
        </div>
      </div>`;
  }

  function enhancePromptLibrary() {
    const target = $("#promptLibraryBook");
    if (!target || target.dataset.experienceReady === "true") return;
    target.dataset.experienceReady = "true";
    target.innerHTML = promptBookMarkup();
    $(".book-scene", target)?.addEventListener("click", () => {
      $(".prompt-grid")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    });
  }

  function observeContent() {
    const target = $("#contentView");
    if (!target) return;
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(() => {
        enhanceLesson();
        renderLessonProgress();
      });
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function init() {
    renderBrandLogos();
    configureHeroVideo();
    renderHeroCycle();
    enhanceSidebar();
    enhanceLesson();
    enhancePromptLibrary();
    renderLessonProgress();
    observeContent();
  }

  window.CourseExperience = { init, renderBrandLogos, configureHeroVideo, renderHeroCycle, enhanceSidebar, enhanceLesson, enhancePromptLibrary, renderLessonProgress, announce };
  init();
})();
