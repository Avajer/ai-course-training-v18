# Final Fix Report: Hero Video

Date: 2026-07-15

## Scope

- `experience.js`: playback now requires a visible document, an intersecting `#courseHero`, and disabled reduced-motion. It pauses on `visibilitychange`, IntersectionObserver updates, and reduced-motion changes. `play()` is handled when it returns either `undefined` or a Promise-like result.
- `experience.js`: `MediaQueryList.addListener` is used when legacy Safari does not provide `addEventListener`.
- `scripts/build-hero-video.sh`: the reverse segment keeps source frames 118 through 1 only. This removes the duplicate turn frame and duplicate loop-boundary frame. The script validates H.264, no audio, 238 frames, duration between 9.8 and 10.0 seconds, and an 8 MiB size limit after every build.
- `assets/videos/ai-course-hero-loop.mp4`: regenerated from `/private/tmp/kling-review-20260715/uploads/kling_20260713_VIDEO_Create_a_p_4222_0.mp4`.
- `tests/experience-core.test.js`: added executable playback lifecycle coverage and the service-worker contract that poster is in `CORE` while the MP4 is not.

## Reproducible Media Build

```bash
bash scripts/build-hero-video.sh /private/tmp/kling-review-20260715/uploads/kling_20260713_VIDEO_Create_a_p_4222_0.mp4
```

Actual result:

```text
Validated .../assets/videos/ai-course-hero-loop.mp4: h264, 238 frames, 9.916667s, 3835009 bytes, no audio.
```

## Final Verification

```text
$ node --check experience.js
exit 0

$ node --test tests/experience-core.test.js
tests 16
pass 16
fail 0

$ bash -n scripts/build-hero-video.sh
exit 0

$ ffprobe -v error -show_entries format=duration,size -show_entries stream=index,codec_type,codec_name,width,height,avg_frame_rate -of default=noprint_wrappers=1 assets/videos/ai-course-hero-loop.mp4
index=0
codec_name=h264
codec_type=video
width=1280
height=720
avg_frame_rate=24/1
duration=9.916667
size=3835009

$ ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of default=noprint_wrappers=1 assets/videos/ai-course-hero-loop.mp4
nb_read_frames=238

$ ffmpeg -v error -i assets/videos/ai-course-hero-loop.mp4 -f framemd5 - | awk '...'
frame_0=1f964cf3c8c0d48b6496d618db284c71
frame_119=336733214667eebe67d1f5954883e290
frame_120=d61b11c1d7bac85c23765803503cdf29
frame_237=f37dfee165b3ffcfa5691e11aaece1dc

$ git diff --check
exit 0
```

The two seam-adjacent pairs are distinct (`119 != 120` at the direction change and `237 != 0` at the loop boundary). A contact-sheet inspection of frames `0, 1, 117, 118, 119, 120, 236, 237` also showed continuous neighboring imagery at both seams.

## Self-Review

- All playback entry points pass through one predicate, so a hidden document, non-intersecting hero, or reduced-motion preference cannot restart the video.
- The initial state with IntersectionObserver pauses the video until an intersection callback confirms visibility.
- The legacy `addListener` branch is covered by the test harness; the harness also verifies `play()` returning `undefined` does not throw.
- No service-worker production change was necessary: the existing `CORE` already included the poster and excluded MP4. The contract is now protected by a test.
- Review found no whitespace errors or unrelated tracked-file changes.

## Residual Concerns

- The lifecycle test is a deterministic DOM harness, not a manual run on a physical legacy Safari device. The compatibility branch follows the documented legacy MediaQueryList API and is covered by the test.
- Browsers without IntersectionObserver use the existing graceful fallback where the hero is treated as visible; modern supported Safari versions provide IntersectionObserver.
