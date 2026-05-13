"""
audio_worker.py — async background task for podcast generation.

Uses RedisJobStore for all state mutations so progress is visible
across processes and survives server restarts (jobs TTL 24h).
"""
import asyncio, json
import google.genai as genai
from google.genai import types
from workers.job_store import job_store


async def generate_audio_job(job_id: str, context: str, settings) -> None:
    """
    Background task:
      1. Gemini generates a 2-host podcast script (JSON array)
      2. TTS renders each line      [STUB - replace with Cloud TTS]
      3. pydub stitches segments    [STUB - replace with ffmpeg pipeline]
    All progress is written to Redis so any worker/process can poll it.
    """
    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        # ── Stage 1: Script generation ────────────────────────────────────────
        await job_store.update(job_id, {"status": "scripting", "progress": 10})

        script_prompt = (
            "Based ONLY on the content below, write an engaging 2-host podcast "
            "conversation.\nReturn ONLY a valid JSON array in this exact format: "
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

        await job_store.update(job_id, {"progress": 30})

        # ── Stage 2: TTS per line ─────────────────────────────────────────────
        # TODO: Replace stub with real Google Cloud TTS calls:
        #   from google.cloud import texttospeech
        #   client_tts = texttospeech.TextToSpeechAsyncClient()
        #   synthesis_input = texttospeech.SynthesisInput(text=line["dialogue"])
        #   voice = texttospeech.VoiceSelectionParams(language_code="en-US", ...)
        #   audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
        #   response = await client_tts.synthesize_speech(...)
        #   audio_segment = AudioSegment.from_mp3(io.BytesIO(response.audio_content))

        total = len(script)
        for i, line in enumerate(script):
            progress = 30 + int((i / total) * 55)
            await job_store.update(job_id, {
                "status": f"tts_{i + 1}_of_{total}",
                "progress": progress,
            })
            await asyncio.sleep(0.1)  # Stub: remove when real TTS is wired in

        # ── Stage 3: Stitch audio ─────────────────────────────────────────────
        # TODO: Replace with pydub/ffmpeg pipeline:
        #   combined = AudioSegment.empty()
        #   for seg in audio_segments:
        #       combined += seg + AudioSegment.silent(duration=300)
        #   combined.export(output_path, format="mp3")
        #   output_url = upload_to_gcs(output_path)

        await job_store.update(job_id, {"status": "stitching", "progress": 90})
        await asyncio.sleep(0.2)  # Stub: remove when real stitching is wired in

        # Placeholder URL — swap for real GCS/S3 signed URL
        output_url = f"/api/media/audio/{job_id}.mp3"

        await job_store.update(job_id, {
            "status": "done",
            "progress": 100,
            "url": output_url,
            "script": script,   # stored in Redis so frontend can render it
        })

    except Exception as exc:
        await job_store.update(job_id, {
            "status": "error",
            "progress": 0,
            "error": str(exc),
        })
