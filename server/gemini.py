"""
gemini.py — Upload resume PDF to Gemini File API and compare against JD.

Uses the current google-genai SDK (google.genai), NOT the deprecated google.generativeai.

Two responsibilities:
  1. upload_pdf_to_gemini(file_path)   — called at resume-upload time, returns file URI
  2. analyse_resume_vs_jd(uri, jd)    — called at analyse time, fully async
"""

import os
import json
from pathlib import Path

# pyrefly: ignore [missing-import]
from google import genai
# pyrefly: ignore [missing-import]
from google.genai import types
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

from schema import MatchAnalysisResponse

# ── Init ──────────────────────────────────────────────────────────────────────

# Load .env from the same directory as this file (server/.env)
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY environment variable is not set. "
        "Add it to server/.env: GEMINI_API_KEY=AIza..."
    )

MODEL_NAME = "gemini-3.6-flash"

# Client created once at module load — shared across all requests
_client = genai.Client(api_key=GEMINI_API_KEY)

# ── Gemini File API ───────────────────────────────────────────────────────────

async def upload_pdf_to_gemini(file_path: str) -> str:
    """
    Upload a PDF to Gemini's File API (async).
    Returns the file URI — used later in analyse_resume_vs_jd().

    Args:
        file_path: Absolute path to the saved PDF on disk.

    Returns:
        Gemini file URI string (e.g. 'https://generativelanguage.googleapis.com/...').

    Raises:
        RuntimeError: If the upload fails.
    """
    try:
        response = await _client.aio.files.upload(
            file=file_path,
            config=types.UploadFileConfig(mime_type="application/pdf"),
        )
        return response.uri
    except Exception as e:
        raise RuntimeError(f"Gemini file upload failed: {e}")


# ── Analysis ──────────────────────────────────────────────────────────────────

SYSTEM_INSTRUCTION = (
    "You are an expert ATS (Applicant Tracking System) and career coach. "
    "Analyse how well the provided resume matches the provided job description. "
    "Respond ONLY with a valid JSON object — no markdown, no explanation, just raw JSON."
)

RESPONSE_SCHEMA = """\
{
  "overall_match_score": <integer 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "matching_skills": ["<skill>", ...],
  "missing_skills": [
    {
      "skill": "<skill name>",
      "importance": "<High | Medium | Low>",
      "recommendation": "<one sentence on how to address this gap>"
    }
  ],
  "bullet_improvements": [
    {
      "original_text": "<existing resume bullet point>",
      "improved_text": "<rewritten version using JD language>",
      "reasoning": "<why this improvement helps>"
    }
  ]
}

Rules:
- overall_match_score: integer 0–100.
- matching_skills: skills/keywords present in BOTH the JD and resume.
- missing_skills: skills required by JD but absent from resume (max 10).
- bullet_improvements: up to 5 resume bullet points rewritten to match JD language.
- Do not hallucinate skills not mentioned in either document.
"""


async def analyse_resume_vs_jd(gemini_file_uri: str, jd_text: str) -> MatchAnalysisResponse:
    """
    Compare a resume (already uploaded to Gemini File API) against a JD text.
    Fully async — does not block the event loop.

    Args:
        gemini_file_uri: URI returned by upload_pdf_to_gemini().
        jd_text:         Extracted plain text of the job description.

    Returns:
        MatchAnalysisResponse Pydantic model.

    Raises:
        ValueError:   If Gemini returns invalid/unparseable JSON.
        RuntimeError: If the Gemini API call fails.
    """
    prompt = (
        f"{SYSTEM_INSTRUCTION}\n\n"
        f"Return a JSON object matching this schema:\n{RESPONSE_SCHEMA}\n\n"
        f"JOB DESCRIPTION:\n{jd_text}"
    )

    # Resume PDF passed by URI — Gemini reads the file natively
    resume_part = types.Part.from_uri(
        file_uri=gemini_file_uri,
        mime_type="application/pdf",
    )

    try:
        response = await _client.aio.models.generate_content(
            model=MODEL_NAME,
            contents=[resume_part, prompt],
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )
    except Exception as e:
        raise RuntimeError(f"Gemini API call failed: {e}")

    raw_text = response.text.strip()

    # Strip markdown code fences if the model wraps the response in ```json ... ```
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Gemini returned invalid JSON: {e}\nRaw response:\n{raw_text}")

    return MatchAnalysisResponse(**data)
