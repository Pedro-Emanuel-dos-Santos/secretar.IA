"""Offline, bounded CPU transcription. Audio enters stdin; only JSON exits stdout."""
import io
import json
import os
import sys

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["DO_NOT_TRACK"] = "1"

def main():
    import av
    import numpy as np
    from faster_whisper import WhisperModel

    data = sys.stdin.buffer.read(5 * 1024 * 1024 + 1)
    if not data or len(data) > 5 * 1024 * 1024:
        raise ValueError("invalid_audio")
    samples = []
    count = 0
    # Stop decoding at 90 seconds even when container duration is missing/forged.
    try:
        with av.open(io.BytesIO(data)) as container:
            resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
            for frame in container.decode(audio=0):
                for output in resampler.resample(frame):
                    part = output.to_ndarray().flatten()
                    count += part.size
                    if count > 90 * 16000:
                        raise ValueError("audio_too_long")
                    samples.append(part)
            for output in resampler.resample(None):
                part = output.to_ndarray().flatten()
                count += part.size
                if count > 90 * 16000:
                    raise ValueError("audio_too_long")
                samples.append(part)
    except (av.error.FFmpegError, IndexError):
        raise ValueError("invalid_audio") from None
    if count < 1600:
        raise ValueError("invalid_audio")
    audio = np.concatenate(samples).astype(np.float32) / 32768.0
    model = WhisperModel(os.environ.get("LOCAL_WHISPER_MODEL", "base"), device="cpu", compute_type="int8",
        cpu_threads=4, num_workers=1, download_root=os.environ["LOCAL_WHISPER_CACHE"], local_files_only=True)
    segments, _ = model.transcribe(audio, language="pt", beam_size=3, vad_filter=True,
        condition_on_previous_text=False)
    text = " ".join(segment.text.strip() for segment in segments).strip()
    if not text or len(text) > 16000:
        raise ValueError("no_speech")
    print(json.dumps({"text": text}, ensure_ascii=True))

try:
    main()
except (ValueError, EOFError):
    print(json.dumps({"error": "invalid_audio"}))
    sys.exit(2)
except Exception:
    # No private transcript, file paths or library tracebacks in application logs.
    print(json.dumps({"error": "local_transcription_failed"}))
    sys.exit(1)
