import math
import uuid

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
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


class Hub:
    def __init__(self) -> None:
        self.peers: dict[str, WebSocket] = {}
        self.last_state: dict[str, dict] = {}

    async def broadcast(self, message: dict, exclude: str | None = None) -> None:
        # Swallow per-socket errors so one dead peer can't abort the loop;
        # that connection's own finally block is what removes it.
        for pid, ws in list(self.peers.items()):
            if pid == exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                pass


hub = Hub()


# Inbound frames are untrusted: never relay the raw dict. Stamp peerId ourselves
# and require position/target to each be 3 finite numbers.
def clean_camera(msg: dict, peer_id: str) -> dict | None:
    def vec3(v: object) -> list[float] | None:
        if not isinstance(v, list) or len(v) != 3:
            return None
        try:
            out = [float(x) for x in v]
        except (TypeError, ValueError):
            return None
        return out if all(math.isfinite(x) for x in out) else None

    position, target = vec3(msg.get("position")), vec3(msg.get("target"))
    if position is None or target is None:
        return None
    t = msg.get("t")
    return {
        "type": "camera",
        "peerId": peer_id,
        "position": position,
        "target": target,
        "t": t if isinstance(t, (int, float)) else None,
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    peer_id = uuid.uuid4().hex[:8]
    hub.peers[peer_id] = ws
    try:
        # Tell the client its own id, then replay who's already here.
        await ws.send_json({"type": "welcome", "peerId": peer_id})
        for pid, state in list(hub.last_state.items()):
            if pid != peer_id:
                await ws.send_json(state)
        while True:
            try:
                msg = await ws.receive_json()
            except (ValueError, KeyError):
                continue  # malformed frame — skip, stay connected
            if msg.get("type") == "camera":
                clean = clean_camera(msg, peer_id)
                if clean is None:
                    continue
                hub.last_state[peer_id] = clean
                await hub.broadcast(clean, exclude=peer_id)
    except WebSocketDisconnect:
        pass
    finally:
        # Single source of truth for liveness: clean up + announce departure.
        hub.peers.pop(peer_id, None)
        hub.last_state.pop(peer_id, None)
        await hub.broadcast({"type": "leave", "peerId": peer_id})


# Mounted last so the static catch-all can't shadow /config, /copc, or /ws.
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
