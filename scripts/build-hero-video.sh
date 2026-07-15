#!/usr/bin/env bash
set -euo pipefail

SOURCE=${1:?"Usage: scripts/build-hero-video.sh /path/to/source.mp4"}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
VIDEO="$ROOT/assets/videos/ai-course-hero-loop.mp4"
POSTER="$ROOT/assets/video-posters/ai-course-hero-loop.jpg"

mkdir -p "$(dirname "$VIDEO")" "$(dirname "$POSTER")"

ffmpeg -y -i "$SOURCE" -filter_complex \
  "[0:v]trim=start=0:end=5,setpts=PTS-STARTPTS,fps=24,scale=1280:-2:flags=lanczos,split=2[forward][reverse_source];[reverse_source]trim=start_frame=1:end_frame=119,setpts=PTS-STARTPTS,reverse,setpts=PTS-STARTPTS[reverse];[forward][reverse]concat=n=2:v=1:a=0,format=yuv420p[video]" \
  -map "[video]" -an -c:v libx264 -preset slow -crf 24 -movflags +faststart "$VIDEO"

ffmpeg -y -ss 2.5 -i "$SOURCE" -frames:v 1 -vf "scale=1280:-2:flags=lanczos" -q:v 3 "$POSTER"

video_codec=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$VIDEO")
audio_streams=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$VIDEO" | wc -l | tr -d ' ')
frame_count=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of default=noprint_wrappers=1:nokey=1 "$VIDEO")
duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO")
size_bytes=$(wc -c < "$VIDEO" | tr -d ' ')

[[ "$video_codec" == "h264" ]]
[[ "$audio_streams" == "0" ]]
[[ "$frame_count" == "238" ]]
[[ "$size_bytes" -le $((8 * 1024 * 1024)) ]]
awk -v duration="$duration" 'BEGIN { exit !(duration > 9.8 && duration < 10.0) }'

printf 'Validated %s: h264, 238 frames, %ss, %s bytes, no audio.\n' "$VIDEO" "$duration" "$size_bytes"
