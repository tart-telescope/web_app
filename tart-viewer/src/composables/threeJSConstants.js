/**
 * Shared constants for Three.js components
 * Centralizes common values to avoid duplication and magic numbers
 */

// Default dimensions
export const DEFAULT_DIMENSIONS = {
  width: 600,
  height: 600,
};

// Camera defaults
export const CAMERA_DEFAULTS = {
  orthographic: {
    frustumSize: 3,
    near: 0.1,
    far: 1000,
    position: { x: 0, y: 0, z: 5 },
    lookAt: { x: 0, y: 0, z: 0 },
  },
  perspective: {
    fov: 75,
    near: 0.1,
    far: 1000,
    position: { x: 0, y: 0, z: 5 },
    lookAt: { x: 0, y: 0, z: 0 },
  },
  sphereView: {
    frustumSize: 3,
    position: { x: 0, y: 3.5, z: 0 },
    lookAt: { x: 0, y: 0, z: 0 },
    rotateForNorthUp: true,
  },
};

// Sphere defaults
export const SPHERE_DEFAULTS = {
  radius: 1,
  segments: 32,
  rings: 16,
  satelliteOffset: 0.02,
  indicatorOffset: 0.05,
};

// Interaction defaults
export const INTERACTION_DEFAULTS = {
  rotationSensitivity: 2,
  zoomSensitivity: 1.1,
  smoothingFactor: 0.1,
  verticalRotationLimit: Math.PI / 2,
};

// Zoom limits
export const ZOOM_LIMITS = {
  min: 1.5,
  max: 10,
};

// Colors
export const COLORS = {
  background: 0x00_00_00,
  backgroundAlpha: 0,
  defaultSatellite: 0xff_ff_ff,
  hoveredSatellite: 0xff_00_00,
  grid: 0xff_ff_ff,
  compass: 0x88_88_88,
  positionIndicator: 0x00_bf_ff,
};

// Material defaults
export const MATERIAL_DEFAULTS = {
  antialias: true,
  alpha: true,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance",
  transparent: false,
  wireframe: false,
  side: 2, // DoubleSide
  depthTest: true,
  depthWrite: true,
};

// Coordinate display styles
export const COORDINATE_DISPLAY_STYLES = {
  position: "absolute",
  background: "rgba(0, 0, 0, 0.8)",
  color: "white",
  padding: "4px 8px",
  borderRadius: "4px",
  fontSize: "12px",
  fontFamily: "monospace",
  pointerEvents: "none",
  zIndex: "1000",
  whiteSpace: "nowrap",
  userSelect: "none",
};

// Animation settings
export const ANIMATION_SETTINGS = {
  autoStart: true,
  targetFPS: 60,
};

// Grid settings
export const GRID_SETTINGS = {
  latitudeLines: 18, // Every 10 degrees
  longitudeLines: 36, // Every 10 degrees
  opacity: 0.6,
  lineWidth: 1,
};

// Satellite display settings
export const SATELLITE_SETTINGS = {
  defaultSize: 0.04,
  hoverSize: 0.06,
  ringInnerRadius: 0.03,
  ringOuterRadius: 0.05,
  spriteSize: 64,
};

// Touch/gesture settings
export const GESTURE_SETTINGS = {
  pinchSensitivity: 0.01,
  rotationSensitivity: 0.02,
  singleTouchSensitivity: 2,
};

// Performance settings
export const PERFORMANCE_SETTINGS = {
  enableFrustumCulling: true,
  enableOcclusion: false,
  maxSatellites: 1000,
  bufferSize: 4096,
};

// Math constants
export const MATH_CONSTANTS = {
  DEG_TO_RAD: Math.PI / 180,
  RAD_TO_DEG: 180 / Math.PI,
  TWO_PI: 2 * Math.PI,
  HALF_PI: Math.PI / 2,
};

// Coordinate system settings
export const COORDINATE_SYSTEMS = {
  spherical: {
    longitudeRange: [-180, 180],
    latitudeRange: [-90, 90],
  },
  azimuthElevation: {
    azimuthRange: [0, 360],
    elevationRange: [-90, 90],
  },
};
