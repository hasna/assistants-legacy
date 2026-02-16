---
name: video
description: Analyze video content — transcribe audio, extract key frames, answer questions about video. Supports local files and YouTube URLs.
argument-hint: [video path or YouTube URL]
allowed-tools: bash, read_audio, read
---

## Instructions

Analyze the video specified by: $ARGUMENTS

### Step 1: Detect Input Type and Check Dependencies

First, check if ffmpeg is available:

```bash
which ffmpeg || echo "MISSING: ffmpeg is required for video analysis. Install with: brew install ffmpeg"
```

Determine if the input is a YouTube URL or local file:
- **YouTube URL** (contains youtube.com or youtu.be): Download with yt-dlp
- **Local file**: Verify it exists

For YouTube URLs, check yt-dlp is available:
```bash
which yt-dlp || echo "MISSING: yt-dlp is required for YouTube downloads. Install with: brew install yt-dlp"
```

### Step 2: Download (YouTube only)

If the input is a YouTube URL, download the video:

```bash
mkdir -p /tmp/assistants-video
yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]" --merge-output-format mp4 -o "/tmp/assistants-video/%(id)s.%(ext)s" "URL_HERE"
```

Note the output filename for subsequent steps.

### Step 3: Get Video Info

```bash
ffprobe -v quiet -print_format json -show_format -show_streams "/path/to/video" 2>/dev/null | head -100
```

This gives you duration, resolution, codec info.

### Step 4: Extract and Transcribe Audio

Extract audio from the video:
```bash
ffmpeg -i "/path/to/video" -vn -acodec pcm_s16le -ar 16000 -ac 1 "/tmp/assistants-video/audio.wav" -y 2>/dev/null
```

Then transcribe using the read_audio tool:
- Use `read_audio` with path `/tmp/assistants-video/audio.wav`

If the audio file is too large (>25MB), split it first:
```bash
ffmpeg -i "/tmp/assistants-video/audio.wav" -f segment -segment_time 300 -c copy "/tmp/assistants-video/audio_%03d.wav" -y 2>/dev/null
```
Then transcribe each segment separately.

### Step 5: Extract Key Frames

Extract frames at regular intervals (every 10 seconds, or every 300 frames):
```bash
ffmpeg -i "/path/to/video" -vf "fps=1/10" -frames:v 20 "/tmp/assistants-video/frame_%04d.jpg" -y 2>/dev/null
```

Adjust the fps and frame count based on video length:
- Short video (<1 min): fps=1/5, max 12 frames
- Medium video (1-10 min): fps=1/10, max 20 frames
- Long video (>10 min): fps=1/30, max 20 frames

### Step 6: Analyze Key Frames

Use the `read` tool to view each extracted frame image. This sends the image to Claude's vision capability for analysis.

For each frame, note:
- What's visible in the frame
- Any text, diagrams, or slides shown
- Scene changes or transitions

### Step 7: Synthesize Analysis

Combine the transcription and visual analysis into a comprehensive report:

**Output Format:**

- **Video Info**: Duration, resolution, source
- **Summary**: Overall summary of the video content
- **Timeline**: Key moments with timestamps
  - [0:00] - Description of opening
  - [1:30] - Key point discussed
  - etc.
- **Transcript**: Full or summarized transcript
- **Visual Elements**: Notable visual content (slides, diagrams, demonstrations)
- **Key Takeaways**: Main points from the video

### Step 8: Cleanup

```bash
rm -rf /tmp/assistants-video/
```

### Error Handling

- If ffmpeg is not installed, inform the user: "ffmpeg is required for video analysis. Install with: brew install ffmpeg"
- If yt-dlp is not installed (for YouTube): "yt-dlp is required for YouTube video downloads. Install with: brew install yt-dlp"
- If the video file doesn't exist, inform the user with the correct path
- If transcription fails (no ELEVENLABS_API_KEY), still proceed with visual analysis only
- If the video is very long (>1 hour), suggest analyzing a specific time range
