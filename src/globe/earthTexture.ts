import { CanvasTexture, SRGBColorSpace } from 'three';
import { feature, mesh } from 'topojson-client';
import countries from 'world-atlas/countries-50m.json';

const OCEAN = '#d6d3b4';
const LAND = '#efe0b5';
const INK = '#4a3320';

/** Paints a parchment-and-ink world map (equirectangular) on a canvas. No image assets needed. */
export function createEarthTexture(width = 4096): CanvasTexture {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const x = (lon: number) => ((lon + 180) / 360) * width;
  const y = (lat: number) => ((90 - lat) / 180) * height;
  const px = width / 4096; // scale line widths with resolution

  // Ocean with soft aged-paper mottling.
  ctx.fillStyle = OCEAN;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 220; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const r = (60 + Math.random() * 260) * px;
    ctx.save();
    ctx.translate(Math.random() * width, Math.random() * height);
    ctx.scale(r, r);
    g.addColorStop(0, `rgba(120, 100, 55, ${0.03 + Math.random() * 0.05})`);
    g.addColorStop(1, 'rgba(120, 100, 55, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Graticule.
  ctx.strokeStyle = 'rgba(74, 51, 32, 0.28)';
  ctx.lineWidth = 1.4 * px;
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 15) {
    ctx.moveTo(x(lon), 0);
    ctx.lineTo(x(lon), height);
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    ctx.moveTo(0, y(lat));
    ctx.lineTo(width, y(lat));
  }
  ctx.stroke();

  // Equator and tropics a little stronger.
  ctx.strokeStyle = 'rgba(122, 31, 52, 0.35)';
  ctx.lineWidth = 2 * px;
  ctx.setLineDash([14 * px, 10 * px]);
  ctx.beginPath();
  for (const lat of [0, 23.44, -23.44]) {
    ctx.moveTo(0, y(lat));
    ctx.lineTo(width, y(lat));
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topo = countries as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const land = feature(topo, topo.objects.countries) as any;

  const traceRing = (ring: number[][], shift: number) => {
    ring.forEach(([lon, lat], i) => (i === 0 ? ctx.moveTo(x(lon + shift), y(lat)) : ctx.lineTo(x(lon + shift), y(lat))));
    ctx.closePath();
  };
  // Rings crossing the antimeridian jump ~360° in longitude. Unwrap them into a continuous ring and draw
  // it at -360/0/+360 so both halves land on the map. Pole-enclosing rings (Antarctica) stay as they are.
  const tracePolygon = (rings: number[][][]) => {
    for (const ring of rings) {
      let offset = 0;
      let jumped = false;
      const unwrapped = ring.map(([lon, lat], i) => {
        if (i > 0) {
          const d = lon - ring[i - 1][0];
          if (d > 180) (offset -= 360), (jumped = true);
          else if (d < -180) (offset += 360), (jumped = true);
        }
        return [lon + offset, lat];
      });
      if (jumped && offset === 0) for (const shift of [-360, 0, 360]) traceRing(unwrapped, shift);
      else traceRing(ring, 0);
    }
  };
  const traceGeometry = (g: { type: string; coordinates: number[][][] | number[][][][] }) => {
    if (g.type === 'Polygon') tracePolygon(g.coordinates as number[][][]);
    else if (g.type === 'MultiPolygon') (g.coordinates as number[][][][]).forEach(tracePolygon);
  };

  // Land fill + soft shadow-ish coastal halo.
  ctx.beginPath();
  for (const f of land.features) traceGeometry(f.geometry);
  ctx.shadowColor = 'rgba(74, 51, 32, 0.35)';
  ctx.shadowBlur = 10 * px;
  ctx.fillStyle = LAND;
  ctx.fill('nonzero');
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2 * px;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Country borders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const borders = mesh(topo, topo.objects.countries, (a: any, b: any) => a !== b) as any;
  ctx.beginPath();
  for (const line of borders.coordinates as number[][][]) {
    line.forEach(([lon, lat], i) =>
      i === 0 || Math.abs(lon - line[i - 1][0]) > 180 ? ctx.moveTo(x(lon), y(lat)) : ctx.lineTo(x(lon), y(lat)),
    );
  }
  ctx.strokeStyle = 'rgba(74, 51, 32, 0.45)';
  ctx.lineWidth = 1.1 * px;
  ctx.setLineDash([6 * px, 3 * px]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Paper grain: a small tiled noise tile, much cheaper than touching every pixel.
  const tile = document.createElement('canvas');
  tile.width = tile.height = 256;
  const tctx = tile.getContext('2d')!;
  const noise = tctx.createImageData(256, 256);
  for (let i = 0; i < noise.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 40 : 255;
    noise.data[i] = noise.data[i + 1] = noise.data[i + 2] = v;
    noise.data[i + 3] = Math.random() * 18;
  }
  tctx.putImageData(noise, 0, 0);
  ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
  ctx.fillRect(0, 0, width, height);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
