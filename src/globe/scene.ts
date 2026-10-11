import {
  AmbientLight, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Scene, SphereGeometry,
  Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Region } from '../content/types';
import { createAtmosphere } from './atmosphere';
import { createEarthTexture } from './earthTexture';
import { Markers } from './markers';

const MIN_DIST = 1.25;
const MAX_DIST = 5;
const DEFAULT_DIST = 3.4;
const FOCUS_DIST = 2.1;
const IDLE_RESUME_MS = 8000;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export interface GlobeEvents {
  onHover: (region: Region | null, clientX: number, clientY: number) => void;
  onSelect: (region: Region | null) => void;
}

export class Globe {
  private scene = new Scene();
  private camera = new PerspectiveCamera(40, 1, 0.05, 50);
  private renderer: WebGLRenderer;
  private labelRenderer = new CSS2DRenderer();
  private controls: OrbitControls;
  private earth: Mesh;
  private markers: Markers;
  private light = new DirectionalLight(0xfff2d8, 2.2);
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private fly: { from: Vector3; q: Quaternion; fromDist: number; toDist: number; start: number; dur: number } | null = null;
  private scratchQ = new Quaternion();
  private scratchV = new Vector3();
  private lightOffset = new Vector3(-1.5, 1.2, 0.5);
  private ndcVec = new Vector2();
  private idleTimer = 0;
  private holdRotation = false;
  private viewShift = { x: 0, y: 0, tx: 0, ty: 0 };
  private downs = new Map<number, Vector2>();
  private multiTouch = false;
  /** Resolves once the globe texture has been painted. */
  readonly ready: Promise<void>;
  private width = 1;
  private height = 1;

  constructor(private container: HTMLElement, regions: Region[], private events: GlobeEvents) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.earth = new Mesh(
      new SphereGeometry(1, 128, 96),
      new MeshStandardMaterial({ color: 0xd9c79a, roughness: 1, metalness: 0 }),
    );
    this.scene.add(this.earth, createAtmosphere());
    this.scene.add(new AmbientLight(0xfff6e0, 1.5), this.light);

    // Paint the map after first paint so the loading screen can animate.
    this.ready = new Promise((resolve) =>
      setTimeout(() => {
        const mat = this.earth.material as MeshStandardMaterial;
        mat.map = createEarthTexture(matchMedia('(max-width: 720px)').matches ? 2048 : 4096);
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
        resolve();
      }, 30),
    );

    this.markers = new Markers(regions);
    this.scene.add(this.markers.group);

