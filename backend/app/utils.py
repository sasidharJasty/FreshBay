"""App-level utility helpers."""

from __future__ import annotations

import json
import os
from typing import Any, Dict

from django.utils import timezone
from PIL import Image, UnidentifiedImageError

try:  # Optional HEIF/HEIC support
    from pillow_heif import register_heif_opener

    register_heif_opener()  # enables Pillow to open .heic images
except ImportError:  # pragma: no cover - optional dependency
    register_heif_opener = None


def normalize_role(value: str | None) -> str:
    """Return a canonical role string for auth responses."""
    if not value:
        return "charity"
    normalized = value.strip().lower()
    if normalized in {"donor", "donors"}:
        return "donor"
    if normalized in {"volunteer", "volunteers"}:
        return "volunteer"
    if normalized in {"family", "families", "recipient", "recipients", "charity", "charities"}:
        return "charity"
    return "charity"


def analyze_food_image(image_path: str) -> Dict[str, Any]:
    """Use Gemini to analyse a food image and return structured JSON."""
    try:
        import google.generativeai as genai
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise RuntimeError("google-generativeai is required to analyze food images.") from exc

    api_key = "AIzaSyDBX5rzltfLtOnmH3MGbUm92J7EC6bFOno"
    if not api_key:
        raise RuntimeError("Google Generative AI API key is not configured.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("models/gemini-2.5-flash")

    try:
        img = Image.open(image_path)
    except UnidentifiedImageError as exc:
        message = "Uploaded file could not be identified as a supported image. Please use JPEG, PNG, or WebP."
        if image_path.lower().endswith(('.heic', '.heif')) and register_heif_opener is None:
            message = (
                "HEIC images require the optional 'pillow-heif' package. Install it with "
                "'pip install pillow-heif' or upload a JPEG/PNG instead."
            )
        raise RuntimeError(message) from exc

    with img:
        if img.mode not in {"RGB", "RGBA"}:
            img = img.convert("RGB")
        response = model.generate_content(
            [
                _build_food_analyzer_prompt(),
                img,
            ],
            generation_config={
                "response_mime_type": "application/json",
                "temperature": 0.2,
            },
        )

    try:
        candidate = response.candidates[0]
        part = candidate.content.parts[0]
        raw = part.text
    except (AttributeError, IndexError, KeyError) as exc:
        raise RuntimeError("Gemini response did not include JSON content.") from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Gemini response could not be parsed as JSON.") from exc


def _build_food_analyzer_prompt() -> str:
        current_date = timezone.now().date().isoformat()
        return f"""
You are FoodVision+, an advanced AI for food recognition and quality estimation.

CONTEXT:
- Today's date is {current_date}. Use this when estimating realistic expiry dates.

TASK:
Analyze the provided image of food and produce a valid JSON object with these exact fields:

{{
    "food_type": {{
        "value": "string - general food category (fruit, dairy, vegetable, meat, grain, drink, snack, etc.)",
        "confidence": "float (0 to 1) - your confidence in this classification"
    }},
    "food_item": {{
        "value": "string - specific item name like apple, banana, bread, yogurt, etc.",
        "confidence": "float (0 to 1)"
    }},
    "freshness_rating": {{
        "value": "integer (0–100) - estimate of visual freshness, 100 = perfect, 0 = spoiled",
        "confidence": "float (0 to 1)"
    }},
    "expiry_date": {{
        "value": "string - printed expiry/best-by date if visible (YYYY-MM-DD), otherwise estimate plausible expiry based on the item type and freshness",
        "confidence": "float (0 to 1)"
    }}
}}

RULES FOR OUTPUT:
- Always output valid JSON only.
- Use double quotes for all keys and string values.
- If uncertain about a field, set "value": null and "confidence": 0.0.
- Infer freshness using visual signs (color, mold, bruising, wilt).
- Estimate expiry realistically relative to today's date {current_date} (e.g. fresh fruit: 3–7 days; packaged snacks: 60–365 days).
- Confidence must reflect your certainty: higher if clearly visible or identifiable.
- DO NOT explain your reasoning or include extra text — only output JSON.
"""
