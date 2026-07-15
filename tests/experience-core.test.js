import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("визуализации книги и каталога используют исходные классы Claude Design", () => {
  const experience = fs.readFileSync(new URL("../experience.js", import.meta.url), "utf8");
  const course = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../experience.css", import.meta.url), "utf8");

  assert.match(experience, /class="book-scene"/);
  assert.match(experience, /class="book-cover"/);
  assert.match(course, /nav-item nav-item--/);
  assert.match(course, /class="nav-thread"/);
  assert.match(styles, /@keyframes book-cover/);
  assert.match(styles, /@keyframes nav-flow/);
});

test("рабочий цикл остается на стартовом экране и не возвращается при переходе по блокам", () => {
  const course = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");

  assert.match(course, /setHeroVisibility\(Boolean\(options\.showHero\)\)/);
  assert.match(course, /renderModule\(0, \{ showHero: true \}\)/);
});

test("титульник содержит безопасную зацикленную видеообложку", () => {
  const page = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(page, /id="heroIntroVideo"/);
  assert.match(page, /class="hero-video-cover"/);
  assert.match(page, /autoplay muted loop playsinline/);
  assert.match(page, /preload="metadata"/);
  assert.match(page, /ai-course-hero-loop\.mp4/);
  assert.match(page, /ai-course-hero-loop\.jpg/);
});

test("видеообложка адаптивна и останавливается при уменьшении движения", () => {
  const experience = fs.readFileSync(new URL("../experience.js", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../experience.css", import.meta.url), "utf8");

  assert.match(experience, /function configureHeroVideo\(\)/);
  assert.match(experience, /prefers-reduced-motion: reduce/);
  assert.match(experience, /video\.pause\(\)/);
  assert.match(styles, /\.hero-video-cover\s*\{/);
  assert.match(styles, /aspect-ratio:\s*12\s*\/\s*5/);
  assert.match(styles, /object-fit:\s*cover/);
});

function loadHeroVideoExperience({ reducedMotion = false, playResult, supportsIntersectionObserver = true } = {}) {
  const experience = fs.readFileSync(new URL("../experience.js", import.meta.url), "utf8");
  const events = new Map();
  const windowEvents = new Map();
  const mediaEvents = [];
  const observerInstances = [];
  const animationFrames = [];
  const video = {
    attributes: new Map(),
    pauseCalls: 0,
    playCalls: 0,
    rect: { top: 0, right: 640, bottom: 360, left: 0 },
    pause() { this.pauseCalls += 1; },
    play() { this.playCalls += 1; return playResult; },
    getBoundingClientRect() { return this.rect; },
    setAttribute(name, value = "") { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); }
  };
  const hero = {};
  const mediaQuery = {
    matches: reducedMotion,
    addListener(listener) { mediaEvents.push(listener); }
  };
  const document = {
    visibilityState: "visible",
    querySelector(selector) {
      if (selector === "#heroIntroVideo") return video;
      if (selector === "#courseHero") return hero;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(type, listener) { events.set(type, listener); }
  };
  const window = {
    CourseExperienceCore: {},
    courseExperienceHost: {
      getExperienceState() { return { panels: {} }; }
    },
    document,
    innerHeight: 800,
    innerWidth: 1200,
    matchMedia() { return mediaQuery; },
    addEventListener(type, listener) { windowEvents.set(type, listener); },
    requestAnimationFrame(callback) { animationFrames.push(callback); }
  };
  if (supportsIntersectionObserver) {
    window.IntersectionObserver = class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        observerInstances.push(this);
      }
      observe(target) { this.target = target; }
    };
  }
  const sandbox = { window, document };
  if (supportsIntersectionObserver) sandbox.IntersectionObserver = window.IntersectionObserver;
  vm.runInNewContext(experience, sandbox);
  return {
    animationFrames,
    document,
    events,
    flushAnimationFrame() { animationFrames.shift()?.(); },
    mediaEvents,
    mediaQuery,
    observer: observerInstances[0],
    video,
    windowEvents
  };
}

test("управляет hero-видео по viewport, visibilitychange и legacy reduced-motion listener", () => {
  const runtime = loadHeroVideoExperience({ playResult: undefined });

  assert.equal(runtime.video.pauseCalls, 1);
  assert.equal(runtime.observer.target, runtime.video);
  assert.equal(runtime.observer.options.threshold, 0.01);
  assert.equal(runtime.mediaEvents.length, 1);

  runtime.observer.callback([{ isIntersecting: true }]);
  assert.equal(runtime.video.playCalls, 1);

  runtime.observer.callback([{ isIntersecting: false }]);
  assert.equal(runtime.video.pauseCalls, 2);

  runtime.document.visibilityState = "hidden";
  runtime.events.get("visibilitychange")();
  assert.equal(runtime.video.pauseCalls, 3);

  runtime.document.visibilityState = "visible";
  runtime.events.get("visibilitychange")();
  assert.equal(runtime.video.pauseCalls, 4);

  runtime.observer.callback([{ isIntersecting: true }]);
  assert.equal(runtime.video.playCalls, 2);

  runtime.mediaQuery.matches = true;
  runtime.mediaEvents[0]();
  assert.equal(runtime.video.pauseCalls, 5);
  assert.equal(runtime.video.attributes.has("autoplay"), false);
});

test("без IntersectionObserver проверяет viewport через один requestAnimationFrame", () => {
  const runtime = loadHeroVideoExperience({ supportsIntersectionObserver: false });

  assert.equal(runtime.video.pauseCalls, 1);
  assert.equal(runtime.animationFrames.length, 1);
  runtime.windowEvents.get("scroll")();
  runtime.windowEvents.get("resize")();
  assert.equal(runtime.animationFrames.length, 1);

  runtime.flushAnimationFrame();
  assert.equal(runtime.video.playCalls, 1);

  runtime.video.rect = { top: -360, right: 640, bottom: 0, left: 0 };
  runtime.windowEvents.get("scroll")();
  runtime.windowEvents.get("scroll")();
  runtime.windowEvents.get("resize")();
  assert.equal(runtime.animationFrames.length, 1);
  runtime.flushAnimationFrame();
  assert.equal(runtime.video.pauseCalls, 2);

  runtime.video.rect = { top: 0, right: 640, bottom: 360, left: 0 };
  runtime.windowEvents.get("resize")();
  runtime.flushAnimationFrame();
  assert.equal(runtime.video.playCalls, 2);
});

test("service worker кэширует poster, а видео обслуживает только из сети", () => {
  const serviceWorker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const coreBlock = serviceWorker.match(/const CORE = \[([\s\S]*?)\n\];/);
  const videoBranch = serviceWorker.match(/if \(sameOrigin && url\.pathname\.includes\("\/assets\/videos\/"\)\) \{([\s\S]*?)\n  \}/);

  assert.ok(coreBlock, "CORE должен быть объявлен как массив");
  assert.match(coreBlock[1], /assets\/video-posters\/ai-course-hero-loop\.jpg/);
  assert.doesNotMatch(coreBlock[1], /assets\/videos\/ai-course-hero-loop\.mp4/);
  assert.ok(videoBranch, "для /assets/videos/ должна быть отдельная ветка");
  assert.match(videoBranch[1], /event\.respondWith\(fetch\(request\)\)/);
  assert.doesNotMatch(videoBranch[1], /cache(?:s)?\.|cache\.put/);
});

const source = fs.readFileSync(new URL("../experience-core.js", import.meta.url), "utf8");
const sandbox = { window: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(source, sandbox);
const core = sandbox.window.CourseExperienceCore;

test("normalizes a missing experience state without sharing preferences", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(core.normalizeExperience())), {
    panels: { objectives: true, progress: true, modules: true, actions: false },
    roadmapCollapsed: true,
    resultsCollapsed: true,
    lessonSections: {},
    savedPrompts: [],
    promptNotes: {},
    libraryBookSeen: false
  });
});

