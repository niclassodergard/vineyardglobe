import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from 'three';

/** Soft warm halo around the globe (Fresnel falloff on a slightly larger back-faced sphere). */
export function createAtmosphere(): Mesh {
  const material = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        float f = pow(max(dot(-vNormal, vView), 0.0), 3.0);
        gl_FragColor = vec4(vec3(0.5, 0.33, 0.14), f * 0.5);
      }`,
  });
  return new Mesh(new SphereGeometry(1.14, 64, 48), material);
}
