import { useState, useRef } from 'react'

// In production (Vercel), VITE_BACKEND_URL points to the Render backend.
// Locally it is empty so the Vite dev proxy handles /api/* as usual.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, '') ?? ''

// Parse an error response safely — handles JSON and plain HTML/text bodies.
async function parseErrorResponse(res, fallback = 'Request failed') {
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    try {
      const body = await res.json()
      return body.detail || body.message || fallback
    } catch {
      return fallback
    }
  }
  // HTML or plain-text error page (e.g. Render cold-start, Vite proxy 404)
  const text = await res.text().catch(() => '')
  // Strip HTML tags for a readable message
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  return clean || fallback
}

// Shared upload function — posts a file to the given API endpoint
async function uploadFile(file, endpoint) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const msg = await parseErrorResponse(res, 'Upload failed')
    throw new Error(msg)
  }

  return res.json()
}

function App() {
  // Job Description state
  const [jdTab, setJdTab] = useState('paste') // 'paste' | 'upload'
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
  const resultsRef = useRef(null)

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
      const result = await uploadFile(file, `${BACKEND_URL}/api/upload/job-description`)
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
      const result = await uploadFile(file, `${BACKEND_URL}/api/upload/resume`)
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
  const removeJobDescFile = (e) => {
    e?.stopPropagation()
    setJobDescFile(null)
    setJobDescUploadResult(null)
    if (jobDescFileRef.current) jobDescFileRef.current.value = ''
  }

  // Remove uploaded resume file
  const removeResumeFile = (e) => {
    e?.stopPropagation()
    setResumeFile(null)
    setResumeUploadResult(null)
    if (resumeFileRef.current) resumeFileRef.current.value = ''
  }

  // Analyse button — calls /api/analyse
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

      const res = await fetch(`${BACKEND_URL}/api/analyse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const msg = await parseErrorResponse(res, 'Analysis failed')
        throw new Error(msg)
      }

      const data = await res.json()
      setAnalysisResult(data)

      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } catch (err) {
      setAnalyseError(err.message)
    } finally {
      setAnalysing(false)
    }
  }

  return (
    <div className="min-h-screen bg-background font-body text-on-background flex flex-col">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-surface/85 backdrop-blur-xl border-b border-outline-variant/30 shadow-[0_2px_16px_rgba(58,48,42,0.04)]">
        <div className="h-16 max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-lg shadow-sm">
              O
            </span>
            <span className="text-2xl font-headline font-bold text-on-surface tracking-tight">
              Opti<span className="text-primary">More</span>.ai
            </span>
          </div>

          {/* Aesthetic Navbar Controls */}
          <div className="flex items-center gap-6">
            <a
              href="#tool"
              className="text-xs font-bold uppercase tracking-wider text-on-surface hover:text-primary transition-colors py-1.5 px-3 rounded-md hover:bg-surface-container/60"
            >
              The Tool
            </a>

            {/* AI Engine Status Pill */}
            <div className="flex items-center gap-2 bg-surface-container px-3.5 py-1.5 rounded-full border border-outline-variant/40 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-on-surface-variant tracking-wide">
                AI Engine
              </span>
            </div>
          </div>

        </div>
      </header>

      {/* Main Content */}
      <main className="w-full pt-16 bg-surface flex-1">
        {/* Hero Section */}
        <section className="relative w-full px-6 lg:px-12 py-16 md:py-24 flex flex-col items-center justify-center text-center overflow-hidden">
          {/* Abstract Warm Background SVG */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30 mix-blend-multiply">
            <svg className="w-[800px] h-[800px] text-primary" fill="currentColor" opacity="0.1" viewBox="0 0 800 800">
              <circle cx="400" cy="400" r="300" filter="blur(80px)"></circle>
            </svg>
            <svg className="w-[600px] h-[600px] absolute -right-20 -top-20 text-tertiary" fill="currentColor" opacity="0.08" viewBox="0 0 800 800">
              <circle cx="400" cy="400" r="200" filter="blur(60px)"></circle>
            </svg>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-4 max-w-3xl mx-auto">
            <h1 className="font-headline font-bold text-5xl md:text-7xl text-on-background tracking-tight">
              Opti<span className="text-primary">More</span>.ai
            </h1>
            <p className="font-body text-lg md:text-2xl font-light text-on-surface-variant tracking-wide">
              Get the score before the door.
            </p>
          </div>
        </section>

        {/* Main Tool Section */}
        <section id="tool" className="w-full max-w-7xl mx-auto px-6 lg:px-12 pb-20 relative z-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 relative items-stretch">
            
            {/* Connection Graphic (Desktop) */}
            <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-14 h-14 bg-surface-container-lowest rounded-full shadow-xl items-center justify-center text-primary border border-outline-variant/30">
              <span className="material-symbols-outlined text-2xl">sync_alt</span>
            </div>

            {/* Left Container: Job Description */}
            <div className="bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 p-6 md:p-10 flex flex-col transition-transform hover:-translate-y-0.5 duration-300">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold font-body text-sm shadow-sm">
                  1
                </span>
                <h2 className="font-headline font-bold text-2xl md:text-3xl text-on-surface">
                  Job Description
                </h2>
              </div>

              {/* Tabs */}
              <div className="flex gap-6 mb-6 border-b border-outline-variant/40 relative">
                <button
                  type="button"
                  onClick={() => setJdTab('paste')}
                  className={`pb-3 font-body font-bold text-xs uppercase tracking-wider transition-colors relative focus:outline-none ${
                    jdTab === 'paste' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Paste Text
                  {jdTab === 'paste' && (
                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-[0_0_8px_rgba(194,101,42,0.6)]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setJdTab('upload')}
                  className={`pb-3 font-body font-bold text-xs uppercase tracking-wider transition-colors relative focus:outline-none ${
                    jdTab === 'upload' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Upload File
                  {jdTab === 'upload' && (
                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-[0_0_8px_rgba(194,101,42,0.6)]" />
                  )}
                </button>
              </div>

              {/* Hidden file input for JD */}
              <input
                id="jd-file"
                type="file"
                accept=".pdf,.doc,.docx"
                ref={jobDescFileRef}
                onChange={handleJobDescFile}
                className="hidden"
              />

              {/* Tab Content: Paste Text */}
              {jdTab === 'paste' && (
                <div className="flex-1 flex flex-col">
                  <div className="flex-1 bg-surface-container rounded-lg shadow-inner overflow-hidden focus-within:ring-2 focus-within:ring-primary transition-all">
                    <textarea
                      id="jd-text"
                      rows={9}
                      className="w-full h-full min-h-[220px] bg-transparent resize-none p-5 font-body text-on-surface focus:outline-none placeholder:text-on-surface-variant/50 text-sm leading-relaxed"
                      placeholder="Paste the full job description here..."
                      value={jobDescText}
                      onChange={(e) => setJobDescText(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Tab Content: Upload File */}
              {jdTab === 'upload' && (
                <div className="flex-1 flex flex-col">
                  <div
                    onClick={() => jobDescFileRef.current?.click()}
                    className="flex-1 bg-surface-container rounded-lg flex flex-col items-center justify-center p-8 text-center group cursor-pointer hover:bg-surface-container-high transition-colors shadow-inner min-h-[220px]"
                  >
                    <div className="w-14 h-14 rounded-full bg-surface-container-lowest shadow-md flex items-center justify-center mb-4 group-hover:scale-110 transition-all duration-300">
                      <span className="material-symbols-outlined text-3xl text-primary">
                        {jobDescUploadResult ? 'check_circle' : 'upload_file'}
                      </span>
                    </div>

                    {jobDescUploading ? (
                      <p className="font-body text-sm font-semibold text-primary animate-pulse">
                        Uploading job description...
                      </p>
                    ) : jobDescFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <h3 className="font-headline font-bold text-lg text-on-surface">
                          {jobDescFile.name}
                        </h3>
                        {jobDescUploadResult && (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                            ✓ Uploaded & Saved
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={removeJobDescFile}
                          className="mt-2 text-xs font-semibold text-error hover:underline"
                        >
                          Remove file
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-headline font-bold text-lg text-on-surface mb-1">
                          Drop your PDF / DOC file here
                        </h3>
                        <p className="font-body text-xs text-on-surface-variant max-w-[220px]">
                          or click to browse your files. Max size: 5MB.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Container: Resume Upload */}
            <div className="bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 p-6 md:p-10 flex flex-col transition-transform hover:-translate-y-0.5 duration-300">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold font-body text-sm shadow-sm">
                  2
                </span>
                <h2 className="font-headline font-bold text-2xl md:text-3xl text-on-surface">
                  Your Resume
                </h2>
              </div>

              <div className="mb-6 border-b border-outline-variant/40 pb-3">
                <span className="font-body font-bold text-xs uppercase tracking-wider text-primary inline-block relative">
                  Upload PDF
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-[0_0_8px_rgba(194,101,42,0.6)]" />
                </span>
              </div>

              {/* Hidden file input for Resume */}
              <input
                id="resume-file"
                type="file"
                accept=".pdf"
                ref={resumeFileRef}
                onChange={handleResumeFile}
                className="hidden"
              />

              {/* Resume Dropzone */}
              <div
                onClick={() => resumeFileRef.current?.click()}
                className="flex-1 bg-surface-container rounded-lg flex flex-col items-center justify-center p-8 text-center group cursor-pointer hover:bg-surface-container-high transition-colors shadow-inner min-h-[220px]"
              >
                <div className="w-16 h-16 rounded-full bg-surface-container-lowest shadow-md flex items-center justify-center mb-4 group-hover:scale-110 transition-all duration-300">
                  <span className="material-symbols-outlined text-4xl text-primary">
                    {resumeUploadResult ? 'verified' : 'description'}
                  </span>
                </div>

                {resumeUploading ? (
                  <p className="font-body text-sm font-semibold text-primary animate-pulse">
                    Uploading & Streaming to Gemini...
                  </p>
                ) : resumeFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <h3 className="font-headline font-bold text-lg text-on-surface">
                      {resumeFile.name}
                    </h3>
                    {resumeUploadResult && (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                        ✓ Ready for Analysis
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={removeResumeFile}
                      className="mt-2 text-xs font-semibold text-error hover:underline"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="font-headline font-bold text-xl text-on-surface mb-2">
                      Upload PDF Resume
                    </h3>
                    <p className="font-body text-xs text-on-surface-variant max-w-[240px]">
                      Drag and drop your PDF resume here, or click to select from your device.
                    </p>
                  </>
                )}
              </div>
            </div>

          </div>

          {/* Action Area */}
          <div className="mt-12 flex flex-col items-center justify-center relative z-40">
            <button
              id="analyse-btn"
              onClick={handleAnalyse}
              disabled={analysing}
              className={`bg-primary text-on-primary font-body font-bold text-lg md:text-xl px-12 py-4 md:py-5 rounded-lg shadow-xl shadow-primary/25 hover:shadow-2xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 flex items-center gap-3 group overflow-hidden relative ${
                analysing ? 'opacity-80 cursor-wait' : ''
              }`}
            >
              <span className="relative z-10">
                {analysing ? 'Analysing with Gemini...' : 'Analyze Now'}
              </span>
              <span className={`material-symbols-outlined relative z-10 ${analysing ? 'animate-spin' : 'group-hover:translate-x-1 transition-transform'}`}>
                {analysing ? 'progress_activity' : 'arrow_forward'}
              </span>
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0" />
            </button>

            <p className="mt-5 text-xs md:text-sm font-body text-on-surface-variant flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">lock</span>
              Your data is processed securely and never stored.
            </p>

            {/* Error Message */}
            {analyseError && (
              <div id="analyse-error" className="mt-6 p-4 bg-error/10 border border-error/30 rounded-lg text-error text-sm max-w-lg text-center font-medium">
                <strong>Error:</strong> {analyseError}
              </div>
            )}
          </div>
        </section>

        {/* Analysis Results Section */}
        {analysisResult && (
          <section ref={resultsRef} className="w-full max-w-7xl mx-auto px-6 lg:px-12 pb-24 relative z-30">
            <div className="bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/40 p-8 md:p-12">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-6 mb-8">
                <div>
                  <span className="text-xs font-bold tracking-widest uppercase text-primary">Results</span>
                  <h2 className="font-headline font-bold text-3xl md:text-4xl text-on-surface mt-1">
                    Match Analysis Breakdown
                  </h2>
                </div>
                <div className="flex items-center gap-2 bg-primary-container/30 px-4 py-2 rounded-full border border-primary/20">
                  <span className="material-symbols-outlined text-primary text-xl">auto_awesome</span>
                  <span className="text-xs font-semibold text-primary">Gemini AI Powered</span>
                </div>
              </div>

              {/* Overall Score & Summary Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
                {/* Score Card */}
                <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/30 flex flex-col items-center justify-center text-center">
                  <span className="text-xs uppercase font-bold tracking-wider text-on-surface-variant mb-2">
                    Overall Match Score
                  </span>
                  <div className="relative flex items-center justify-center my-2">
                    <div className="w-32 h-32 rounded-full border-8 border-primary/20 flex items-center justify-center bg-surface-container-lowest shadow-inner">
                      <span className="font-headline font-bold text-5xl text-primary">
                        {analysisResult.overall_match_score}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-on-surface-variant mt-2">
                    out of 100
                  </span>
                </div>

                {/* Executive Summary */}
                <div className="lg:col-span-2 bg-surface-container rounded-xl p-6 border border-outline-variant/30 flex flex-col justify-center">
                  <h3 className="font-headline font-bold text-xl text-on-surface mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">insights</span>
                    Executive Summary
                  </h3>
                  <p className="font-body text-sm md:text-base text-on-surface-variant leading-relaxed">
                    {analysisResult.summary}
                  </p>
                </div>
              </div>

              {/* Skills Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                {/* Matching Skills */}
                <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30">
                  <h3 className="font-headline font-bold text-xl text-on-surface mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                    Matching Skills ({analysisResult.matching_skills?.length || 0})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.matching_skills?.map((skill, i) => (
                      <span
                        key={i}
                        className="bg-primary/10 text-primary border border-primary/20 font-medium text-xs px-3 py-1.5 rounded-full shadow-sm"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Missing Skills */}
                <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30">
                  <h3 className="font-headline font-bold text-xl text-on-surface mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-tertiary">warning</span>
                    Missing Skills ({analysisResult.missing_skills?.length || 0})
                  </h3>
                  <div className="space-y-3">
                    {analysisResult.missing_skills?.map((item, i) => (
                      <div key={i} className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <strong className="text-on-surface text-sm">{item.skill}</strong>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.importance?.toLowerCase() === 'high'
                              ? 'bg-red-100 text-red-700'
                              : item.importance?.toLowerCase() === 'medium'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {item.importance} Importance
                          </span>
                        </div>
                        <p className="text-on-surface-variant mt-1">{item.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bullet Improvements */}
              {analysisResult.bullet_improvements?.length > 0 && (
                <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30">
                  <h3 className="font-headline font-bold text-2xl text-on-surface mb-6 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">edit_note</span>
                    Suggested Bullet Point Rewrites
                  </h3>
                  <div className="space-y-4">
                    {analysisResult.bullet_improvements.map((item, i) => (
                      <div key={i} className="bg-surface-container-lowest p-5 rounded-lg border border-outline-variant/40 space-y-2">
                        <div className="text-xs">
                          <span className="font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Original</span>
                          <p className="text-on-surface bg-surface-container/50 p-2.5 rounded font-mono text-xs border border-outline-variant/20">
                            {item.original_text}
                          </p>
                        </div>
                        <div className="text-xs pt-1">
                          <span className="font-bold text-primary uppercase tracking-wider block mb-1">Improved (ATS-Optimized)</span>
                          <p className="text-on-surface bg-primary-container/20 p-2.5 rounded font-mono text-xs border border-primary/20">
                            {item.improved_text}
                          </p>
                        </div>
                        <p className="text-xs text-on-surface-variant italic pt-1">
                          Reasoning: {item.reasoning}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Decorative Image Banner Section */}
        <section className="w-full max-w-7xl mx-auto px-6 lg:px-12 pb-20">
          <div
            className="w-full h-72 md:h-80 rounded-xl shadow-xl overflow-hidden relative bg-cover bg-center"
            style={{
              backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuCBuwZf2bT6caY8IL1wpKK5N0hscvCtl60E_v86fk-dwIKYx6aEtyW-0v-3j5Uc3z8kmg5hF6XshAzrZ6jzSvJGUeu8QzwYd9WSAUqi6mbm05kGnjBOo_g8un4Iydm_GHwO8KZM98nUBZP52XxbHxYlJpf6mqUu5lIJjP0-49Git10ugp9OM2j9nIDUQw4AtvsAd9GdiYswY0Ep1IiIBDQlnJwdJ-spEmAQtWxRXQp6C5_44dXB03vk')`
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/90 via-surface-container-lowest/30 to-transparent" />
            <div className="absolute bottom-8 left-8 right-8 text-center">
              <h3 className="font-headline text-2xl md:text-3xl font-bold text-on-surface mb-2">
                Precision alignment for your career.
              </h3>
              <p className="font-body text-sm text-on-surface-variant">
                Powered by warm intelligence.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full bg-surface-container-low py-10 border-t border-outline-variant/30">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="space-y-1">
            <div className="font-headline font-bold text-xl text-on-surface">
              Opti<span className="text-primary">More</span>.ai
            </div>
            <p className="text-xs text-on-surface-variant max-w-xs">
              Optimizing more of what matters through sun-baked simplicity and warm intelligence.
            </p>
          </div>
          <div className="text-xs font-semibold text-on-surface-variant tracking-wider uppercase">
            © 2026 OptiMore.ai. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
