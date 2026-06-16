// Load the SoFi COPC into Potree with elevation coloring on by default.
// Module runs after Potree's classic scripts (modules defer), so Potree/$ exist.
// Pin Potree's bundled THREE so the cone math shares the exact instance.
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

let viewer = null; // shared across init + the sync/cone helpers

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

  viewer = new Potree.Viewer(document.getElementById("potree_render_area"));
  window.viewer = viewer; // exposed for console/debug; peer cones live on viewer.scene.scene

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

    // Size cones from the cloud so they're visible at stadium scale, then draw
    // any peers we heard about before the cloud finished loading.
    const diagonal = e.pointcloud.boundingBox.getSize(new THREE.Vector3()).length();
    coneSize = (diagonal > 0 ? diagonal : 1000) * CONE_FRACTION; // fallback if bbox empty
    for (const state of peerStates.values()) upsertPeer(state);
  });

  setupSync(); // open the WebSocket and start streaming camera state
}

const WS_THROTTLE_MS = 66; // ~15 Hz
let MY_ID = null; // module-scope so we can hard-filter the self-cone

const arraysEqual = (a, b) => a && b && a.every((v, i) => v === b[i]);

function setupSync() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  window.addEventListener("pagehide", () => ws.close()); // flush a clean close on tab close -> instant leave

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
    if (msg.type === "camera") upsertPeer(msg);
    else if (msg.type === "leave") removePeer(msg.peerId);
  });

  // Sample on Potree's per-frame update hook, throttled + send-on-change.
  viewer.addEventListener("update", () => {
    const now = Date.now();
    if (now - lastSentAt < WS_THROTTLE_MS) return;
    lastSentAt = now;
    sendCamera(false);
  });

  renderPeerList(); // paint the initial "No other peers" empty state
}

// --- peer view-cones --------------------------------------------------------
const CONE_FRACTION = 0.015;   // cone height ~1.5% of the cloud bbox diagonal (tunable)
const peerCones = new Map();   // peerId -> THREE.Mesh
const peerStates = new Map();  // peerId -> latest camera msg (redraw once cloud loads)
let coneSize = null;           // world-space cone height; null until cloud bbox known
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Color derived from the SERVER-assigned peerId (deterministic), so a peer can't
// influence the color others render it with.
function peerHue(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
function coneColor(id) {
  return new THREE.Color().setHSL(peerHue(id) / 360, 0.8, 0.55);
}

function makeCone(peerId) {
  const height = coneSize;
  const radius = coneSize * 0.4;
  const geom = new THREE.ConeGeometry(radius, height, 16);
  // Flip + translate so the apex sits at the local origin and the body opens
  // along +Y: then position = apex = the peer's eye, and +Y -> view dir aims it.
  geom.rotateX(Math.PI);
  geom.translate(0, height / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ color: coneColor(peerId), transparent: true, opacity: 0.7 });
  return new THREE.Mesh(geom, mat);
}

function upsertPeer(msg) {
  if (!msg || msg.peerId === MY_ID) return;        // never draw our own cone
  const isNew = !peerStates.has(msg.peerId);
  peerStates.set(msg.peerId, msg);                 // remember latest even if we can't draw yet
  if (isNew) renderPeerList();                     // overlay updates on join (membership change)
  if (coneSize === null) return;                   // cloud not loaded -> can't size cones yet
  if (!Array.isArray(msg.position) || !Array.isArray(msg.target)) return;

  let cone = peerCones.get(msg.peerId);
  if (!cone) {
    cone = makeCone(msg.peerId);
    peerCones.set(msg.peerId, cone);
    viewer.scene.scene.add(cone);
  }
  const [px, py, pz] = msg.position;
  const [tx, ty, tz] = msg.target;
  cone.position.set(px, py, pz);                   // apex at the peer's eye
  const dir = new THREE.Vector3(tx - px, ty - py, tz - pz);
  if (dir.lengthSq() > 1e-12) {                    // guard degenerate position~=target
    cone.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
  }
}

function removePeer(peerId) {
  const existed = peerStates.delete(peerId);
  const cone = peerCones.get(peerId);
  if (cone) {
    viewer.scene.scene.remove(cone);
    cone.geometry.dispose();
    cone.material.dispose();
    peerCones.delete(peerId);
  }
  if (existed) renderPeerList();                   // overlay updates on leave (membership change)
}

// Corner panel listing connected peers; membership mirrors the cones, swatch
// color matches each cone (textContent only — XSS-safe).
function renderPeerList() {
  const panel = document.querySelector("#peer_list");
  if (!panel) return;
  const ids = [...peerStates.keys()].filter((id) => id !== MY_ID);
  panel.querySelector("h2").textContent = `Peers (${ids.length})`;
  const ul = panel.querySelector("ul");
  ul.textContent = "";
  if (ids.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No other peers";
    ul.appendChild(li);
    return;
  }
  for (const id of ids) {
    const li = document.createElement("li");
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = coneColor(id).getStyle();
    const label = document.createElement("span");
    label.textContent = id;
    li.append(sw, label);
    ul.appendChild(li);
  }
}

init();