    this.camera.position.set(2.2, 1.2, DEFAULT_DIST - 0.6).setLength(DEFAULT_DIST);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enablePan: false,
      enableDamping: true,
      dampingFactor: 0.07,
      minDistance: MIN_DIST,
      maxDistance: MAX_DIST,
      zoomSpeed: 0.8,
      autoRotate: !this.reducedMotion,
      autoRotateSpeed: 0.45,
    });
    this.controls.addEventListener('start', () => {
      this.fly = null;
      this.controls.autoRotate = false;
      clearTimeout(this.idleTimer);
    });
    this.controls.addEventListener('end', () => this.scheduleResume());

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerdown', (e) => {
      if (this.downs.size > 0) this.multiTouch = true;
      this.downs.set(e.pointerId, new Vector2(e.clientX, e.clientY));
    });
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => {
      this.downs.delete(e.pointerId);
      if (!this.downs.size) this.multiTouch = false;
    });
    el.addEventListener('pointerleave', () => this.events.onHover(null, 0, 0));

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop((t) => this.frame(t / 1000));
  }

  /** Keep the globe from spinning while a panel is open. */
  setHoldRotation(hold: boolean): void {
    this.holdRotation = hold;
    if (hold) {
      this.controls.autoRotate = false;
      clearTimeout(this.idleTimer);
    } else this.scheduleResume();
  }

  /** Shift the globe's visual centre by pixels, so it stays centred in the space not covered by the panel. */
  setViewShift(x: number, y: number): void {
    this.viewShift.tx = x;
    this.viewShift.ty = y;
    if (this.reducedMotion) {
      Object.assign(this.viewShift, { x, y });
      this.applyViewOffset();
    }
  }

  setActiveRegions(slugs: Set<string> | null): void {
    this.markers.setActive(slugs);
  }

  setSelected(slug: string | null): void {
    this.markers.setSelected(slug);
  }

  flyTo(slug: string): void {
    const dir = this.markers.direction(slug);
    if (!dir) return;
    const dist = Math.min(this.camera.position.length(), FOCUS_DIST);
    this.controls.autoRotate = false;
    clearTimeout(this.idleTimer);
    if (this.reducedMotion) {
      this.camera.position.copy(dir.multiplyScalar(dist));
      return;
    }
    const from = this.camera.position.clone().normalize();
    // Shortest rotation between the two directions (well defined even for antipodal ones).
    const q = new Quaternion().setFromUnitVectors(from, dir);
    this.fly = {
      from,
      q,
      fromDist: this.camera.position.length(),
      toDist: dist,
      start: performance.now(),
      dur: 1300,
    };
  }

  private scheduleResume(): void {
    clearTimeout(this.idleTimer);
    if (this.reducedMotion || this.holdRotation) return;
    this.idleTimer = window.setTimeout(() => (this.controls.autoRotate = true), IDLE_RESUME_MS);
  }

  private ndc(e: PointerEvent): Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return this.ndcVec.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private onMove(e: PointerEvent): void {
    if (e.buttons || e.pointerType === 'touch') return;
    const region = this.markers.pick(this.ndc(e), this.camera);
    this.renderer.domElement.style.cursor = region ? 'pointer' : '';
    this.events.onHover(region, e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent): void {
    const down = this.downs.get(e.pointerId);
    this.downs.delete(e.pointerId);
    const wasMulti = this.multiTouch;
    if (!this.downs.size) this.multiTouch = false;
    if (wasMulti || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // pinch or drag
    this.events.onSelect(this.markers.pick(this.ndc(e), this.camera));
  }

  private resize(): void {
    this.width = this.container.clientWidth || 1;
    this.height = this.container.clientHeight || 1;
    this.renderer.setSize(this.width, this.height);
    this.labelRenderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    // Keep the whole globe in frame on narrow/portrait screens.
    this.camera.fov = this.camera.aspect < 1 ? 40 / Math.max(this.camera.aspect, 0.55) : 40;
    this.applyViewOffset();
  }

  private applyViewOffset(): void {
    const { x, y } = this.viewShift;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.width, this.height, x, y, this.width, this.height);
    this.camera.updateProjectionMatrix();
  }

  private frame(t: number): void {
    if (this.fly) {
      const f = this.fly;
      const k = Math.min(1, (performance.now() - f.start) / f.dur);
      const e = easeInOut(k);
      this.scratchQ.identity().slerp(f.q, e);
      this.scratchV.copy(f.from).applyQuaternion(this.scratchQ).multiplyScalar(f.fromDist + (f.toDist - f.fromDist) * e);
      this.camera.position.copy(this.scratchV);
      if (k >= 1) this.fly = null;
    }
    // Slower rotation when zoomed in, so dragging stays precise.
    const dist = this.camera.position.length();
    this.controls.rotateSpeed = Math.max(0.15, (dist - 1) / 2.4);
    if (this.fly) this.camera.lookAt(0, 0, 0);
    else this.controls.update(); // skip while flying so drag inertia can't fight the tween

    const s = this.viewShift;
    const lerp = this.reducedMotion ? 1 : 0.12;
    const moving = Math.abs(s.tx - s.x) > 0.3 || Math.abs(s.ty - s.y) > 0.3;
    if (moving) {
      s.x += (s.tx - s.x) * lerp;
      s.y += (s.ty - s.y) * lerp;
      this.applyViewOffset();
    }

    this.light.position.copy(this.camera.position).add(this.lightOffset);
    this.markers.update(t, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
