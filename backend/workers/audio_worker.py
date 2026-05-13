"""
audio_worker.py - async background task for podcast generation.

Key fixes:
  1. generate_content_stream() — non-streaming only returns ~150 bytes of audio
  2. Retry on 429 with retryDelay from error body
  3. 6s inter-line pacing to stay under 10 req/min TTS quota
"""
import asyncio, io, json, base64, logging, concurrent.futures, time, re
import google.genai as genai
from google.genai import types
from pydub import AudioSegment
from workers.job_store import job_store

logger = logging.getLogger(__name__)

SILENCE_MS           = 350
TTS_TIMEOUT          = 90    # seconds per line (includes retry waits in thread)
TTS_INTER_LINE_DELAY = 6.0   # seconds between lines — keeps us under 10 req/min
TTS_MAX_RETRIES      = 5
VOICE_MAP            = {"Host A": "Charon", "Host B": "Aoede"}
DEFAULT_VOICE        = "Kore"

_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=4)


def _do_tts_stream(client: genai.Client, text: str, voice: str) -> AudioSegment:
    """Single TTS streaming attempt — collects all chunks into one AudioSegment."""
    audio_chunks: list[bytes] = []
    frame_rate = 24000

    for stream_chunk in client.models.generate_content_stream(
        model="gemini-2.5-flash-preview-tts",
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                )
            ),
        ),
    ):
        for part in stream_chunk.candidates[0].content.parts:
            if not (hasattr(part, "inline_data") and part.inline_data and part.inline_data.data):
                continue
            chunk_bytes = base64.b64decode(part.inline_data.data)
            audio_chunks.append(chunk_bytes)
            # Parse sample rate from first chunk mime_type: "audio/L16;codec=pcm;rate=24000"
            if len(audio_chunks) == 1:
                mime = part.inline_data.mime_type or ""
                if "rate=" in mime:
                    try:
                        frame_rate = int(mime.split("rate=")[1].split(";")[0].split(",")[0])
                    except ValueError:
                        pass

    raw_bytes = b"".join(audio_chunks)
    if not raw_bytes:
        raise ValueError("TTS returned empty audio — text may have been filtered")
    # PCM L16 requires 2-byte frame alignment
    if len(raw_bytes) % 2 != 0:
        raw_bytes = raw_bytes[:-1]

    logger.debug("[audio] TTS: %d bytes = %.2fs at %dHz", len(raw_bytes), len(raw_bytes) / (frame_rate * 2), frame_rate)
    return AudioSegment(data=raw_bytes, sample_width=2, frame_rate=frame_rate, channels=1)


def _tts_line_sync(client: genai.Client, text: str, voice: str) -> AudioSegment:
    """
    TTS with automatic retry on 429 RESOURCE_EXHAUSTED.
    Reads retryDelay from the error message so we wait exactly as long as needed.
    """
    for attempt in range(TTS_MAX_RETRIES):
        try:
            return _do_tts_stream(client, text, voice)
        except Exception as exc:
            err_str = str(exc)
            is_quota = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str
            if not is_quota or attempt == TTS_MAX_RETRIES - 1:
                raise

            # Parse retryDelay from error body (e.g. "retry in 7.628274377s")
            retry_delay = 15.0  # conservative default
            match = re.search(r"retry[^\d]*(\d+\.?\d*)", err_str, re.IGNORECASE)
            if match:
                retry_delay = float(match.group(1)) + 3.0  # add 3s buffer

            logger.warning(
                "[audio] TTS 429 on attempt %d/%d — waiting %.1fs before retry",
                attempt + 1, TTS_MAX_RETRIES, retry_delay,
            )
            time.sleep(retry_delay)

    raise RuntimeError("TTS failed after max retries")  # never reached


async def _tts_line_async(client: genai.Client, text: str, voice: str) -> AudioSegment:
    loop = asyncio.get_running_loop()
    future = loop.run_in_executor(_POOL, _tts_line_sync, client, text, voice)
    return await asyncio.wait_for(future, timeout=TTS_TIMEOUT)


async def generate_audio_job(job_id: str, context: str, settings) -> None:
    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        # Stage 1: Script generation ───────────────────────────────────────
        await job_store.update(job_id, {"status": "scripting", "progress": 5})
        logger.info("[audio] %s: generating script", job_id)

        prompt = (
            "Based ONLY on the content below, write an engaging 2-host podcast.\n"
            "Return ONLY valid JSON — an array of objects:\n"
            '[{"speaker":"Host A","dialogue":"..."},{"speaker":"Host B","dialogue":"..."},...]\n'
            "Aim for 8 exchanges (16 lines max). Keep each line under 40 words.\n\n"
            f"Content:\n{context[:6000]}"
        )
        resp = client.models.generate_content(
            model=settings.PRO_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.7,
                response_mime_type="application/json",
            ),
        )
        try:
            script = json.loads(resp.text)
            if not isinstance(script, list) or len(script) == 0:
                raise ValueError("Empty script")
            # Cap at 10 lines to avoid quota exhaustion (10 req/min limit)
            if len(script) > 10:
                script = script[:10]
        except (json.JSONDecodeError, ValueError) as e:
            raise ValueError(f"Script generation returned invalid JSON: {e}")

        total = len(script)
        logger.info("[audio] %s: script has %d lines", job_id, total)
        await job_store.update(job_id, {"progress": 20, "script": script})

        # Stage 2: TTS per line with pacing ───────────────────────────────
        combined = AudioSegment.empty()
        silence  = AudioSegment.silent(duration=SILENCE_MS)

        for i, line in enumerate(script):
            progress = 20 + int((i / total) * 65)
            await job_store.update(job_id, {
                "status":   f"tts_{i + 1}_of_{total}",
                "progress": progress,
            })
            logger.info("[audio] %s: TTS line %d/%d (%s)", job_id, i + 1, total, line.get("speaker", "?"))

            voice = VOICE_MAP.get(line.get("speaker", ""), DEFAULT_VOICE)
            text  = line.get("dialogue", "").strip()
            if not text:
                continue

            try:
                segment   = await _tts_line_async(client, text, voice)
                combined += segment + silence
            except asyncio.TimeoutError:
                raise RuntimeError(f"TTS timed out on line {i + 1} (>{TTS_TIMEOUT}s)")
            except Exception as exc:
                raise RuntimeError(f"TTS failed on line {i + 1}: {exc}")

            # Pace calls to stay under 10 req/min quota (skip delay after last line)
            if i < total - 1:
                await asyncio.sleep(TTS_INTER_LINE_DELAY)

        # Stage 3: Export MP3 ──────────────────────────────────────────────
        await job_store.update(job_id, {"status": "stitching", "progress": 90})
        logger.info("[audio] %s: exporting MP3", job_id)

        mp3_buf = io.BytesIO()
        combined.export(mp3_buf, format="mp3", bitrate="128k")
        mp3_b64 = base64.b64encode(mp3_buf.getvalue()).decode()

        await job_store.update(job_id, {
            "status":    "done",
            "progress":  100,
            "url":       f"/api/media/audio/{job_id}.mp3",
            "audio_b64": mp3_b64,
            "script":    script,
        })
        logger.info("[audio] %s: complete (%d bytes MP3)", job_id, len(mp3_buf.getvalue()))

    except Exception as exc:
        logger.error("[audio] %s: FAILED — %s", job_id, exc)
        await job_store.update(job_id, {
            "status":   "error",
            "progress": 0,
            "error":    str(exc),
        })
