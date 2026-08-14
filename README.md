# OptiMore.ai — AI-Powered Resume Analyser

> **Get the score before the door.**  
> Instantly analyse how well your resume matches a job description using Google Gemini AI.

🔗 **Live Demo:** [opti-more.vercel.app](https://opti-more.vercel.app)

---

## Overview

OptiMore.ai is a full-stack AI web application that compares a candidate's resume against a job description and produces an ATS-style match report — including a score, skill gap analysis, and AI-rewritten bullet points optimised for the role.

Built and deployed end-to-end: React frontend on Vercel, FastAPI backend on Render, and Google Gemini 3.6 Flash as the inference engine.

---

## Features

- 📄 **Resume upload** — accepts PDF, streamed directly to Google Gemini File API
- 📋 **Job description input** — paste text or upload a PDF/DOCX file
- 🤖 **AI Match Analysis** powered by Gemini 3.6 Flash:
  - Overall match score (0–100)
  - Executive summary of fit
  - Matching skills detected in both documents
  - Missing skills ranked by importance (High / Medium / Low) with recommendations
  - Up to 5 AI-rewritten bullet points optimised for the specific role's language
- ⚡ **Async pipeline** — resume is uploaded to Gemini at file-drop time, so analysis is near-instant when triggered
- 🌐 **Production deployed** — frontend on Vercel, backend on Render with environment-based CORS

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, Vanilla CSS |
| **Backend** | Python, FastAPI, Uvicorn |
| **AI / LLM** | Google Gemini 3.6 Flash (`google-genai` SDK) |
| **File Parsing** | PyMuPDF (PDF), python-docx (DOCX) |
| **Deployment** | Vercel (frontend), Render (backend) |
| **Config** | Environment variables, `python-dotenv` |

---

## Architecture

```
Browser (Vercel)
    │
    ├─ POST /api/upload/resume      ──►  FastAPI (Render)
    │       └─ File streamed to Gemini File API → returns gemini_file_uri
    │
    ├─ POST /api/upload/job-description  ──►  FastAPI (Render)
    │       └─ Text extracted from PDF/DOCX → returned to client
    │
    └─ POST /api/analyse            ──►  FastAPI (Render)
            └─ Gemini 3.6 Flash reads resume by URI + JD text
               → structured JSON response (score, skills, rewrites)
```

---

## Local Development

### Prerequisites
- Node.js 18+
- Python 3.11+
- A Google Gemini API key ([get one free](https://aistudio.google.com/app/apikey))

### Backend

```bash
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Create server/.env
echo "GEMINI_API_KEY=your_key_here" > .env
echo "ALLOWED_ORIGINS=http://localhost:5173" >> .env

uvicorn main:app --reload
# → http://localhost:8000
```

### Frontend

```bash
cd myapp
npm install

# Create myapp/.env
# Leave VITE_BACKEND_URL empty — Vite proxy forwards /api/* to localhost:8000
echo "VITE_BACKEND_URL=" > .env

npm run dev
# → http://localhost:5173
```

---

## Environment Variables

### Backend (`server/.env`)

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed frontend URLs (CORS) |

### Frontend (`myapp/.env`)

| Variable | Description |
|---|---|
| `VITE_BACKEND_URL` | Backend URL (empty for local dev, Render URL for production) |

---

## Deployment

### Backend → Render
1. Connect the GitHub repo to a new **Web Service** on [render.com](https://render.com)
2. Set **Root Directory** to `server/`
3. **Build command:** `pip install -r requirements.txt`
4. **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables: `GEMINI_API_KEY`, `ALLOWED_ORIGINS`

### Frontend → Vercel
```bash
cd myapp
vercel --prod
```
Set `VITE_BACKEND_URL=https://<your-render-service>.onrender.com` in the Vercel dashboard.

---

## Project Structure

```
Resume_Analyser/
├── server/
│   ├── main.py          # FastAPI app, CORS, route definitions
│   ├── upload.py        # File upload handler (size validation, UUID naming)
│   ├── extracttext.py   # Text extraction from PDF/DOCX
│   ├── gemini.py        # Gemini File API upload + analysis prompt
│   ├── schema.py        # Pydantic response models
│   └── requirements.txt
│
├── myapp/
│   ├── src/
│   │   ├── App.jsx      # Main React component (upload, analyse, results)
│   │   └── App.css      # Styles
│   ├── vite.config.js   # Vite config with dev proxy
│   └── vercel.json      # Vercel deployment config
│
└── render.yaml          # Render Blueprint (one-click deploy)
```

---

## Key Implementation Details

- **Async-first backend:** All I/O — file reads, Gemini API calls — are `async/await`, keeping the FastAPI event loop non-blocking.
- **Gemini File API:** Resumes are uploaded as native PDF parts, not extracted text, so Gemini reads the actual formatting and layout.
- **Structured output:** The Gemini prompt enforces a strict JSON schema, and the response is validated through a Pydantic model before being returned to the client.
- **Environment-based CORS:** Allowed origins are read from an env variable at startup — no hardcoded URLs, safe for multi-environment deploys.
- **Graceful error handling:** Non-JSON error responses (HTML error pages from proxies/cold starts) are stripped and surfaced as readable messages.

---

## License

MIT
