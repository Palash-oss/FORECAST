import logging
import sys
import traceback
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Add app directory to sys.path
app_dir = backend_dir / "app"
if str(app_dir) not in sys.path:
    sys.path.insert(0, str(app_dir))

# Also ensure /var/task is in sys.path if in AWS Lambda
if Path("/var/task").exists() and "/var/task" not in sys.path:
    sys.path.insert(0, "/var/task")
if Path("/var/task/backend").exists() and "/var/task/backend" not in sys.path:
    sys.path.insert(0, "/var/task/backend")

try:
    from app.main import app
except Exception as e:
    logging.exception("Failed to import app.main")
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    err_tb = traceback.format_exc()
    app = FastAPI(title="Diagnostic Fallback")

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"])
    async def debug_catch_all(full_path: str):
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": "BackendImportError",
                "message": str(e),
                "traceback": err_tb,
                "sys_path": sys.path,
                "cwd": str(Path.cwd()),
                "files_in_backend": [p.name for p in backend_dir.glob("*")] if backend_dir.exists() else [],
                "requested_path": full_path,
            },
        )
