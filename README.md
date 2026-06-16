# Collaborative Point Cloud Viewer

Multiple browser tabs load the same LiDAR point cloud of SoFi Stadium
and share camera positions in real time over WebSockets. Each peer's
viewpoint appears as a view cone in the 3D scene, with a peer list
overlay showing who's connected. Built with Potree (COPC streaming),
FastAPI (WebSocket hub + HTTP Range serving), and vanilla JS.

## Live Demo

**[point-cloud-viewer-vxmu.onrender.com](https://point-cloud-viewer-vxmu.onrender.com/)**

Open it in two browser tabs to see the camera sync — move in one, watch the
cone move in the other. Streams the COPC from S3; allow 10–20 seconds on first
load for the point cloud to initialize.

![Two-tab camera sync demo](demo_hq.gif)


## Prerequisites

- Python 3.10+
- Git
- Docker (optional — for one-command setup)
- Node.js **not required** — Potree is vendored, no build step

## Quick Start (S3 streaming — no download needed)

No build step — streams directly from the public S3 bucket, no 2GB
download needed.

**1. Clone the repo**
```powershell
git clone https://github.com/azeemk210/point-cloud-viewer.git
cd point-cloud-viewer
```

**2. Create a virtual environment**
```powershell
python -m venv venv
```

**3. Activate it**
```powershell
# PowerShell:
.\venv\Scripts\Activate.ps1

# cmd / Git Bash:
# venv\Scripts\activate
```

**4. Install dependencies**
```powershell
pip install -r requirements.txt
```

**5. Run (S3 streaming mode)**
```powershell
$env:USE_S3_FALLBACK="1"; uvicorn backend.main:app --host 127.0.0.1 --port 8000 --ws-ping-interval 10 --ws-ping-timeout 10
```

Open `http://127.0.0.1:8000` — give it 10–20 seconds on first load
for the COPC hierarchy to initialize, then points stream in as you
navigate.

> The point cloud streams via HTTP range requests — only the octree
> nodes needed for the current view are fetched, not the full 2GB file.

## Docker (one-command setup)

Requires Docker Desktop. No Python or venv needed.

**1. Build the image**
```powershell
docker compose build
```

**2. Run** (pick one mode)
```powershell
# Stream from S3 (no local file needed):
$env:USE_S3_FALLBACK="1"; docker compose up

# Or with your local ~2GB file:
$env:COPC_FILE="C:\path\to\sofi.copc.laz"; docker compose up
```
`docker compose up` also builds on first run; add `--build` to force a rebuild
after code changes.

**3. Open the app**

`http://localhost:8000`

**4. Stop when done**
```powershell
docker compose down
```

The COPC file is bind-mounted at runtime — never baked into the
image. Image size: ~300 MB.

## Run with Local COPC File (without Docker)

If you prefer to serve the file locally without Docker:

**1. Download the file (~2GB)**
```powershell
New-Item -ItemType Directory -Force data
curl.exe -L -o data\sofi.copc.laz `
  https://s3.amazonaws.com/hobu-lidar/sofi.copc.laz
```

**2. Run without the fallback flag**
```powershell
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

## Testing with Two Browser Tabs

1. Start the server (any method above)
2. Open `http://127.0.0.1:8000` (or `http://localhost:8000` for
   Docker) in **Tab A**
3. Open the same URL in **Tab B**
4. Move the camera in Tab A → a cone appears in Tab B showing
   where Tab A is looking. The peer list overlay (top-right)
   shows both peers with matching colors
5. Close Tab A → its cone and peer list entry vanish from Tab B

## Project Structure

```
backend/
  main.py         # FastAPI app: /config, /copc, /ws hub, StaticFiles
  config.py       # paths + S3 fallback flag, env-overridable
frontend/
  index.html      # Potree page, script load order from examples/copc.html
  app.js          # viewer init, COPC load, WebSocket sync, peer cones + overlay
  build/          # vendored Potree build artifacts (potree@develop)
  libs/           # vendored Potree dependencies (Cesium/geopackage trimmed)
Dockerfile
docker-compose.yml
requirements.txt
```

## Approach

I scoped the work into five phases with a verification gate at each
before moving on — backend serving, viewer, sync hub, peer cones,
and docs. Nothing moved forward until the previous gate passed. A
security review ran after each phase before committing.

### AI Usage

I used Claude Code as my coding agent throughout the build.

**What I delegated:**
- Server scaffold and boilerplate
- Potree script load order (researched against `examples/copc.html`)
- WebSocket hub structure
- Cone geometry and orientation math
- Per-phase syntax checks and wiring verification scripts

**What I kept ownership of:**
- Architecture decisions — one FastAPI process serving everything
  (frontend, COPC file, WebSocket hub) so there's no CORS, no
  separate services, clone and run
- Message schema design — `{ type, peerId, position, target, t }`,
  position+target mirrors Potree's own view object directly
- Liveness approach — server-side `finally` block instead of a
  client-side TTL sweep. I made this call up front in the plan,
  recognizing that under send-on-change throttling a stationary
  peer sends nothing, so client TTL would falsely reap them.
  Liveness belongs at the connection level, not message recency
- Security decisions — server-assigned peer IDs (anti-spoof),
  input validation whitelist in `clean_camera()` before any peer
  data reaches other tabs, cone color derived from the server ID
  not a client-supplied field
- All phase gate verifications — at the HTTP level for Phase 1,
  visually in the browser for Phases 2–4

**What I verified manually:**
- **Phase 1:** HTTP Range returns 206 with correct `Content-Range`;
  `Accept-Ranges: bytes` present; static index served. Verified
  at the HTTP level via PowerShell
- **Phase 2:** SoFi Stadium renders with elevation coloring on by
  default, no manual toggle required (visual confirmation)
- **Phase 3:** Two-tab sync — join-state replay, live relay, no
  self-echo, leave on disconnect. Verified via browser console
  logging of inbound frames across two real tabs
- **Phase 4:** One cone per peer, visible at world scale, correctly
  oriented, tracking movement in real time, vanishes on disconnect
  (visual confirmation, two side-by-side tabs)
- **Stretch:** Peer list overlay and Docker setup — visual check,
  wiring check, and security review before committing each

**What the security reviews focused on:**

Inbound peer messages are untrusted. The hub validates every camera
frame with `clean_camera()` — only known fields pass, position and
target must be exactly 3 finite numbers, and the server stamps the
peer ID. Cone color comes from the server-assigned ID, not a
client-supplied field.

Invalid JSON frames are skipped without dropping the connection.
Real disconnects bubble to the `finally` block which broadcasts
`leave` — covering both clean tab closes and hard kills.

### Key Decisions

**Why Potree `develop` branch?**
The only branch with COPC support — release branches load EPT/Entwine
format, not COPC.

**Why vendor the build artifacts?**
Reproducible clone-and-run with no Node build step. Tradeoff: ~44MB
of committed binaries. Cesium and geopackage (~22MB) were trimmed —
the COPC viewer never loads them. 

**Why raw WebSockets over Socket.IO?**
The task needs one channel, JSON messages, broadcast to others.
FastAPI has native WebSocket support and `uvicorn[standard]` brings
the `websockets` library with built-in ping/pong keepalive. Fewer
dependencies, less to explain.

**Why server-side liveness?**
Camera updates are throttled and send-on-change — a peer who isn't
moving sends nothing. Both clean tab closes and hard kills end up
in the same `finally` block that broadcasts `leave`.


## Stretch Goals

- ✅ Stable color per peer (derived from server-assigned ID)
- ✅ Throttle + send-on-change (~15 Hz)
- ✅ Peer list overlay with color swatches
- ✅ Docker / one-command setup