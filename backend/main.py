from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config

app = FastAPI(title="Point Cloud Viewer")


@app.get("/config")
def get_config() -> dict:
    return {
        "copcUrl": config.active_copc_url(),
        "useS3Fallback": config.USE_S3_FALLBACK,
    }


# HEAD too, so `curl -I` can probe Accept-Ranges/size without the body.
@app.api_route("/copc/sofi.copc.laz", methods=["GET", "HEAD"])
def get_copc() -> FileResponse:
    if not config.COPC_PATH.is_file():
        raise HTTPException(
            status_code=404,
            detail="COPC file not found. Set COPC_PATH or USE_S3_FALLBACK=1.",
        )
    # FileResponse honors Range automatically (206 + Accept-Ranges: bytes).
    return FileResponse(config.COPC_PATH, media_type="application/octet-stream")


# Mounted last so the static catch-all can't shadow /config or /copc.
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
