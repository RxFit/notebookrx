"""
image_worker.py — Imagen 3 image generation from document context.
Uses google-genai Imagen 3 API — no Cloud Storage needed, returns base64.
"""
import asyncio, base64
import google.genai as genai
from google.genai import types
from workers.job_store import job_store


async def generate_image_job(job_id: str, context: str, prompt: str, settings) -> None:
    """Generate an image from document context using Imagen 3."""
    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        # ── Stage 1: Build a rich image prompt from context + user intent ──
        await job_store.update(job_id, {"status": "prompting", "progress": 15})

        prompt_builder = (
            "You are a visual prompt engineer. Given source material and a user intent, "
            "write a single, detailed, high-quality image generation prompt (max 200 words). "
            "Focus on visual elements: style, composition, lighting, colors, subject matter.\n\n"
            f"User intent: {prompt}\n\n"
            f"Source context:\n{context[:2000]}"
        )
        resp = client.models.generate_content(
            model=settings.CHAT_MODEL,
            contents=prompt_builder,
            config=types.GenerateContentConfig(temperature=0.7, max_output_tokens=300),
        )
        refined_prompt = resp.text.strip()
        await job_store.update(job_id, {"progress": 35, "refined_prompt": refined_prompt})

        # ── Stage 2: Generate image with Imagen 3 ──────────────────────────
        await job_store.update(job_id, {"status": "generating", "progress": 50})

        img_resp = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: client.models.generate_images(
                model="imagen-3.0-generate-001",
                prompt=refined_prompt,
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    aspect_ratio="16:9",
                    safety_filter_level="BLOCK_MEDIUM_AND_ABOVE",
                    person_generation="ALLOW_ADULT",
                ),
            ),
        )

        if not img_resp.generated_images:
            raise ValueError("Imagen 3 returned no images — prompt may have been blocked by safety filters")

        raw_bytes = img_resp.generated_images[0].image.image_bytes
        img_b64 = base64.b64encode(raw_bytes).decode()

        await job_store.update(job_id, {
            "status": "done",
            "progress": 100,
            "image_b64": img_b64,
            "mime_type": "image/png",
            "refined_prompt": refined_prompt,
            "url": f"/api/media/image/{job_id}.png",
        })

    except Exception as exc:
        await job_store.update(job_id, {
            "status": "error",
            "progress": 0,
            "error": str(exc),
        })
