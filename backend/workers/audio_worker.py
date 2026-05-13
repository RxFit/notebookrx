"""
audio_worker.py - async background task for podcast generation.

TTS: gemini-2.5-flash-preview-tts
Produces audio bytes per dialogue line, stitched with pydub.
"""
import asyncio, io, json, base64, logging, concurrent.futures
import google.genai as genai
from google.genai import types
from pydub import AudioSegment
from workers.job_store import job_store

logger = logging.getLogger(__name__)

SILENCE_MS   = 350   # gap between speakers
TTS_TIMEOUT  = 60    # seconds per line before giving up
VOICE_MAP    = {"Host A": "Charon", "Host B": "Aoede"}
DEFAULT_VOICE = "Kore"

# Thread pool for blocking TTS calls (keeps event loop free)
_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=4)


def _tts_line_sync(client: genai.Client, text: str, voice: str) -> AudioSegment:
    """Synchronous TTS call — runs in thread pool, not in event loop."""
    resp = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=voice
                    )
                )
            ),
        ),
    )
    part = resp.candidates[0].content.parts[0]
    raw_bytes = base64.b64decode(part.inline_data.data)
    # Gemini TTS outputs 24 kHz mono 16-bit PCM
    return AudioSegment(data=raw_bytes, sample_width=2, frame_rate=24000, channels=1)


async def _tts_line_async(client: genai.Client, text: str, voice: str) -> AudioSegment:
    """Run TTS in thread pool with a timeout."""
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

        # Stage 2: TTS per line ────────────────────────────────────────────
        combined = AudioSegment.empty()
        silence  = AudioSegment.silent(duration=SILENCE_MS)

        for i, line in enumerate(script):
            progress = 20 + int((i / total) * 65)
            status   = f"tts_{i + 1}_of_{total}"
            await job_store.update(job_id, {"status": status, "progress": progress})
            logger.info("[audio] %s: TTS line %d/%d (%s)", job_id, i + 1, total, line.get("speaker", "?"))

            voice = VOICE_MAP.get(line.get("speaker", ""), DEFAULT_VOICE)
            text  = line.get("dialogue", "").strip()
            if not text:
                continue

            try:
                segment  = await _tts_line_async(client, text, voice)
                combined += segment + silence
            except asyncio.TimeoutError:
                logger.error("[audio] %s: TTS line %d timed out after %ds", job_id, i + 1, TTS_TIMEOUT)
                raise RuntimeError(f"TTS timed out on line {i + 1} (>{TTS_TIMEOUT}s). Try shorter documents.")
            except Exception as exc:
                logger.error("[audio] %s: TTS line %d failed: %s", job_id, i + 1, exc)
                raise RuntimeError(f"TTS failed on line {i + 1}: {exc}")

        # Stage 3: Export to MP3 ───────────────────────────────────────────
        await job_store.update(job_id, {"status": "stitching", "progress": 90})
        logger.info("[audio] %s: exporting MP3", job_id)

        mp3_buf = io.BytesIO()
        combined.export(mp3_buf, format="mp3", bitrate="128k")
        mp3_b64 = base64.b64encode(mp3_buf.getvalue()).decode()

        await job_store.update(job_id, {
            "status":   "done",
            "progress": 100,
            "url":      f"/api/media/audio/{job_id}.mp3",
            "audio_b64": mp3_b64,
            "script":   script,
        })
        logger.info("[audio] %s: complete", job_id)

    except Exception as exc:
        logger.error("[audio] %s: FAILED — %s", job_id, exc)
        await job_store.update(job_id, {
            "status":   "error",
            "progress": 0,
            "error":    str(exc),
        })
