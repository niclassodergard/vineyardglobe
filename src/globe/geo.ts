import { Vector3 } from 'three';

/**
 * Converts lat/lon (degrees) to a point on a sphere. Matches three.js SphereGeometry's UV mapping
 * for an equirectangular texture (u=0 at lon -180), so Greenwich ends up on +X.
 */
export function latLonToVector3(lat: number, lon: number, radius = 1, target = new Vector3()): Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return target.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}
