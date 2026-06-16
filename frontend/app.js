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
  window.viewer = viewer; // Phase 3+: peer cones live on viewer.scene.scene

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
}

init();
