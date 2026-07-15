# Looping Hero Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в верхнюю часть титульного экрана курса оптимизированную видеообложку Kling с бесшовным циклом «вперед — назад», безопасным резервным постером и адаптацией под мобильные устройства.

**Architecture:** Исходный ролик обрабатывается отдельным воспроизводимым shell-скриптом на базе FFmpeg и сохраняется как легкий MP4 без звука вместе с постером. `index.html` содержит нативный декоративный `<video>`, `experience.css` отвечает за панорамную композицию, а `experience.js` останавливает движение при системной настройке `prefers-reduced-motion`. Тяжелый MP4 не попадает в обязательный офлайн-кэш, постер попадает.

**Tech Stack:** HTML5 video, CSS, JavaScript без зависимостей, FFmpeg/ffprobe, Node.js `node:test`, GitHub Pages, Service Worker.

## Global Constraints

- Видео размещается после фирменного логотипа и учетной записи, перед заголовком курса.
- Текст курса, показатели и рабочий цикл не накладываются на видео.
- Широкий экран использует соотношение сторон 12:5.
- Итоговый MP4: H.264, без звука, до 8 МБ, с `faststart`.
- Атрибуты видео: `autoplay`, `muted`, `loop`, `playsinline`, `preload="metadata"`.
- При `prefers-reduced-motion: reduce` видео останавливается и остается постер.
- Сбой загрузки ролика не должен блокировать титульник или авторизацию.
- MP4 не добавляется в обязательный офлайн-кэш; постер добавляется.

---

## File Structure

- Create: `scripts/build-hero-video.sh` — воспроизводимая обработка исходного Kling MP4.
- Create: `assets/videos/ai-course-hero-loop.mp4` — оптимизированный цикл без звука.
- Create: `assets/video-posters/ai-course-hero-loop.jpg` — резервный кадр.
- Modify: `tests/experience-core.test.js` — статические контракты разметки и поведения.
- Modify: `index.html` — нативный видеокомпонент на титульном экране и версия ресурсов.
- Modify: `experience.css` — визуальная композиция и адаптивность.
- Modify: `experience.js` — остановка видео при уменьшении движения.
- Modify: `sw.js` — версия кэша и офлайн-постер.
- Modify: `script.js`, `features.js`, `README.md` — номер сборки и документация.

### Task 1: Prepare the optimized loop and poster

**Files:**
- Create: `scripts/build-hero-video.sh`
- Create: `assets/videos/ai-course-hero-loop.mp4`
- Create: `assets/video-posters/ai-course-hero-loop.jpg`

**Interfaces:**
- Consumes: путь к исходному MP4 в первом аргументе shell-скрипта.
- Produces: браузерный H.264 MP4 без аудио и JPEG-постер по фиксированным путям.

- [ ] **Step 1: Write the asset validation command and verify it fails before generation**

Run:

```bash
test -f assets/videos/ai-course-hero-loop.mp4 && test -f assets/video-posters/ai-course-hero-loop.jpg
```

Expected: FAIL because both generated assets do not exist.

- [ ] **Step 2: Create the reproducible FFmpeg script**

Create `scripts/build-hero-video.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SOURCE=${1:?"Usage: scripts/build-hero-video.sh /path/to/source.mp4"}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
VIDEO="$ROOT/assets/videos/ai-course-hero-loop.mp4"
POSTER="$ROOT/assets/video-posters/ai-course-hero-loop.jpg"

mkdir -p "$(dirname "$VIDEO")" "$(dirname "$POSTER")"

ffmpeg -y -i "$SOURCE" -filter_complex \
  "[0:v]trim=start=0:end=5,setpts=PTS-STARTPTS,fps=24,scale=1280:-2:flags=lanczos,split=2[forward][reverse_source];[reverse_source]reverse[reverse];[forward][reverse]concat=n=2:v=1:a=0,format=yuv420p[video]" \
  -map "[video]" -an -c:v libx264 -preset slow -crf 24 -movflags +faststart "$VIDEO"

ffmpeg -y -ss 2.5 -i "$SOURCE" -frames:v 1 -vf "scale=1280:-2:flags=lanczos" -q:v 3 "$POSTER"
```

