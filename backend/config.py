import os
from pathlib import Path

# Resolve paths from this file, not cwd, so uvicorn can launch from anywhere.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"

# ~2 GB SoFi file (gitignored); override COPC_PATH if it lives elsewhere.
COPC_PATH = Path(
    os.environ.get("COPC_PATH", PROJECT_ROOT / "data" / "sofi.copc.laz")
).resolve()

# When on, the frontend loads the COPC straight from S3 instead of this server.
USE_S3_FALLBACK = os.environ.get("USE_S3_FALLBACK", "").lower() in ("1", "true", "yes")
S3_COPC_URL = os.environ.get(
    "S3_COPC_URL", "https://s3.amazonaws.com/hobu-lidar/sofi.copc.laz"
)
LOCAL_COPC_URL = "/copc/sofi.copc.laz"


def active_copc_url() -> str:
    return S3_COPC_URL if USE_S3_FALLBACK else LOCAL_COPC_URL
