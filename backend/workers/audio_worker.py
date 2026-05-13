"""
audio_worker.py - async background task for podcast generation.

CRITICAL FIX: Gemini TTS must use generate_content_stream() — the non-streaming
generate_content() only returns the first audio chunk (~150 bytes instead of ~500KB).
"""
import asyncio, io, json, base64, logging, concurrent.futures
import google.genai as genai
from google.genai import types
from pydub import AudioSegment
from workers.job_store import job_store

logger = logging.getLogger(__name__)

SILENCE_MS   = 350
TTS_TIMEOUT  = 90    # seconds per line
VOICE_MAP    = {"Host A": "Charon", "Host B": "Aoede"}
DEFAULT_VOICE = "Kore"

_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=4)


def _tts_line_sync(client: genai.Client, text: str, voice: str) -> AudioSegment:
    """
    Stream TTS from Gemini and concatenate ALL audio chunks.
    Must use generate_content_stream — non-streaming only returns ~150 bytes.
    """
    audio_chunks = []
    frame_rate   = 24000  # default; parsed from mime_type if available

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
            # Parse frame rate from first chunk mime_type (e.g. "audio/L16;codec=pcm;rate=24000")
            if len(audio_chunks) == 1:
                mime = part.inline_data.mime_type or ""
                if "rate=" in mime:
                    try:
                        frame_rate = int(mime.split("rate=")[1].split(";")[0].split(",")[0])
                    except ValueError:
                        pass

    raw_bytes = b"".join(audio_chunks)

    if not raw_bytes:
        raise ValueError("TTS returned empty audio data — text may have been filtered")

    # PCM L16 requires 2-byte alignment (sample_width=2, channels=1 → frame_size=2)
    if len(raw_bytes) % 2 != 0:
        raw_bytes = raw_bytes[:-1]   # drop last orphan byte

    logger.debug("TTS chunk: %d bytes, %.2fs at %dHz", len(raw_bytes), len(raw_bytes)/(frame_rate*2), frame_rate)

    return AudioSegment(
        data=raw_bytes,
        sample_width=2,
        frame_rate=frame_rate,
        channels=1,
    )


async def _tts_line_async(client: genai.Client, text: str, voice: str) -> AudioSegment:
    loop   = asyncio.get_running_loop()
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
            "Minimum 6 exchanges. Keep each line under 40 words.\n\n"
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
        except (json.JSONDecodeError, ValueError) as e:
            raise ValueError(f"Script generation returned invalid JSON: {e}")

        total = len(script)
        logger.info("[audio] %s: script has %d lines", job_id, total)
        await job_store.update(job_id, {"progress": 20, "script": script})

        # Stage 2: TTS per line (streaming) ───────────────────────────────
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