- [ ] **Step 3: Generate the assets from the extracted Kling video**

Run:

```bash
chmod +x scripts/build-hero-video.sh
scripts/build-hero-video.sh '/private/tmp/kling-review-20260715/uploads/kling_20260713_VIDEO_Create_a_p_4222_0.mp4'
```

Expected: both output files are created successfully.

- [ ] **Step 4: Validate browser compatibility, duration, audio removal, and size**

Run:

```bash
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,codec_name,pix_fmt -of default=noprint_wrappers=1 assets/videos/ai-course-hero-loop.mp4
```

Expected:

```text
codec_name=h264
codec_type=video
pix_fmt=yuv420p
duration between 9.8 and 10.2 seconds
size less than 8388608 bytes
```

No `codec_type=audio` line may appear.

- [ ] **Step 5: Commit the generated media unit**

```bash
git add scripts/build-hero-video.sh assets/videos/ai-course-hero-loop.mp4 assets/video-posters/ai-course-hero-loop.jpg
git commit -m "feat: prepare looping hero video assets"
```

### Task 2: Add the video cover contract and markup

**Files:**
- Modify: `tests/experience-core.test.js`
- Modify: `index.html:84-103`

**Interfaces:**
- Consumes: `assets/videos/ai-course-hero-loop.mp4` and `assets/video-posters/ai-course-hero-loop.jpg`.
- Produces: `#heroIntroVideo` inside `.hero-video-cover`, available to `configureHeroVideo()`.

- [ ] **Step 1: Write the failing markup contract test**

Append to `tests/experience-core.test.js`:

```js
test("титульник содержит безопасную зацикленную видеообложку", () => {
  const page = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(page, /id="heroIntroVideo"/);
  assert.match(page, /class="hero-video-cover"/);
  assert.match(page, /autoplay muted loop playsinline/);
  assert.match(page, /preload="metadata"/);
  assert.match(page, /ai-course-hero-loop\.mp4/);
  assert.match(page, /ai-course-hero-loop\.jpg/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
node --test tests/experience-core.test.js
```

Expected: FAIL in `титульник содержит безопасную зацикленную видеообложку` because `heroIntroVideo` is absent.

- [ ] **Step 3: Add the video cover before the course heading**

Insert in `index.html` immediately after `#accountStatus` and before `.kicker`:

```html
<div class="hero-video-cover" aria-hidden="true">
  <video
    id="heroIntroVideo"
    class="hero-video-cover__media"
    autoplay muted loop playsinline
    preload="metadata"
    poster="assets/video-posters/ai-course-hero-loop.jpg"
    tabindex="-1"
  >
    <source src="assets/videos/ai-course-hero-loop.mp4" type="video/mp4">
  </video>
  <span class="hero-video-cover__shade"></span>
</div>
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```bash
node --test tests/experience-core.test.js
```

Expected: PASS for all tests.

- [ ] **Step 5: Commit the semantic component**

```bash
git add index.html tests/experience-core.test.js
git commit -m "feat: add hero video cover markup"
```

### Task 3: Style the cover and honor reduced motion

**Files:**
- Modify: `tests/experience-core.test.js`
- Modify: `experience.css:1-45,255-280`
- Modify: `experience.js:45-70,245-270`

**Interfaces:**
- Consumes: `#heroIntroVideo` and `.hero-video-cover` from Task 2.
- Produces: `configureHeroVideo(): void`, called once by `init()`.

- [ ] **Step 1: Write the failing behavior and style contract test**

Append to `tests/experience-core.test.js`:

```js
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
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
node --test tests/experience-core.test.js
```

Expected: FAIL because `configureHeroVideo` and the cover styles are absent.

- [ ] **Step 3: Add responsive cover styles**

Add to `experience.css` near the brand and hero styles:

```css
.hero-video-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 12 / 5;
  margin: 1rem 0 1.35rem;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #07192a;
  box-shadow: 0 18px 44px rgba(7, 25, 42, 0.16);
}

.hero-video-cover__media {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 52%;
}

.hero-video-cover__shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, transparent 62%, rgba(4, 18, 31, 0.32));
}

@media (max-width: 760px) {
  .hero-video-cover {
    aspect-ratio: 16 / 9;
    max-height: 220px;
    margin: 0.8rem 0 1.1rem;
    border-radius: 12px;
  }
}
```

