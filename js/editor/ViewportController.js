import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export class ViewportController {
  constructor({ canvas, onTransformChange }) {
    this.canvas = canvas;
    this.onTransformChange = onTransformChange;
    this.transformPointerId = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b1d21);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    this.camera.position.set(6, 5, 8);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.orbit = new OrbitControls(this.camera, this.canvas);
    this.orbit.enableDamping = true;

    this.transformControls = new TransformControls(this.camera, this.canvas);
    this.transformControls.addEventListener("dragging-changed", (event) => {
      this.orbit.enabled = !event.value;
      if (!event.value) {
        this.releaseTransformPointerCapture();
      }
    });
    this.transformControls.addEventListener("mouseDown", (event) => {
      if (event?.pointerId !== undefined) {
        this.transformPointerId = event.pointerId;
        try {
          this.canvas.setPointerCapture(event.pointerId);
        } catch (err) {
          // ignore capture errors
        }
      }
    });
    this.transformControls.addEventListener("mouseUp", () => {
      this.releaseTransformPointerCapture();
    });
    this.transformControls.addEventListener("objectChange", () => {
      if (this.onTransformChange) this.onTransformChange();
    });
    this.scene.add(this.transformControls);

    window.addEventListener("pointerup", () => this.forceStopTransform());
    window.addEventListener("pointercancel", () => this.forceStopTransform());

    this.grid = null;
    this.baseLights = [];
    this.addEditorHelpers();
  }

  addEditorHelpers() {
    const grid = new THREE.GridHelper(50, 50, 0xb7b1a8, 0xded8cf);
    grid.userData.ignoreRaycast = true;
    grid.position.y = -0.02;
    if (grid.material) {
      grid.material.depthWrite = false;
    }
    this.scene.add(grid);
    this.grid = grid;

    this.centerOrbitOnGrid();
  }

  releaseTransformPointerCapture() {
    if (this.transformPointerId === null) return;
    try {
      this.canvas.releasePointerCapture(this.transformPointerId);
    } catch (err) {
      // ignore release errors
    }
    this.transformPointerId = null;
  }

  forceStopTransform() {
    if (!this.transformControls?.dragging) return;
    this.transformControls.dragging = false;
    this.transformControls.axis = null;
    this.orbit.enabled = true;
    this.releaseTransformPointerCapture();
  }

  centerOrbitOnGrid() {
    if (!this.grid) return;
    this.orbit.target.copy(this.grid.position);
    this.orbit.update();
  }

  syncGridToOrbit() {
    if (!this.grid) return;
    this.grid.position.x = this.orbit.target.x;
    this.grid.position.z = this.orbit.target.z;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
  }

  update() {
    this.orbit.update();
    this.syncGridToOrbit();
    this.renderer.render(this.scene, this.camera);
  }
}
