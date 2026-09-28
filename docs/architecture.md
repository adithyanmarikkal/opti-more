# OptiMore.ai — Architecture Documentation

> AI-powered resume analyser built on React + FastAPI + Google Gemini.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Component Breakdown](#3-component-breakdown)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
   - [Resume Upload Flow](#41-resume-upload-flow)
   - [Job Description Flow](#42-job-description-flow)
   - [Analysis Flow](#43-analysis-flow)
5. [Backend Module Map](#5-backend-module-map)
6. [Frontend State Machine](#6-frontend-state-machine)
7. [API Contract](#7-api-contract)
8. [Deployment Topology](#8-deployment-topology)
9. [Key Design Decisions](#9-key-design-decisions)

---

## 1. System Overview

OptiMore.ai is a two-tier, full-stack web application:

| Tier | Technology | Host |
|---|---|---|
| **Frontend** | React 19 + Vite 8, Vanilla CSS | Vercel |
| **Backend** | Python 3.11, FastAPI, Uvicorn | Render |
| **AI Inference** | Google Gemini 3.6 Flash (`google-genai` SDK) | Google Cloud |

The key architectural insight is an **async-first, split-upload pipeline**: the resume PDF is streamed to the Gemini File API at file-drop time (not at analysis time), so the final analysis call is nearly instant from the user's perspective.

---

## 2. High-Level Architecture

```mermaid
graph TB
    subgraph Client["🌐 Browser — Vercel CDN"]
        UI["React App\n(App.jsx)"]
    end

    subgraph Backend["⚙️ FastAPI Server — Render"]
        API["main.py\nFastAPI + CORS"]
        UPL["upload.py\nFile Handler"]
        EXT["extracttext.py\nPDF / DOCX Parser"]
        GEM["gemini.py\nGemini Client"]
        SCH["schema.py\nPydantic Models"]
    end

    subgraph GCloud["☁️ Google Cloud"]
        FAPI["Gemini File API\n(PDF storage)"]
        MODEL["Gemini 3.6 Flash\n(LLM inference)"]
    end

    subgraph Storage["💾 Local Disk (Render ephemeral)"]
        RES["uploads/resumes/"]
        JDS["uploads/job_descriptions/"]
    end

    UI -->|"POST /api/upload/resume\n(multipart)"| API
    UI -->|"POST /api/upload/job-description\n(multipart)"| API
    UI -->|"POST /api/analyse\n(JSON)"| API

    API --> UPL
    API --> EXT
    API --> GEM
    GEM --> SCH

    UPL --> RES
    UPL --> JDS

    GEM -->|"files.upload (async)"| FAPI
    GEM -->|"models.generate_content (async)"| MODEL
    FAPI -.->|"file URI reference"| MODEL

    style Client fill:#fff8f0,stroke:#c2652a,color:#3a302a
    style Backend fill:#f0f4ff,stroke:#5a6fa0,color:#1a2240
    style GCloud fill:#e8f5e9,stroke:#2e7d32,color:#1b4020
    style Storage fill:#f9f9f9,stroke:#aaa,color:#555
```

---

## 3. Component Breakdown

```mermaid
graph LR
    subgraph FE["Frontend (myapp/src/)"]
        APPJSX["App.jsx\n────────\n• All UI state\n• File upload handlers\n• Analyse trigger\n• Results renderer"]
        APPCSS["App.css / index.css\n────────\n• Design tokens\n• Utility classes"]
        MAINJSX["main.jsx\n────────\n• React DOM root"]
    end

    subgraph BE["Backend (server/)"]
        MAIN["main.py\n────────\n• FastAPI app\n• CORS middleware\n• Route definitions\n• Input validation"]
        UPLOAD["upload.py\n────────\n• UUID filename gen\n• 5 MB size guard\n• Disk persistence"]
        EXTRACT["extracttext.py\n────────\n• PyMuPDF → PDF text\n• python-docx → DOCX"]
        GEMINI["gemini.py\n────────\n• Gemini client (shared)\n• upload_pdf_to_gemini()\n• analyse_resume_vs_jd()"]
        SCHEMA["schema.py\n────────\n• MissingSkill\n• BulletImprovement\n• MatchAnalysisResponse"]
    end

    APPJSX -->|"fetch /api/*"| MAIN
    MAIN --> UPLOAD
    MAIN --> EXTRACT
    MAIN --> GEMINI
    GEMINI --> SCHEMA
```

---

## 4. Data Flow Diagrams

### 4.1 Resume Upload Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as React App
    participant API as FastAPI /api/upload/resume
    participant UPL as upload.py
    participant GEM as gemini.py
    participant FAPI as Gemini File API

    User->>UI: Selects PDF resume
    UI->>API: POST /api/upload/resume (multipart/form-data)
    API->>API: Validate extension (.pdf) & MIME type
    API->>UPL: save_uploaded_file(file, "resumes")
    UPL->>UPL: Generate UUID filename
    UPL->>UPL: Enforce 5 MB limit
    UPL-->>API: { path, saved_name, size, ... }
    API->>GEM: upload_pdf_to_gemini(path)
    GEM->>FAPI: client.aio.files.upload(file, mime=pdf)
    FAPI-->>GEM: { uri: "https://generativelanguage..." }
    GEM-->>API: gemini_file_uri
    API-->>UI: { message, file: { gemini_file_uri, ... } }
    UI->>UI: Store gemini_file_uri in state
    Note over UI: Resume is now pre-staged in Gemini — analysis will be fast
```

### 4.2 Job Description Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as React App
    participant API as FastAPI
    participant UPL as upload.py
    participant EXT as extracttext.py

    alt Paste Text (default)
        User->>UI: Types / pastes JD text
        UI->>UI: Store jd_text in state (no API call yet)
    else Upload File (PDF / DOC / DOCX)
        User->>UI: Selects JD file
        UI->>API: POST /api/upload/job-description (multipart)
        API->>API: Validate extension & MIME type
        API->>UPL: save_uploaded_file(file, "job_descriptions")
        UPL-->>API: { path, ... }
        API-->>UI: { file: { path, ... } }
        UI->>UI: Store jd_path in state
        Note over EXT: Text extraction happens lazily at /api/analyse time
    end
```

### 4.3 Analysis Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as React App
    participant API as FastAPI /api/analyse
    participant EXT as extracttext.py
    participant GEM as gemini.py
    participant MODEL as Gemini 3.6 Flash
    participant SCH as schema.py

    User->>UI: Clicks "Analyze Now"
    UI->>API: POST /api/analyse\n{ gemini_file_uri, jd_path?, jd_text? }

    alt JD provided as raw text
        API->>API: Use jd_text directly
    else JD provided as uploaded file
        API->>EXT: extract_text(jd_path)
        EXT-->>API: Plain-text JD string
    end

    API->>GEM: analyse_resume_vs_jd(gemini_file_uri, jd_text)
    GEM->>GEM: Build prompt with system instruction + JSON schema
    GEM->>MODEL: generate_content([resume_part_by_uri, prompt])
    Note over MODEL: Reads resume PDF natively via file URI\nNo re-upload needed
    MODEL-->>GEM: Raw JSON response
    GEM->>GEM: Strip markdown fences if present
    GEM->>GEM: json.loads(raw_text)
    GEM->>SCH: MatchAnalysisResponse(**data)
    SCH-->>GEM: Validated Pydantic model
    GEM-->>API: MatchAnalysisResponse
    API-->>UI: JSON { overall_match_score, summary, matching_skills, missing_skills, bullet_improvements }
    UI->>UI: Render results panel & smooth-scroll to it
```

---

## 5. Backend Module Map

```mermaid
graph TD
    MAIN["main.py\nEntry Point"]

    MAIN -->|"imports"| UPL["upload.py"]
    MAIN -->|"imports"| EXT["extracttext.py"]
    MAIN -->|"imports"| GEM["gemini.py"]
    GEM  -->|"imports"| SCH["schema.py"]

    subgraph Responsibilities
        UPL --- UPL_DESC["• os / uuid\n• Save file to disk\n• Enforce 5 MB limit\n• Return metadata dict"]
        EXT --- EXT_DESC["• PyMuPDF (fitz) for PDF\n• python-docx for DOCX\n• Returns plain text string"]
        GEM --- GEM_DESC["• google-genai SDK\n• Shared _client singleton\n• upload_pdf_to_gemini()\n• analyse_resume_vs_jd()\n• JSON + Pydantic validation"]
        SCH --- SCH_DESC["• MissingSkill\n• BulletImprovement\n• MatchAnalysisResponse"]
    end

    style MAIN fill:#dce8ff,stroke:#5a6fa0
    style UPL fill:#fff3dc,stroke:#c2652a
    style EXT fill:#fff3dc,stroke:#c2652a
    style GEM fill:#dcffe8,stroke:#2e7d32
    style SCH fill:#f5dcff,stroke:#7b2fa0
```

---

## 6. Frontend State Machine

```mermaid
stateDiagram-v2
    [*] --> Idle : App loads

    state "Job Description" as JD {
        [*] --> JD_Paste : default tab
        JD_Paste --> JD_Upload : switch tab
        JD_Upload --> JD_Paste : switch tab
        JD_Paste --> JD_TextReady : user types text
        JD_Upload --> JD_Uploading : file selected
        JD_Uploading --> JD_FileReady : upload success
        JD_Uploading --> JD_Error : upload failure
    }

    state "Resume" as RES {
        [*] --> RES_Empty
        RES_Empty --> RES_Uploading : file selected
        RES_Uploading --> RES_Ready : upload + Gemini pre-stage OK\n(gemini_file_uri stored)
        RES_Uploading --> RES_Error : upload / Gemini failure
    }

    state "Analysis" as ANA {
        [*] --> ANA_Idle
        ANA_Idle --> ANA_Running : Analyze Now clicked
        ANA_Running --> ANA_Done : Gemini response OK
        ANA_Running --> ANA_Failed : API error
        ANA_Done --> ANA_Idle : new analysis
    }

    Idle --> JD
    Idle --> RES
    JD_TextReady --> ANA_Idle : both inputs ready
    JD_FileReady --> ANA_Idle : both inputs ready
    RES_Ready --> ANA_Idle : both inputs ready
```

---

## 7. API Contract

### `GET /`
Health check.
```json
{ "status": "FastAPI server running!" }
```

---

### `POST /api/upload/resume`
Upload a PDF resume. The file is immediately forwarded to the Gemini File API.

**Request:** `multipart/form-data` — field `file` (PDF only, max 5 MB)

**Response `200`:**
```json
{
  "message": "Resume uploaded successfully",
  "file": {
    "original_name": "john_doe_resume.pdf",
    "saved_name": "a3f9...hex.pdf",
    "path": "/app/server/uploads/resumes/a3f9...hex.pdf",
    "size": 204800,
    "content_type": "application/pdf",
    "gemini_file_uri": "https://generativelanguage.googleapis.com/v1beta/files/..."
  }
}
```

**Errors:** `400` (wrong type) · `413` (> 5 MB) · `503` (Gemini upload failed)

---

### `POST /api/upload/job-description`
Upload a PDF, DOC, or DOCX job description. Text is extracted lazily at analyse time.

**Request:** `multipart/form-data` — field `file` (PDF/DOC/DOCX, max 5 MB)

**Response `200`:**
```json
{
  "message": "Job description uploaded successfully",
  "file": {
    "original_name": "jd_software_engineer.pdf",
    "saved_name": "b7c2...hex.pdf",
    "path": "/app/server/uploads/job_descriptions/b7c2...hex.pdf",
    "size": 102400,
    "content_type": "application/pdf"
  }
}
```

**Errors:** `400` (wrong type) · `413` (> 5 MB)

---

### `POST /api/analyse`
Run the ATS match analysis.

**Request body:**
```json
{
  "gemini_file_uri": "https://generativelanguage.googleapis.com/v1beta/files/...",
  "jd_path": "/app/server/uploads/job_descriptions/b7c2...hex.pdf",
  "jd_text": null
}
```
> Provide either `jd_path` (uploaded file) **or** `jd_text` (pasted text) — not both.

**Response `200` (`MatchAnalysisResponse`):**
```json
{
  "overall_match_score": 74,
  "summary": "Strong Python background with solid FastAPI experience...",
  "matching_skills": ["Python", "FastAPI", "REST APIs", "PostgreSQL"],
  "missing_skills": [
    {
      "skill": "Kubernetes",
      "importance": "High",
      "recommendation": "Obtain CKA certification or add a k8s side-project."
    }
  ],
  "bullet_improvements": [
    {
      "original_text": "Built REST APIs using Flask.",
      "improved_text": "Architected and deployed production-grade REST APIs with FastAPI...",
      "reasoning": "JD emphasises FastAPI and production deployment experience."
    }
  ]
}
```

**Errors:** `400` (bad input) · `500` (invalid Gemini JSON) · `503` (Gemini API failure)

---

## 8. Deployment Topology

```mermaid
graph LR
    subgraph Internet
        USER["👤 User\nBrowser"]
    end

    subgraph Vercel["Vercel Edge Network"]
        CDN["CDN / Edge Cache"]
        SPA["React SPA\n(static bundle)"]
        VPROXY["vercel.json\n/api/* → Render"]
    end

    subgraph Render["Render Web Service"]
        UVICORN["Uvicorn\n0.0.0.0:$PORT"]
        APP["FastAPI App"]
        DISK["Ephemeral Disk\n/uploads/*"]
    end

    subgraph Google["Google Cloud"]
        GEMINI_FILES["Gemini File API"]
        GEMINI_LLM["Gemini 3.6 Flash"]
    end

    USER -->|HTTPS| CDN
    CDN --> SPA
    SPA -->|"/api/* requests"| VPROXY
    VPROXY -->|HTTPS| UVICORN
    UVICORN --> APP
    APP --> DISK
    APP -->|google-genai SDK| GEMINI_FILES
    APP -->|google-genai SDK| GEMINI_LLM

    style Vercel fill:#f0f4ff,stroke:#5a6fa0
    style Render fill:#fff8f0,stroke:#c2652a
    style Google fill:#e8f5e9,stroke:#2e7d32
```

### Environment Variables

| Location | Variable | Purpose |
|---|---|---|
| `server/.env` | `GEMINI_API_KEY` | Authenticates `google-genai` SDK |
| `server/.env` | `ALLOWED_ORIGINS` | Comma-separated CORS whitelist |
| `myapp/.env` | `VITE_BACKEND_URL` | Backend base URL (empty = Vite proxy in dev) |

> **Local dev:** `VITE_BACKEND_URL` is left empty — `vite.config.js` proxies `/api/*` to `http://localhost:8000`, so no CORS issues arise.

---

## 9. Key Design Decisions

| Decision | Rationale |
|---|---|
| **Pre-stage resume at upload time** | Eliminates the biggest latency bottleneck. Gemini File API upload can take seconds; doing it eagerly while the user fills in the JD makes the final "Analyze" click feel instant. |
| **Gemini File API (PDF native)** | Gemini reads the actual PDF formatting and layout rather than extracted plain text, producing higher-quality ATS analysis. |
| **Structured JSON output enforced in prompt** | The prompt includes an explicit JSON schema and `response_mime_type="application/json"` to minimise hallucinated structure. A Pydantic model is then used for strict validation. |
| **Single shared `_client` singleton** | `genai.Client` is created once at module load in `gemini.py` and reused across all requests — avoids repeated auth/handshake overhead. |
| **`async/await` everywhere** | All I/O paths (file reads, Gemini SDK calls) use `await` to keep the FastAPI event loop non-blocking under concurrent requests. |
| **Environment-based CORS** | `ALLOWED_ORIGINS` is read from `.env` at startup — no hardcoded URLs, safe for multi-environment deploys (local → staging → production). |
| **UUID filenames** | Uploaded files are renamed to `uuid4().hex + ext` to prevent filename collisions and path traversal attacks. |
| **Graceful HTML error stripping** | The frontend `parseErrorResponse()` utility strips HTML tags from Render cold-start error pages so users see readable messages rather than raw HTML. |