Extend the existing reduced-motion block:

```css
@media (prefers-reduced-motion: reduce) {
  .hero-video-cover__media { visibility: hidden; }
  .hero-video-cover {
    background: #07192a url("assets/video-posters/ai-course-hero-loop.jpg") center / cover no-repeat;
  }
}
```

- [ ] **Step 4: Add deterministic reduced-motion behavior**

Add to `experience.js`:

```js
function configureHeroVideo() {
  const video = $("#heroIntroVideo");
  if (!video) return;
  const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const syncPlayback = () => {
    if (preference?.matches) {
      video.pause();
      video.removeAttribute("autoplay");
      return;
    }
    video.setAttribute("autoplay", "");
    video.play().catch(() => {});
  };
  syncPlayback();
  preference?.addEventListener?.("change", syncPlayback);
}
```

Call `configureHeroVideo()` from `init()` immediately after `renderBrandLogos()` and expose it through `window.CourseExperience`.

- [ ] **Step 5: Run static and syntax tests**

Run:

```bash
node --check experience.js
node --test tests/experience-core.test.js
```

Expected: syntax check exits 0 and all tests PASS.

- [ ] **Step 6: Commit behavior and presentation**

```bash
git add experience.css experience.js tests/experience-core.test.js
git commit -m "feat: style responsive hero video cover"
```

### Task 4: Version, cache, document, and verify the published build

**Files:**
- Modify: `index.html`
- Modify: `script.js:87`
- Modify: `features.js:12`
- Modify: `sw.js:1-25,55-64`
- Modify: `README.md:1-85`

**Interfaces:**
- Consumes: completed hero video component and assets from Tasks 1–3.
- Produces: GitHub Pages build `v66` with cache-busting resource URLs.

- [ ] **Step 1: Add the poster to the core cache and keep MP4 network-only**

In `sw.js`, set:

```js
const CACHE = "ai-course-v66";
```

Add to `CORE`:

```js
"./assets/video-posters/ai-course-hero-loop.jpg",
```

Keep the existing `/assets/videos/` branch unchanged so MP4 files are never placed in Cache Storage.

- [ ] **Step 2: Raise all build identifiers to v66**

Update:

```text
index.html asset query strings: ?v=66
index.html session key: aiCourseSwReloadedV66
script.js COURSE_BUILD: v66
features.js COURSE_VERSION: v66
sw.js CORE query strings: ?v=66
README.md current build: v66
```

- [ ] **Step 3: Document the title video behavior**

Add to `README.md` under `Учебные видео`:

```markdown
Титульный экран использует отдельную оптимизированную видеообложку `ai-course-hero-loop.mp4`: она воспроизводится без звука, не входит в обязательный офлайн-кэш и заменяется постером при уменьшении движения или отсутствии сети.
```

- [ ] **Step 4: Run complete local verification**

Run:

```bash
node --check script.js
node --check experience.js
node --check experience-core.js
node --check features.js
node --test tests/experience-core.test.js
git diff --check
```

Expected: every command exits 0 and all tests PASS.

- [ ] **Step 5: Verify responsive behavior in the browser**

Open the local course and check viewports `1440×900`, `1024×768`, `768×900`, and `390×844`.

Expected at every width:

```text
video cover is visible before the H1
no horizontal overflow
account does not overlap the video
video plays muted when normal motion is enabled
poster remains visible when reduced motion is enabled
course title and authorization remain interactive
```

- [ ] **Step 6: Commit the release metadata**

```bash
git add index.html script.js features.js sw.js README.md
git commit -m "chore: release hero video cover v66"
```

- [ ] **Step 7: Push and verify GitHub Pages**

Run:

```bash
git push origin main
```

Open:

```text
https://avajer.github.io/ai-course-training-v18/?reload=66
```

Expected: page reports `сборка v66`, loads `experience.css?v=66`, shows the video cover, and the browser console contains no errors.
