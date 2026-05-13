"""
audio_worker.py — async background task for podcast generation.

TTS: gemini-2.5-flash-preview-tts (native Gemini TTS — no GCP credentials needed)
     Produces audio bytes for each dialogue line, stitched with pydub.
"""
import asyncio, io, json, base64, os
import google.genai as genai
from google.genai import types
from pydub import AudioSegment
from workers.job_store import job_store

SILENCE_MS = 350   # gap between speakers


async def _tts_line(client: genai.Client, text: str, voice: str) -> AudioSegment:
    """Generate TTS for one line and return as pydub AudioSegment."""
    resp = client.models.generate_content(
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
    )
    # Audio comes back as base64-encoded PCM in the response parts
    audio_part = resp.candidates[0].content.parts[0]
    raw_bytes = base64.b64decode(audio_part.inline_data.data)
    # Gemini TTS outputs 24kHz mono 16-bit PCM
    return AudioSegment(
        data=raw_bytes,
        sample_width=2,   # 16-bit
        frame_rate=24000,
        channels=1,
    )


async def generate_audio_job(job_id: str, context: str, settings) -> None:
    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        # ── Stage 1: Script generation ─────────────────────────────────────
        await job_store.update(job_id, {"status": "scripting", "progress": 10})

        script_prompt = (
            "Based ONLY on the content below, write an engaging 2-host podcast "
            "conversation.\nReturn ONLY a valid JSON array:\n"
            '[{"speaker": "Host A", "dialogue": "..."}, ...]\n'
            "Minimum 6 exchanges. Be informative and conversational.\n\n"
            f"Content:\n{context}"
        )
        resp = client.models.generate_content(
            model=settings.PRO_MODEL,
            contents=script_prompt,
            config=types.GenerateContentConfig(
                temperature=0.7,
                response_mime_type="application/json",
            ),
        )
        try:
            script = json.loads(resp.text)
        except json.JSONDecodeError:
            raise ValueError("Script generation returned invalid JSON")

        await job_store.update(job_id, {"progress": 25})

        # ── Stage 2: TTS per line (Gemini native TTS) ──────────────────────
        # Voices: Charon (deep male) for Host A, Aoede (warm female) for Host B
        VOICE_MAP = {"Host A": "Charon", "Host B": "Aoede"}
        DEFAULT_VOICE = "Kore"

        combined = AudioSegment.empty()
        silence = AudioSegment.silent(duration=SILENCE_MS)
        total = len(script)

        for i, line in enumerate(script):
            progress = 25 + int((i / total) * 60)
            await job_store.update(job_id, {
                "status": f"tts_{i + 1}_of_{total}",
                "progress": progress,
            })
            voice = VOICE_MAP.get(line.get("speaker", ""), DEFAULT_VOICE)
            # Run blocking TTS call in thread pool to avoid blocking event loop
            segment = await asyncio.get_event_loop().run_in_executor(
                None, lambda t=line["dialogue"], v=voice: asyncio.run(_tts_line_sync(client, t, v))
            )
            combined += segment + silence

        await job_store.update(job_id, {"status": "stitching", "progress": 90})

        # ── Stage 3: Export to MP3 bytes, base64-encode for storage ────────
        mp3_buf = io.BytesIO()
        combined.export(mp3_buf, format="mp3", bitrate="128k")
        mp3_b64 = base64.b64encode(mp3_buf.getvalue()).decode()

        # Store base64 audio in Redis (expires with job TTL)
        await job_store.update(job_id, {
            "status": "done",
            "progress": 100,
            "url": f"/api/media/audio/{job_id}.mp3",
            "audio_b64": mp3_b64,
            "script": script,
        })

    except Exception as exc:
        await job_store.update(job_id, {
            "status": "error",
            "progress": 0,
            "error": str(exc),
        })


def _tts_line_sync(client: genai.Client, text: str, voice: str) -> AudioSegment:
    """Synchronous wrapper for TTS (called via run_in_executor)."""
    resp = client.models.generate_content(
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
    )
    audio_part = resp.candidates[0].content.parts[0]
    raw_bytes = base64.b64decode(audio_part.inline_data.data)
    return AudioSegment(
        data=raw_bytes,
        sample_width=2,
        frame_rate=24000,
        channels=1,
    )
