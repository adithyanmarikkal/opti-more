import os
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, UploadFile, File, HTTPException
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from pydantic import BaseModel
from typing import Optional
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

load_dotenv()

from upload import save_uploaded_file
from extracttext import extract_text
from gemini import upload_pdf_to_gemini, analyse_resume_vs_jd


app = FastAPI()

# Allow frontend (Vite dev server) to talk to backend
# ALLOWED_ORIGINS is a comma-separated list set in the .env file (or Render/Vercel env vars)
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173",  # fallback for local dev
)
allow_origins = [o.strip().rstrip("/") for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_RESUME_EXTENSIONS = [".pdf"]
ALLOWED_RESUME_TYPES = ["application/pdf", "application/x-pdf", "application/octet-stream"]

ALLOWED_JD_EXTENSIONS = [".pdf", ".doc", ".docx"]
ALLOWED_JD_TYPES = [
    "application/pdf",
    "application/x-pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
]


def is_valid_file(file: UploadFile, allowed_exts: list[str], allowed_types: list[str]) -> bool:
    ext = file.filename.lower().split(".")[-1] if file.filename and "." in file.filename else ""
    ext_with_dot = f".{ext}"
    return ext_with_dot in allowed_exts or file.content_type in allowed_types


@app.get("/")
def read_root():
    return {"status": "FastAPI server running!"}


@app.post("/api/upload/resume")
async def upload_resume(file: UploadFile = File(...)):
    if not is_valid_file(file, ALLOWED_RESUME_EXTENSIONS, ALLOWED_RESUME_TYPES):
        raise HTTPException(status_code=400, detail="Resume must be a PDF file.")

    # Save to disk
    try:
        result = await save_uploaded_file(file, sub_folder="resumes")
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))

    # Stream PDF to Gemini File API immediately — no need to wait for Analyse button
    try:
        gemini_uri = await upload_pdf_to_gemini(result["path"])
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    result["gemini_file_uri"] = gemini_uri
    return {"message": "Resume uploaded successfully", "file": result}


@app.post("/api/upload/job-description")
async def upload_job_description(file: UploadFile = File(...)):
    if not is_valid_file(file, ALLOWED_JD_EXTENSIONS, ALLOWED_JD_TYPES):
        raise HTTPException(
            status_code=400, detail="Job description must be a PDF, DOC, or DOCX file."
        )

    try:
        result = await save_uploaded_file(file, sub_folder="job_descriptions")
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))

    return {"message": "Job description uploaded successfully", "file": result}


# ── Analyse endpoint ──────────────────────────────────────────────────────────

class AnalyseRequest(BaseModel):
    gemini_file_uri: str           # Gemini file URI returned by /api/upload/resume
    jd_path: Optional[str] = None  # Saved path returned by /api/upload/job-description
    jd_text: Optional[str] = None  # OR raw pasted text from the textarea


@app.post("/api/analyse")
async def analyse(body: AnalyseRequest):
    # --- Extract or use JD text ---
    if body.jd_text and body.jd_text.strip():
        jd_text = body.jd_text.strip()
    elif body.jd_path:
        try:
            jd_text = extract_text(body.jd_path)
        except (FileNotFoundError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"Job description extraction failed: {e}")
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either a job description file path or pasted text."
        )

    if not jd_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract any text from the job description.")

    # --- Send to Gemini (fully async, non-blocking) ---
    try:
        analysis = await analyse_resume_vs_jd(body.gemini_file_uri, jd_text)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return analysis