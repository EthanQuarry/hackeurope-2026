// --- Shader utilities (from matiasngf/portfolio reference) ---

const valueRemap = `
float valueRemap(float value, float inMin, float inMax, float outMin, float outMax) {
  return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}
`

const perturbNormalArb = `
vec2 dHdxy_fwd(vec2 uv, sampler2D map, float scale) {
  float scaledBumpScale = scale / 10.0;
  vec2 dSTdx = dFdx( uv );
  vec2 dSTdy = dFdy( uv );
  float Hll = scaledBumpScale * texture2D( map, uv ).x;
  float dBx = scaledBumpScale * texture2D( map, uv + dSTdx ).x - Hll;
  float dBy = scaledBumpScale * texture2D( map, uv + dSTdy ).x - Hll;
  return vec2( dBx, dBy );
}

vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy ) {
  vec3 vSigmaX = dFdx( surf_pos );
  vec3 vSigmaY = dFdy( surf_pos );
  vec3 vN = surf_norm;
  vec3 R1 = cross( vSigmaY, vN );
  vec3 R2 = cross( vN, vSigmaX );
  float fDet = dot( vSigmaX, R1 );
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( fDet ) * surf_norm - vGrad );
}
`

const curveUp = `
float curveUp( float x, float factor ) {
  return ( 1.0 - factor / (x + factor) ) * (factor + 1.0);
}
`

const simplexNoise = `
vec3 random3(vec3 c) {
  float j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
  vec3 r;
  r.z = fract(512.0*j);
  j *= .125;
  r.x = fract(512.0*j);
  j *= .125;
  r.y = fract(512.0*j);
  return r-0.5;
}

const float SIMPLEX_NOISE_F3 = 0.3333333;
const float SIMPLEX_NOISE_G3 = 0.1666667;

float simplex3d(vec3 p) {
  vec3 s = floor(p + dot(p, vec3(SIMPLEX_NOISE_F3)));
  vec3 x = p - s + dot(s, vec3(SIMPLEX_NOISE_G3));
  vec3 e = step(vec3(0.0), x - x.yzx);
  vec3 i1 = e*(1.0 - e.zxy);
  vec3 i2 = 1.0 - e.zxy*(1.0 - e);
  vec3 x1 = x - i1 + SIMPLEX_NOISE_G3;
  vec3 x2 = x - i2 + 2.0*SIMPLEX_NOISE_G3;
  vec3 x3 = x - 1.0 + 3.0*SIMPLEX_NOISE_G3;
  vec4 w, d;
  w.x = dot(x, x); w.y = dot(x1, x1); w.z = dot(x2, x2); w.w = dot(x3, x3);
  w = max(0.6 - w, 0.0);
  d.x = dot(random3(s), x); d.y = dot(random3(s + i1), x1);
  d.z = dot(random3(s + i2), x2); d.w = dot(random3(s + 1.0), x3);
  w *= w; w *= w; d *= w;
  return dot(d, vec4(52.0));
}

const mat3 rot1 = mat3(-0.37, 0.36, 0.85,-0.14,-0.93, 0.34,0.92, 0.01,0.4);
const mat3 rot2 = mat3(-0.55,-0.39, 0.74, 0.33,-0.91,-0.24,0.77, 0.12,0.63);
const mat3 rot3 = mat3(-0.71, 0.52,-0.47,-0.08,-0.72,-0.68,-0.7,-0.45,0.56);

float simplex3d_fractal(vec3 m) {
  return 0.5333333*simplex3d(m*rot1)
        +0.2666667*simplex3d(2.0*m*rot2)
        +0.1333333*simplex3d(4.0*m*rot3)
        +0.0666667*simplex3d(8.0*m);
}
`

// --- Earth shaders (3-texture: day + night + clouds) ---

export const earthVertexShader = /*glsl*/ `
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 wPos;

void main() {
  vUv = uv;
  vNormal = normal;
  wPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const earthFragmentShader = /*glsl*/ `
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 wPos;
uniform vec3 lightDirection;
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D cloudMap;
uniform float uTime;

const float PI = 3.141592653;

${valueRemap}
${perturbNormalArb}
${curveUp}
${simplexNoise}

float autoClamp(float value) {
  return clamp(value, 0.0, 1.0);
}

