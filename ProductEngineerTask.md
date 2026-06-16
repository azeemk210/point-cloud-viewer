
# Day Summary

# Product Engineer Task

 # **Collaborative Point Cloud Viewer**

Build a small full-stack app: multiple browser tabs load the same COPC point cloud and share camera position + view direction in real time — so each tab sees where the others are looking in 3D.

## AI tools welcome

Use Cursor, Claude, Copilot, or any agent you like. We will ask how you used them — not whether you did. Include a short **Approach** section in your README.

## Background

Cyclomedia works with street-level imagery and point clouds. Our annotation tooling needs operators to collaborate in shared 3D views. This task is a scaled-down version of that problem — you will not receive any starter repo from us.

## Getting started

A common path is [Potree](https://github.com/potree/potree "https://github.com/potree/potree") for COPC in the browser — study [examples/copc.html](https://github.com/potree/potree/blob/develop/examples/copc.html "https://github.com/potree/potree/blob/develop/examples/copc.html"). But you are free to use another viewer or stack if you document it.

Serve the frontend over HTTP (not `file://`) — e.g. `npx serve`, a small static server, or Potree's `npm start`.

## Requirements

### 1. Point cloud viewer

Load this COPC file — **SoFi Stadium** (public dataset, ~2 GB — expect a slower initial load):

```
https://s3.amazonaws.com/hobu-lidar/sofi.copc.laz
```

Preview in browser: [viewer.copc.io](https://viewer.copc.io/?copc=https://s3.amazonaws.com/hobu-lidar/sofi.copc.laz "https://viewer.copc.io/?copc=https://s3.amazonaws.com/hobu-lidar/sofi.copc.laz")

**Tip:** SoFi can look flat or hard to read with default coloring. Use **elevation** coloring so you can actually see structure — e.g. in Potree, after load:

```
material.activeAttributeName = "elevation";
```

Make elevation the **default on load** (not something the user has to toggle in a menu).

Verify the point cloud loads and is readable before wiring up real-time sync.

### 2. Real-time sync layer

Some service (WebSocket server, SSE hub, managed realtime — your call) that lets multiple clients share camera state. At minimum it should support:

- Multiple simultaneous clients
- New joiners seeing where existing users already are
- Live camera updates reaching other clients
- Cleanup when a client disconnects

**Language and framework are up to you** — Python, Node, Go, Rust, a serverless function, etc.

### 3. Peer presence in the 3D view

Show other users' camera position and view direction in the scene. A **view cone** (or frustum) is a good way to communicate where someone is looking — but arrow, line, or mesh is fine too. Update roughly once per second. No duplicate markers per peer.

### 4. Documentation

README with: prerequisites, how to run everything, how to test with two browser tabs, and an **Approach** section (how you scoped the work, what you asked AI to do, what you verified manually).

### 5. Submission

Create your own **public** repository on GitHub (or another version control hub), commit your solution there, and send us the link. We want to see your commit history and how the work evolved — not just a final zip or snapshot.

No tight time box — most candidates finish in a few hours with agents. If blocked, note what you tried in your README; we can still have a useful review.

## How we will test

1. Follow your README to run it
2. Open the viewer in two browser tabs
3. Move camera in tab A → peer presence updates in tab B
4. Close tab A → peer disappears in tab B
5. 45–60 min walkthrough: your decisions, AI usage, what you'd do next

## Stretch goals (optional)

- Peer list overlay with names or last-seen
- Stable color per peer
- Containerized or one-command setup
- Throttle / debounce to avoid message flood

## References

- Potree: [github.com/potree/potree](https://github.com/potree/potree "https://github.com/potree/potree")
- COPC example: [examples/copc.html](https://github.com/potree/potree/blob/develop/examples/copc.html "https://github.com/potree/potree/blob/develop/examples/copc.html")
- COPC spec: [copc.io](https://copc.io "https://copc.io/")
- MDN WebSocket API: [developer.mozilla.org/en-US/docs/Web/API/WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket "https://developer.mozilla.org/en-us/docs/web/api/websocket")