import {
  CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Raycaster,
  Sphere, SphereGeometry, Sprite, SpriteMaterial, Vector2, Vector3,
} from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Region } from '../content/types';
import { latLonToVector3 } from './geo';

const WINE = new Color('#8c1c3b');
const DIM = new Color('#a89a7c');

function ringTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  grad.addColorStop(0, 'rgba(140, 28, 59, 0)');
  grad.addColorStop(0.7, 'rgba(140, 28, 59, 0.55)');
  grad.addColorStop(0.82, 'rgba(140, 28, 59, 0.9)');
  grad.addColorStop(1, 'rgba(140, 28, 59, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

interface Marker {
  region: Region;
  dir: Vector3;
  group: Group;
  dot: Mesh<SphereGeometry, MeshBasicMaterial>;
  ring: Sprite;
  hit: Mesh;
  label: CSS2DObject;
  labelEl: HTMLDivElement;
  active: boolean;
  phase: number;
  labelOn: boolean;
  labelSel: boolean;
}

export class Markers {
  readonly group = new Group();
  private markers: Marker[] = [];
  private byHit = new Map<Object3D, Marker>();
  private raycaster = new Raycaster();
  private ringTex = ringTexture();
  private dotGeo = new SphereGeometry(1, 16, 12);
  private hitGeo = new SphereGeometry(1, 8, 6);
  private selected: string | null = null;
  private hitMeshes: Object3D[] = [];
  private camDir = new Vector3();
  private unitSphere = new Sphere(new Vector3(), 1);
  private sphereHit = new Vector3();

  constructor(regions: Region[]) {
    for (const [i, region] of regions.entries()) {
      const dir = latLonToVector3(region.lat, region.lon, 1);
      const group = new Group();
      group.position.copy(dir).multiplyScalar(1.004);

      const dot = new Mesh(this.dotGeo, new MeshBasicMaterial({ color: WINE }));
      const ring = new Sprite(new SpriteMaterial({ map: this.ringTex, transparent: true, depthWrite: false }));
      const hit = new Mesh(this.hitGeo, new MeshBasicMaterial({ visible: false }));
      const labelEl = document.createElement('div');
      labelEl.className = 'marker-label';
      labelEl.textContent = region.name;
      const label = new CSS2DObject(labelEl);
      label.position.set(0, 0, 0);
      label.center.set(0.5, -0.8);

      group.add(ring, dot, hit, label);
      this.group.add(group);
      const m: Marker = { region, dir, group, dot, ring, hit, label, labelEl, active: true, phase: i * 0.7, labelOn: false, labelSel: false };
      this.markers.push(m);
      this.byHit.set(hit, m);
      this.hitMeshes.push(hit);
    }
  }

  /** Dim markers that don't match the active filter. */
  setActive(slugs: Set<string> | null): void {
    for (const m of this.markers) {
      m.active = !slugs || slugs.has(m.region.slug);
      m.dot.material.color.copy(m.active ? WINE : DIM);
      m.ring.visible = m.active;
    }
  }

  setSelected(slug: string | null): void {
    this.selected = slug;
  }

  /** Per-frame: pulse, keep on-screen size roughly constant, show labels when zoomed in on the near side. */
  update(time: number, camera: PerspectiveCamera): void {
    const dist = camera.position.length();
    const unit = Math.max(0.35, dist - 1) * 0.0058; // world size of one marker "pixel-ish" unit
    const camDir = this.camDir.copy(camera.position).normalize();
    const horizon = 1 / dist; // dot threshold for points visible over the horizon
    for (const m of this.markers) {
      const facing = m.dir.dot(camDir);
      const visible = facing > horizon + 0.02;
      m.group.visible = visible;
      if (!visible) continue;
      const sel = m.region.slug === this.selected;
      const s = unit * (sel ? 1.7 : m.active ? 1 : 0.6);
      m.dot.scale.setScalar(s);
      m.hit.scale.setScalar(s * 2.6);
      const p = (Math.sin(time * 2 + m.phase) + 1) / 2;
      m.ring.scale.setScalar(s * (2.4 + p * 3));
      m.ring.material.opacity = (sel ? 0.9 : 0.75) * (1 - p * 0.85);
      const showLabel = (dist < 2.3 && m.active) || sel;
      if (showLabel !== m.labelOn) m.labelEl.classList.toggle('visible', (m.labelOn = showLabel));
      if (sel !== m.labelSel) m.labelEl.classList.toggle('selected', (m.labelSel = sel));
    }
  }

  /** Returns the region under the pointer (NDC coordinates), ignoring markers hidden behind the globe. */
  pick(ndc: Vector2, camera: PerspectiveCamera): Region | null {
    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObjects(this.hitMeshes, false);
    // The globe is an exact unit sphere, so test it analytically instead of against its triangles.
    const earthPoint = this.raycaster.ray.intersectSphere(this.unitSphere, this.sphereHit);
    const earth = earthPoint ? { distance: this.raycaster.ray.origin.distanceTo(earthPoint) } : undefined;
    for (const h of hits) {
      const m = this.byHit.get(h.object)!;
      if (!m.group.visible || !m.active) continue;
      if (earth && earth.distance < h.distance - 0.03) continue;
      return m.region;
    }
    return null;
  }

  direction(slug: string): Vector3 | null {
    return this.markers.find((m) => m.region.slug === slug)?.dir.clone() ?? null;
  }
}
