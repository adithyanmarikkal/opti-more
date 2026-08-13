import { useState, useRef } from 'react'
import './App.css'

// Shared upload function — posts a file to the given API endpoint
async function uploadFile(file, endpoint) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Upload failed')
  }

  return res.json()
}

function App() {
  // Job Description state
  const [jobDescText, setJobDescText] = useState('')
  const [jobDescFile, setJobDescFile] = useState(null)
  const [jobDescUploadResult, setJobDescUploadResult] = useState(null)
  const [jobDescUploading, setJobDescUploading] = useState(false)
  const jobDescFileRef = useRef(null)

  // Resume state
  const [resumeFile, setResumeFile] = useState(null)
  const [resumeUploadResult, setResumeUploadResult] = useState(null)
  const [resumeUploading, setResumeUploading] = useState(false)
  const resumeFileRef = useRef(null)

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analysing, setAnalysing] = useState(false)
  const [analyseError, setAnalyseError] = useState(null)

  // Helper: check file extension
  const hasExtension = (file, exts) => {
    if (!file || !file.name) return false
    const name = file.name.toLowerCase()
    return exts.some((ext) => name.endsWith(ext))
  }

  // Handle job description file upload (PDF or DOCX)
  const handleJobDescFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const allowedMime = [
      'application/pdf',
      'application/x-pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    const allowedExts = ['.pdf', '.doc', '.docx']

    if (!allowedMime.includes(file.type) && !hasExtension(file, allowedExts)) {
      alert('Please upload a PDF or DOC/DOCX file for the job description.')
      e.target.value = ''
      return
    }

    setJobDescFile(file)
    setJobDescUploading(true)
    setJobDescUploadResult(null)

    try {
      const result = await uploadFile(file, '/api/upload/job-description')
      setJobDescUploadResult(result)
    } catch (err) {
      alert('Job description upload failed: ' + err.message)
      setJobDescFile(null)
      if (jobDescFileRef.current) jobDescFileRef.current.value = ''
    } finally {
      setJobDescUploading(false)
    }
  }

  // Handle resume file upload (PDF only)
  const handleResumeFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const allowedMime = ['application/pdf', 'application/x-pdf']
    const allowedExts = ['.pdf']

    if (!allowedMime.includes(file.type) && !hasExtension(file, allowedExts)) {
      alert('Please upload a PDF file for your resume.')
      e.target.value = ''
      return
    }

    setResumeFile(file)
    setResumeUploading(true)
    setResumeUploadResult(null)

    try {
      const result = await uploadFile(file, '/api/upload/resume')
      setResumeUploadResult(result)
    } catch (err) {
      alert('Resume upload failed: ' + err.message)
      setResumeFile(null)
      if (resumeFileRef.current) resumeFileRef.current.value = ''
    } finally {
      setResumeUploading(false)
    }
  }

  // Remove uploaded job description file
  const removeJobDescFile = () => {
    setJobDescFile(null)
    setJobDescUploadResult(null)
    if (jobDescFileRef.current) jobDescFileRef.current.value = ''
  }

  // Remove uploaded resume file
  const removeResumeFile = () => {
    setResumeFile(null)
    setResumeUploadResult(null)
    if (resumeFileRef.current) resumeFileRef.current.value = ''
  }

  // Analyse button — extracts text server-side then calls Gemini via /api/analyse
  const handleAnalyse = async () => {
    if (!jobDescText && !jobDescUploadResult) {
      alert('Please provide a job description (text or file).')
      return
    }
    if (!resumeUploadResult) {
      alert('Please upload your resume.')
      return
    }

    setAnalysing(true)
    setAnalysisResult(null)
    setAnalyseError(null)

    try {
      const body = {
        gemini_file_uri: resumeUploadResult.file.gemini_file_uri,
        jd_path: jobDescUploadResult?.file?.path || null,
        jd_text: jobDescText || null,
      }

      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Analysis failed')
      }

      const data = await res.json()
      setAnalysisResult(data)
    } catch (err) {
      setAnalyseError(err.message)
    } finally {
      setAnalysing(false)
    }
  }

  return (
    <div className="app">
      <h1>Resume Analyser</h1>

      <div className="main-content">
        {/* LEFT SIDE — Job Description */}
        <div className="section left-section">
          <h2>Job Description</h2>

          <label htmlFor="jd-text">Paste job description</label>
          <textarea
            id="jd-text"
            rows={10}
            placeholder="Paste the job description here..."
            value={jobDescText}
            onChange={(e) => setJobDescText(e.target.value)}
          />

          <p>Or upload a file (PDF / DOC / DOCX)</p>
          <input
            id="jd-file"
            type="file"
            accept=".pdf,.doc,.docx"
            ref={jobDescFileRef}
            onChange={handleJobDescFile}
          />
          {jobDescUploading && <p>Uploading...</p>}
          {jobDescFile && !jobDescUploading && (
            <div className="file-info">
              <span>{jobDescFile.name}</span>
              {jobDescUploadResult && <span> ✓ Uploaded</span>}
              <button onClick={removeJobDescFile}>Remove</button>
            </div>
          )}
        </div>

        {/* RIGHT SIDE — Resume Upload */}
        <div className="section right-section">
          <h2>Upload Resume</h2>

          <p>Upload your resume (PDF only)</p>
          <input
            id="resume-file"
            type="file"
            accept=".pdf"
            ref={resumeFileRef}
            onChange={handleResumeFile}
          />
          {resumeUploading && <p>Uploading...</p>}
          {resumeFile && !resumeUploading && (
            <div className="file-info">
              <span>{resumeFile.name}</span>
              {resumeUploadResult && <span> ✓ Uploaded</span>}
              <button onClick={removeResumeFile}>Remove</button>
            </div>
          )}
        </div>
      </div>

      <button id="analyse-btn" onClick={handleAnalyse} disabled={analysing}>
        {analysing ? 'Analysing...' : 'Analyse'}
      </button>

      {/* Error */}
      {analyseError && (
        <div id="analyse-error">
          <strong>Error:</strong> {analyseError}
        </div>
      )}

      {/* Results */}
      {analysisResult && (
        <div id="analysis-results">
          <h2>Analysis Results</h2>

          {/* Overall Score */}
          <section id="result-score">
            <h3>Match Score</h3>
            <p>{analysisResult.overall_match_score} / 100</p>
          </section>

          {/* Summary */}
          <section id="result-summary">
            <h3>Summary</h3>
            <p>{analysisResult.summary}</p>
          </section>

          {/* Matching Skills */}
          <section id="result-matching-skills">
            <h3>Matching Skills</h3>
            <ul>
              {analysisResult.matching_skills.map((skill, i) => (
                <li key={i}>{skill}</li>
              ))}
            </ul>
          </section>

          {/* Missing Skills */}
          <section id="result-missing-skills">
            <h3>Missing Skills</h3>
            <ul>
              {analysisResult.missing_skills.map((item, i) => (
                <li key={i}>
                  <strong>{item.skill}</strong> [{item.importance}] — {item.recommendation}
                </li>
              ))}
            </ul>
          </section>

          {/* Bullet Improvements */}
          <section id="result-bullet-improvements">
            <h3>Bullet Point Improvements</h3>
            {analysisResult.bullet_improvements.map((item, i) => (
              <div key={i} className="bullet-improvement">
                <p><strong>Original:</strong> {item.original_text}</p>
                <p><strong>Improved:</strong> {item.improved_text}</p>
                <p><em>Why: {item.reasoning}</em></p>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}

export default App
