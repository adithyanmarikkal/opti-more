"""
extracttext.py — Extract plain text from PDF (and DOC/DOCX) files.

Usage (shared by both resume and job description pipelines):
    text = extract_text(file_path)

Supports:
    - PDF  → via PyMuPDF (fitz)
    - DOCX → via python-docx
    - DOC  → falls back to raw byte decoding (best-effort)
"""

import os

# pyrefly: ignore [missing-import]
import fitz  # PyMuPDF


def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract all text from a PDF file using PyMuPDF.

    Args:
        file_path: Absolute path to the PDF file on disk.

    Returns:
        A single string containing all extracted text, pages joined by newlines.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the file is not a valid PDF.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        doc = fitz.open(file_path)
    except Exception as e:
        raise ValueError(f"Could not open PDF '{file_path}': {e}")

    pages_text = []
    for page in doc:
        pages_text.append(page.get_text())

    doc.close()

    text = "\n".join(pages_text).strip()
    return text


def extract_text_from_docx(file_path: str) -> str:
    """
    Extract all text from a DOCX file using python-docx.

    Args:
        file_path: Absolute path to the DOCX file on disk.

    Returns:
        A single string containing all extracted text.

    Raises:
        FileNotFoundError: If the file does not exist.
        ImportError: If python-docx is not installed.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        # pyrefly: ignore [missing-import]
        from docx import Document
    except ImportError:
        raise ImportError("python-docx is required for DOCX files. Run: pip install python-docx")

    doc = Document(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs).strip()


def extract_text(file_path: str) -> str:
    """
    Shared entry point — extract text from a PDF or DOCX file.
    Automatically detects the file type from its extension.

    Args:
        file_path: Absolute path to the uploaded file on disk.

    Returns:
        Extracted plain text as a string.

    Raises:
        ValueError: If the file extension is not supported.
        FileNotFoundError: If the file does not exist.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext in (".docx",):
        return extract_text_from_docx(file_path)
    elif ext == ".doc":
        # Best-effort fallback for legacy .doc binary format
        with open(file_path, "rb") as f:
            raw = f.read()
        # Decode printable ASCII characters only
        text = raw.decode("latin-1", errors="ignore")
        # Strip non-printable characters (rough extraction)
        cleaned = "".join(c for c in text if c.isprintable() or c in "\n\t")
        return cleaned.strip()
    else:
        raise ValueError(f"Unsupported file type: '{ext}'. Supported: .pdf, .docx, .doc")
