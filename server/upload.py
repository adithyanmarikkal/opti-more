import os
import uuid
# pyrefly: ignore [missing-import]
from fastapi import UploadFile

# Directory where all uploads are stored
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")

# Maximum allowed upload size (5 MB)
MAX_FILE_SIZE_MB = 5
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


async def save_uploaded_file(file: UploadFile, sub_folder: str = "") -> dict:
    """
    Save an uploaded file to disk.

    Args:
        file: The UploadFile object from FastAPI.
        sub_folder: Optional sub-folder inside UPLOAD_DIR (e.g. "resumes", "job_descriptions").

    Returns:
        A dict with file metadata: original_name, saved_name, path, size, content_type.

    Raises:
        ValueError: If the file exceeds MAX_FILE_SIZE_MB.
    """
    # Build target directory
    target_dir = os.path.join(UPLOAD_DIR, sub_folder) if sub_folder else UPLOAD_DIR
    os.makedirs(target_dir, exist_ok=True)

    # Generate a unique filename to avoid collisions
    ext = os.path.splitext(file.filename)[1]  # e.g. ".pdf"
    saved_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(target_dir, saved_name)

    # Read file contents
    contents = await file.read()

    # Enforce size limit before writing to disk
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f"File '{file.filename}' is too large "
            f"({len(contents) / (1024 * 1024):.1f} MB). "
            f"Maximum allowed size is {MAX_FILE_SIZE_MB} MB."
        )

    with open(file_path, "wb") as f:
        f.write(contents)

    return {
        "original_name": file.filename,
        "saved_name": saved_name,
        "path": file_path,
        "size": len(contents),
        "content_type": file.content_type,
    }
