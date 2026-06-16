// Load the SoFi COPC into Potree with elevation coloring on by default.
// Module runs after Potree's classic scripts (modules defer), so Potree/$ exist.
// Pin Potree's bundled THREE so Phase 4 cone math shares the exact instance.
import * as THREE from "./libs/three.js/build/three.module.js";
window.THREE = THREE;

// Visible, XSS-safe fatal banner (textContent only, never innerHTML).
function showFatal(message) {
  const el = document.createElement("div");
  el.setAttribute("role", "alert");
  el.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:10000;padding:12px 16px;" +
    "background:#b00020;color:#fff;font:14px/1.4 sans-serif;";
  el.textContent = message;
  document.body.appendChild(el);
}

async function init() {
  let copcUrl;
  try {
    const res = await fetch("/config");
    if (!res.ok) throw new Error(`/config responded ${res.status}`);
    ({ copcUrl } = await res.json());
  } catch (err) {
    showFatal(`Could not load viewer config from /config — is the backend running? (${err.message})`);
    return;
  }

  const viewer = new Potree.Viewer(document.getElementById("potree_render_area"));
  window.viewer = viewer; // Phase 4: peer cones live on viewer.scene.scene

  viewer.setEDLEnabled(true);
  viewer.setFOV(60);
  viewer.setPointBudget(2_000_000);
  viewer.loadGUI(() => viewer.setLanguage("en"));

  Potree.loadPointCloud(copcUrl, "sofi", (e) => {
    viewer.scene.addPointCloud(e.pointcloud);
    const material = e.pointcloud.material;
    material.size = 1;
    material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
    material.activeAttributeName = "elevation"; // elevation coloring ON by default
    viewer.fitToScreen(0.5);
  });

  setupSync(viewer); // open the WebSocket and start streaming camera state
}

const WS_THROTTLE_MS = 66; // ~15 Hz
let MY_ID = null; // module-scope so Phase 4 can hard-filter the self-cone

const arraysEqual = (a, b) => a && b && a.every((v, i) => v === b[i]);

function setupSync(viewer) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);

  let lastSentAt = 0;
  let lastPos = null;
  let lastTarget = null;

  const cameraMessage = () => {
    const view = viewer.scene.view;
    const p = view.position;
    const t = view.getPivot();
    return {
      type: "camera",
      peerId: MY_ID,
      position: [p.x, p.y, p.z],
      target: [t.x, t.y, t.z],
      t: Date.now(),
    };
  };

  const sendCamera = (force) => {
    if (!MY_ID || ws.readyState !== WebSocket.OPEN) return;
    const msg = cameraMessage();
    if (!force && arraysEqual(msg.position, lastPos) && arraysEqual(msg.target, lastTarget)) {
      return; // send-on-change: nothing moved since the last send
    }
    lastPos = msg.position;
    lastTarget = msg.target;
    ws.send(JSON.stringify(msg));
  };

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return; // ignore non-JSON frames
    }
    if (msg.type === "welcome") {
      MY_ID = msg.peerId;
      sendCamera(true); // unconditional initial send so a stationary peer is still visible
      return;
    }
    console.log("[ws] inbound", msg); // Phase 4 turns camera/leave into cones
  });

  // Sample on Potree's per-frame update hook, throttled + send-on-change.
  viewer.addEventListener("update", () => {
    const now = Date.now();
    if (now - lastSentAt < WS_THROTTLE_MS) return;
    lastSentAt = now;
    sendCamera(false);
  });
}

init();
