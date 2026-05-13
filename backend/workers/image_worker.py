"""
image_worker.py - Image generation using Imagen 4 (imagen-4.0-generate-001).
Available via standard Gemini API key (confirmed working).
"""
import asyncio, base64, logging, concurrent.futures
import google.genai as genai
from google.genai import types
from workers.job_store import job_store

logger = logging.getLogger(__name__)
IMAGE_TIMEOUT = 120  # seconds
_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=2)

IMAGE_MODEL = "imagen-4.0-generate-001"


def _generate_image_sync(client: genai.Client, refined_prompt: str) -> tuple[bytes, str]:
    """Run Imagen 4 synchronously in a thread pool. Returns (image_bytes, mime_type)."""
    resp = client.models.generate_images(
        model=IMAGE_MODEL,
        prompt=refined_prompt,
        config=types.GenerateImagesConfig(
            number_of_images=1,
            aspect_ratio="16:9",
            safety_filter_level="BLOCK_LOW_AND_ABOVE",
        ),
    )
    if not resp.generated_images:
        raise ValueError("Imagen 4 returned no images — prompt may have been blocked by safety filters")
    raw = resp.generated_images[0].image.image_bytes
    return raw, "image/png"


async def generate_image_job(job_id: str, context: str, prompt: str, settings) -> None:
    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        # Stage 1: Build refined visual prompt from context + user intent ──
        await job_store.update(job_id, {"status": "prompting", "progress": 15})
        logger.info("[image] %s: building prompt", job_id)

        prompt_builder = (
            "You are a visual prompt engineer. Given source material and a user intent, "
            "write a single, detailed image generation prompt (max 150 words). "
            "Be specific about style, composition, lighting, colors, and subject.\n\n"
            f"User intent: {prompt}\n\n"
            f"Source context:\n{context[:2000]}"
        )
        meta_resp = client.models.generate_content(
            model=settings.CHAT_MODEL,
            contents=prompt_builder,
            config=types.GenerateContentConfig(temperature=0.7, max_output_tokens=250),
        )
        refined_prompt = meta_resp.text.strip()
        logger.info("[image] %s: refined prompt: %s", job_id, refined_prompt[:100])
        await job_store.update(job_id, {"progress": 35, "refined_prompt": refined_prompt})

        # Stage 2: Generate image with Imagen 4 ────────────────────────────
        await job_store.update(job_id, {"status": "generating", "progress": 50})
        logger.info("[image] %s: calling %s", job_id, IMAGE_MODEL)

        loop   = asyncio.get_running_loop()
        future = loop.run_in_executor(_POOL, _generate_image_sync, client, refined_prompt)
        img_bytes, mime_type = await asyncio.wait_for(future, timeout=IMAGE_TIMEOUT)

        img_b64 = base64.b64encode(img_bytes).decode()
        logger.info("[image] %s: done — %d bytes (%s)", job_id, len(img_bytes), mime_type)

        await job_store.update(job_id, {
            "status":         "done",
            "progress":       100,
            "image_b64":      img_b64,
            "mime_type":      mime_type,
            "refined_prompt": refined_prompt,
            "url":            f"/api/media/image/{job_id}.png",
        })

    except asyncio.TimeoutError:
        msg = f"Image generation timed out after {IMAGE_TIMEOUT}s"
        logger.error("[image] %s: %s", job_id, msg)
        await job_store.update(job_id, {"status": "error", "progress": 0, "error": msg})
    except Exception as exc:
        logger.error("[image] %s: FAILED — %s", job_id, exc)
        await job_store.update(job_id, {"status": "error", "progress": 0, "error": str(exc)})