void main() {
  // Setup
  vec3 vLightDirection = normalize(lightDirection);
  vec3 normal = normalize(vNormal);
  vec3 viewDirection = normalize(cameraPosition - wPos);
  float distanceToCamera = length(cameraPosition - wPos);

  vec3 result = vec3(0.0);

  // Diffuse color
  vec3 dayColor = texture2D(dayMap, vUv).rgb;
  float rawLambertFactor = dot(normal, vLightDirection);

  // Sun light with smooth terminator
  float rawSunLightFactor = valueRemap(rawLambertFactor, -0.1, 0.1, 0.0, 1.0);
  float sunLightFactor = autoClamp(rawSunLightFactor);

  result = dayColor * sunLightFactor;

  // Night map — real city lights
  vec3 nightColor = texture2D(nightMap, vUv).rgb;
  float nightLightsFactor = autoClamp(valueRemap(rawSunLightFactor, 0.0, 0.15, 0.0, 1.0));
  nightColor = nightColor * (1.0 - nightLightsFactor);
  result += nightColor;

  // Noise for cloud edge variation
  float rotation = uTime * 0.005;
  vec3 wPosOffset = wPos * mat3(
    cos(rotation), 0.0, sin(rotation),
    0.0, 1.0, 0.0,
    -sin(rotation), 0.0, cos(rotation)
  );
  float noiseFactor = valueRemap(simplex3d_fractal(wPosOffset * 100.0), -1.0, 1.0, 0.0, 1.0);
  float distanceFactor = autoClamp(-distanceToCamera + 1.0);
  noiseFactor = noiseFactor * 0.5 * distanceFactor;

  // Clouds from real texture
  float cloudFactor = length(texture2D(cloudMap, vUv).rgb);
  float cloudNoiseFactor = clamp(valueRemap(cloudFactor, 0.0, 0.5, 0.5, 1.0) * noiseFactor, 0.0, 1.0);
  cloudFactor = clamp(cloudFactor - cloudNoiseFactor, 0.0, 1.0);
  vec3 cloudColor = vec3(0.9);

  // Cloud normals for self-shadowing
  float cloudNormalScale = 0.01;
  vec3 cloudNormal = perturbNormalArb(wPos, normal, dHdxy_fwd(vUv, cloudMap, cloudNormalScale));
  float cloudNormalFactor = dot(cloudNormal, vLightDirection);
  float cloudShadowFactor = clamp(
    valueRemap(cloudNormalFactor, 0.0, 0.3, 0.3, 1.0),
    0.3, 1.0
  );
  cloudShadowFactor = curveUp(cloudShadowFactor, 0.5);
  cloudColor *= cloudShadowFactor;

  // Sunset
  float sunsetFactor = clamp(valueRemap(rawSunLightFactor, -0.1, 0.85, -1.0, 1.0), -1.0, 1.0);
  sunsetFactor = cos(sunsetFactor * PI) * 0.5 + 0.5;
  vec3 sunsetColor = vec3(0.525, 0.273, 0.249);

  // Clouds with sunset
  float sunsetCloudFactor = pow(cloudFactor, 1.5) * sunsetFactor;
  cloudColor *= clamp(sunLightFactor, 0.1, 1.0);
  cloudColor = mix(cloudColor, sunsetColor, sunsetCloudFactor);

  // Clouds on earth
  result = mix(result, cloudColor, cloudFactor);

  // Fresnel atmosphere
  float fresnelBias = 0.1;
  float fresnelScale = 0.5;
  float fresnelFactor = fresnelBias + fresnelScale * pow(1.0 - dot(normal, normalize(viewDirection)), 3.0);
  vec3 atmosphereColor = vec3(0.51, 0.714, 1.0);

  // Fresnel sunset
  vec3 atmosphereSunsetColor = vec3(1.0, 0.373, 0.349);
  float fresnelSunsetFactor = dot(-vLightDirection, viewDirection);
  fresnelSunsetFactor = valueRemap(fresnelSunsetFactor, 0.97, 1.0, 0.0, 1.0);
  fresnelSunsetFactor = autoClamp(fresnelSunsetFactor);
  atmosphereColor = mix(atmosphereColor, atmosphereSunsetColor, fresnelSunsetFactor);

  result = mix(result, atmosphereColor, fresnelFactor * sunLightFactor);

  result = clamp(result * 0.9, 0.0, 0.7);
  gl_FragColor = vec4(result, 1.0);
}
`

// --- Atmosphere shader ---

export const atmosphereVertexShader = /*glsl*/ `
varying vec3 vNormal;
varying vec3 wPos;

void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  wPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const atmosphereFragmentShader = /*glsl*/ `
varying vec3 vNormal;
varying vec3 wPos;
uniform vec3 lightDirection;
uniform float uTime;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - wPos);
  vec3 vLightDir = normalize(lightDirection);

  float fresnel = pow(1.0 - dot(viewDir, normal), 3.5);
  float lightFacing = dot(normal, vLightDir);
  float lightFactor = clamp(lightFacing * 0.5 + 0.5, 0.15, 1.0);

  vec3 color = vec3(0.4, 0.7, 1.0) * lightFactor;

  // Sunset tint
  float sf = smoothstep(0.93, 1.0, dot(-vLightDir, viewDir));
  color = mix(color, vec3(1.0, 0.5, 0.3), sf * 0.5);

  float alpha = fresnel * lightFactor * 0.65;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.55));
}
`

// --- Starfield shader ---

export const starfieldVertexShader = /*glsl*/ `
attribute float size;
attribute float brightness;
attribute vec3 starColor;
varying float vBrightness;
varying vec3 vColor;

void main() {
  vBrightness = brightness;
  vColor = starColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (200.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`

export const starfieldFragmentShader = /*glsl*/ `
varying float vBrightness;
varying vec3 vColor;
uniform float uTime;

void main() {
  float dist = length(gl_PointCoord - vec2(0.5));
  if (dist > 0.5) discard;
  float alpha = smoothstep(0.5, 0.05, dist);

  float twinkle = 0.8 + 0.2 * sin(uTime * 1.5 + vBrightness * 137.0);
  twinkle *= 0.9 + 0.1 * sin(uTime * 3.7 + vBrightness * 53.0);

  gl_FragColor = vec4(vColor * vBrightness * twinkle, alpha * vBrightness);
}
`
