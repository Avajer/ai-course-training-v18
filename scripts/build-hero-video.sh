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
