import { describe, expect, it } from 'vitest';
import { latLonToVector3 } from '../src/globe/geo';

describe('latLonToVector3', () => {
  it('puts Greenwich on the equator at +X', () => {
    const v = latLonToVector3(0, 0);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(0);
  });
  it('puts the poles on the Y axis', () => {
    expect(latLonToVector3(90, 0).y).toBeCloseTo(1);
    expect(latLonToVector3(-90, 0).y).toBeCloseTo(-1);
  });
  it('puts 90°E at -Z', () => {
    const v = latLonToVector3(0, 90);
    expect(v.z).toBeCloseTo(-1);
  });
  it('returns unit vectors', () => {
    expect(latLonToVector3(44.84, -0.58).length()).toBeCloseTo(1);
  });
});