test("сохраняет выбранное состояние панели прогресса и ответов", () => {
  assert.equal(core.normalizeExperience({}).resultsCollapsed, true);
  assert.equal(core.normalizeExperience({ resultsCollapsed: false }).resultsCollapsed, false);
});

test("classifies sensitive, high-cost external work as restricted", () => {
  assert.equal(
    core.classifyTask({ data: "sensitive", cost: "high", goal: "external" }).level,
    "restricted"
  );
});

test("selects the first unfinished module as the next action", () => {
  const modules = [{ id: "intro", title: "Введение" }, { id: "prompt", title: "Промпт" }];
  const progress = { modules: { intro: { submitted: true } } };
  assert.equal(core.findNextAction(modules, progress).moduleId, "prompt");
});

test("adds personal experience preferences to legacy progress without replacing answers", () => {
  const progress = core.withExperience({ modules: { intro: { score: 4 } }, openAnswers: { "intro:0": "Ответ" } });
  assert.equal(progress.modules.intro.score, 4);
  assert.equal(progress.openAnswers["intro:0"], "Ответ");
  assert.equal(progress.experience.panels.modules, true);
});

test("defines six learning-cycle steps with unique course destinations", () => {
  assert.equal(core.CYCLE_STEPS.length, 6);
  assert.equal(new Set(core.CYCLE_STEPS.map((step) => step.moduleId)).size, 6);
  assert.equal(core.CYCLE_STEPS[0].label, "Задача");
});

test("returns only weak final-test categories as personal insights", () => {
  const questions = [
    { category: "security", answer: 1 },
    { category: "prompt", answer: 0 },
    { category: "prompt", answer: 2 }
  ];
  const insights = core.buildErrorInsights(questions, { 0: 0, 1: 0, 2: 2 });
  assert.deepEqual(
    JSON.parse(JSON.stringify(insights.map((item) => [item.category, item.count]))),
    [["security", 1]]
  );
});

test("removes a prompt from the collection on the second action", () => {
  const saved = core.toggleSavedPrompt(core.blankExperience(), "audit-plan");
  const removed = core.toggleSavedPrompt(saved, "audit-plan");
  assert.deepEqual(JSON.parse(JSON.stringify(removed.savedPrompts)), []);
});

test("derives catalog states from actual course progress", () => {
  assert.equal(core.getCatalogState({ locked: false, active: true, submitted: false }), "active");
  assert.equal(core.getCatalogState({ locked: false, active: false, submitted: true }), "done");
  assert.equal(core.getCatalogState({ locked: true, active: false, submitted: false }), "locked");
  assert.equal(core.getCatalogState({ locked: false, active: true, submitted: true, department: true }), "department");
});

test("defines work-case data before the course initializes", () => {
  const script = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
  assert.ok(script.indexOf("const WORK_CASES") < script.lastIndexOf("initializeCourse();"));
});
