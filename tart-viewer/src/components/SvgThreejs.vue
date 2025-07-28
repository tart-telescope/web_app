<template>
  <div ref="containerRef" class="svg-threejs-container">
    <canvas ref="canvasRef" class="threejs-canvas" />
  </div>
</template>

<script setup>
  import {
    BufferAttribute,
    BufferGeometry,
    CanvasTexture,
    CatmullRomCurve3,
    CircleGeometry,
    Group,
    LinearSRGBColorSpace,
    LinearToneMapping,
    Mesh,
    MeshBasicMaterial,
    OrthographicCamera,
    Raycaster,
    RingGeometry,
    Scene,
    ShaderMaterial,
    Sprite,
    SpriteMaterial,
    TubeGeometry,
    Vector3,
    WebGLRenderer,
  } from "three";
  import { onMounted, onUnmounted, ref, watch } from "vue";
  import {
    CAMERA_DEFAULTS,
    COLORS,
    DEFAULT_DIMENSIONS,
    GRID_SETTINGS,
    MATERIAL_DEFAULTS,
    SATELLITE_SETTINGS,
    SPHERE_DEFAULTS,
  } from "../composables/threeJSConstants.js";

  const props = defineProps({
    width: {
      type: Number,
      default: DEFAULT_DIMENSIONS.width,
    },
    height: {
      type: Number,
      default: DEFAULT_DIMENSIONS.height,
    },
    autoResize: {
      type: Boolean,
      default: true,
    },
    satelliteData: {
      type: Array,
      default: () => [],
    },
    showGrid: {
      type: Boolean,
      default: true,
    },
    showSatellites: {
      type: Boolean,
      default: true,
    },
    minElevation: {
      type: Number,
      default: 0,
    },
  });

  const canvasRef = ref(null);
  const containerRef = ref(null);
  let scene, camera, renderer, animationId;
  let polygonMesh = null;
  let polygonGeometry = null;
  let polygonMaterial = null;
  let resizeObserver = null;
  let gridGroup = null;
  let satelliteGroup = null;
  let satellites = [];
  let raycaster = null;
  let sphereRadius = ref(1);
  let compassGroup = null;

  const [vbWidth, vbHeight] = [4000, 4000];
  const scale = 2 / vbWidth;
  const vbWidthHalf = vbWidth / 2;
  const vbHeightHalf = vbHeight / 2;

  // Vertex shader
  const vertexShader = `
  attribute vec3 color;
  varying vec3 vColor;

  void main() {
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

  // Fragment shader
  const fragmentShader = `
  precision mediump float;
  varying vec3 vColor;

  void main() {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

  // Initialize Three.js scene
  function initThreeJS () {
    if (!canvasRef.value) return;

    // Scene setup
    scene = new Scene();
    scene.background = null;

    // Camera setup - same as 3D view (looking down from above)
    const { width, height } = props.autoResize
      ? getContainerSize()
      : { width: props.width, height: props.height };
    const aspect = width / height;
    const frustumSize = 3;
    camera = new OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      CAMERA_DEFAULTS.orthographic.near,
      CAMERA_DEFAULTS.orthographic.far,
    );
    camera.position.set(0, 3.5, 0); // Same as 3D view
    camera.lookAt(0, 0, 0);
    camera.rotation.z = Math.PI; // North up orientation

    // Renderer setup
    renderer = new WebGLRenderer({
      canvas: canvasRef.value,
      antialias: MATERIAL_DEFAULTS.antialias,
      alpha: MATERIAL_DEFAULTS.alpha,
      premultipliedAlpha: MATERIAL_DEFAULTS.premultipliedAlpha,
      preserveDrawingBuffer: MATERIAL_DEFAULTS.preserveDrawingBuffer,
      powerPreference: MATERIAL_DEFAULTS.powerPreference,
    });
    renderer.setClearColor(COLORS.background, COLORS.backgroundAlpha);
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.toneMapping = LinearToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setSize(props.width, props.height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Create shader material
    polygonMaterial = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: MATERIAL_DEFAULTS.transparent,
      wireframe: MATERIAL_DEFAULTS.wireframe,
      side: MATERIAL_DEFAULTS.side, // DoubleSide
    });

    // Create grid, satellite, and compass groups
    gridGroup = new Group();
    satelliteGroup = new Group();
    compassGroup = new Group();
    scene.add(gridGroup);
    scene.add(satelliteGroup);
    scene.add(compassGroup);

    // Initialize raycaster
    raycaster = new Raycaster();

    // Create initial grid, satellites, and compass
    createGridLines();
    updateSatelliteOverlays();
    createCompassLabels();

  // Shader material should work now that geometry is confirmed working
  }

  function createPolygonCoordinates (coordinates) {
    if (!scene || !renderer || !camera) {
      return;
    }

    // Remove existing polygon mesh
    if (polygonMesh) {
      scene.remove(polygonMesh);
      if (polygonGeometry) {
        polygonGeometry.dispose();
      }
    }

    const polygonCount = coordinates.length / 8;
    if (polygonCount === 0) return;

    // Create arrays for vertices and colors
    const vertices = [];
    const colors = [];
    const indices = [];

    // Process each polygon (quad)
    for (let i = 0; i < polygonCount; i++) {
      const coordOffset = i * 8;

      // Get the 4 vertices of the quad
      const x1 = scale * (coordinates[coordOffset] - vbWidthHalf);
      const y1 = -scale * (coordinates[coordOffset + 1] - vbHeightHalf);
      const x2 = scale * (coordinates[coordOffset + 2] - vbWidthHalf);
      const y2 = -scale * (coordinates[coordOffset + 3] - vbHeightHalf);
      const x3 = scale * (coordinates[coordOffset + 4] - vbWidthHalf);
      const y3 = -scale * (coordinates[coordOffset + 5] - vbHeightHalf);
      const x4 = scale * (coordinates[coordOffset + 6] - vbWidthHalf);
      const y4 = -scale * (coordinates[coordOffset + 7] - vbHeightHalf);

      // Add vertices for this quad
      const baseIndex = vertices.length / 3;

      vertices.push(x1, y1, 0, x2, y2, 0, x3, y3, 0, x4, y4, 0);

      // Set default black color for all vertices
      colors.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // vertex 4

      // Create two triangles for the quad (ensure counter-clockwise winding)
      indices.push(
        baseIndex,
        baseIndex + 1,
        baseIndex + 2, // first triangle
        baseIndex + 2,
        baseIndex + 3,
        baseIndex, // second triangle
      );
    }

    // Create buffer geometry
    polygonGeometry = new BufferGeometry();
    polygonGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(vertices), 3),
    );
    polygonGeometry.setAttribute(
      "color",
      new BufferAttribute(new Float32Array(colors), 3),
    );
    polygonGeometry.setIndex(indices);

    // Create mesh and position as flat plane underneath 3D elements
    polygonMesh = new Mesh(polygonGeometry, polygonMaterial);
    polygonMesh.position.set(0, -0.1, 0); // Position slightly below the sphere
    polygonMesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    polygonMesh.rotation.z = Math.PI; // Rotate 180 degrees to correct E-W orientation
    polygonMesh.scale.set(1.05, 1.05, 1.05); // Scale to better match grid size
    scene.add(polygonMesh);
  }

  // Update colors of existing polygons
  function updatePolygonColors (colors) {
    if (!polygonMesh || !polygonGeometry) {
      return;
    }

    const colorAttribute = polygonGeometry.getAttribute("color");
    if (!colorAttribute) {
      return;
    }

    const colorArray = colorAttribute.array;
    const polygonCount = colors.length / 3;

    for (let i = 0; i < polygonCount; i++) {
      const r = colors[i * 3] / 255;
      const g = colors[i * 3 + 1] / 255;
      const b = colors[i * 3 + 2] / 255;

      // Set color for all 4 vertices of the quad
      for (let j = 0; j < 4; j++) {
        const colorIndex = (i * 4 + j) * 3;
        colorArray[colorIndex] = r;
        colorArray[colorIndex + 1] = g;
        colorArray[colorIndex + 2] = b;
      }
    }

    colorAttribute.needsUpdate = true;

    // Force re-render after color update
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // Convert azimuth/elevation to 3D cartesian coordinates (same as 3D view)
  function azElToCartesian(azimuth, elevation, radius = sphereRadius.value) {
    // Convert degrees to radians
    const azRad = (azimuth * Math.PI) / 180;
    const elRad = (elevation * Math.PI) / 180;

    // Convert to cartesian coordinates (same as 3D component)
    const x = radius * Math.cos(elRad) * Math.sin(azRad);
    const y = radius * Math.sin(elRad);
    const z = radius * Math.cos(elRad) * Math.cos(azRad);

    return [x, y, z];
  }

  // Create grid lines (same as 3D view but for overlay)
  function createGridLines() {
    if (!gridGroup || !props.showGrid) return;

    // Clear existing grid lines
    for (const child of gridGroup.children) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    gridGroup.clear();

    const radius = sphereRadius.value;
    const material = new MeshBasicMaterial({
      color: COLORS.grid,
      transparent: true,
      opacity: GRID_SETTINGS.opacity,
    });

    // Elevation circles (30°, 60°, 80°) - same as 3D version
    const elevations = [30, 60, 80];
    for (const el of elevations) {
      const elRad = (el * Math.PI) / 180;
      // Make circles slightly larger than sphere radius
      const expandedRadius = radius * 1.02;
      const circleRadius = expandedRadius * Math.cos(elRad);
      const circleY = expandedRadius * Math.sin(elRad);

      if (circleRadius > 0.01) {
        // Use ring geometry for clean circular lines
        const geometry = new RingGeometry(
          circleRadius - GRID_SETTINGS.lineWidth * 0.003,
          circleRadius + GRID_SETTINGS.lineWidth * 0.003,
          64,
        );
        const circleMaterial = new MeshBasicMaterial({
          color: COLORS.grid,
          transparent: true,
          opacity: GRID_SETTINGS.opacity,
          side: MATERIAL_DEFAULTS.side, // DoubleSide
        });
        const circle = new Mesh(geometry, circleMaterial);
        circle.position.y = circleY;
        circle.rotation.x = Math.PI / 2;
        gridGroup.add(circle);
      }
    }

    // Azimuth lines (every 45°)
    for (let az = 0; az < 360; az += 45) {
      const azRad = (az * Math.PI) / 180;
      const points = [];

      // Create line from horizon to zenith
      for (let el = 0; el <= 90; el += 1) {
        const elRad = (el * Math.PI) / 180;
        const r = radius * Math.cos(elRad);
        const y = radius * Math.sin(elRad);
        const x = r * Math.cos(azRad);
        const z = r * Math.sin(azRad);
        points.push(new Vector3(x, y, z));
      }

      const curve = new CatmullRomCurve3(points);
      const tubeGeometry = new TubeGeometry(
        curve,
        40,
        GRID_SETTINGS.lineWidth * 0.003,
        8,
        false,
      );
      const tubeMaterial = new MeshBasicMaterial({
        color: COLORS.grid,
        transparent: true,
        opacity: GRID_SETTINGS.opacity,
      });
      const tube = new Mesh(tubeGeometry, tubeMaterial);
      gridGroup.add(tube);
    }
  }

  // Create compass direction labels (same as 3D view)
  function createCompassLabels() {
    if (!compassGroup) return;

    // Clear existing compass labels
    for (const child of compassGroup.children) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    compassGroup.clear();

    const offset = SPHERE_DEFAULTS.indicatorOffset * 4;
    const directions = [
      { label: "N", x: 0, z: sphereRadius.value + offset }, // North
      { label: "S", x: 0, z: -(sphereRadius.value + offset) }, // South
      { label: "E", x: sphereRadius.value + offset, z: 0 }, // East
      { label: "W", x: -(sphereRadius.value + offset), z: 0 }, // West
    ];

    for (const dir of directions) {
      // Create text label using canvas texture
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = 128;
      canvas.height = 128;

      // Draw background circle
      context.fillStyle = "rgba(0, 0, 0, 0.7)";
      context.beginPath();
      context.arc(64, 64, 60, 0, 2 * Math.PI);
      context.fill();

      // Draw text
      context.fillStyle = "white";
      context.font = "bold 72px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(dir.label, 64, 64);

      const texture = new CanvasTexture(canvas);
      const spriteMaterial = new SpriteMaterial({
        map: texture,
        transparent: true,
      });

      const sprite = new Sprite(spriteMaterial);
      sprite.scale.set(0.3, 0.3, 1);

      // Position at equator level (y = 0)
      sprite.position.set(dir.x, 0, dir.z);

      compassGroup.add(sprite);
    }
  }

  // Update satellite overlays (same as 3D view)
  function updateSatelliteOverlays() {
    if (!satelliteGroup) return;

    // Clear existing satellites
    for (const sat of satellites) {
      satelliteGroup.remove(sat);
      if (sat.ringMesh) {
        satelliteGroup.remove(sat.ringMesh);
        sat.ringMesh.geometry.dispose();
        sat.ringMesh.material.dispose();
      }
      sat.geometry.dispose();
      sat.material.dispose();
    }
    satellites = [];

    if (!props.showSatellites || !props.satelliteData || props.satelliteData.length === 0) return;

    // Create satellite circles (same as 3D component)
    for (const sat of props.satelliteData) {
      // Only show satellites above elevation cut
      if (sat.el <= props.minElevation) continue;

      // Create ring geometry for clean outline
      const radius = SATELLITE_SETTINGS.ringOuterRadius;
      const ringGeometry = new RingGeometry(
        SATELLITE_SETTINGS.ringInnerRadius,
        radius,
        24,
      );
      const material = new MeshBasicMaterial({
        color: COLORS.hoveredSatellite,
        transparent: true,
        opacity: 0.8,
        side: MATERIAL_DEFAULTS.side,
      });

      // Create invisible full circle for hover detection
      const hoverGeometry = new CircleGeometry(radius, 12);
      const hoverMaterial = new MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        side: 2,
      });

      // Create the visible ring
      const ringMesh = new Mesh(ringGeometry, material);

      // Create invisible hover target
      const hoverMesh = new Mesh(hoverGeometry, hoverMaterial);

      // Store reference to ring for hover effects
      hoverMesh.ringMesh = ringMesh;

      // Mark ring as non-raycastable to avoid interference
      ringMesh.raycast = () => {};

      // Position satellite using 3D coordinates
      const [x, y, z] = azElToCartesian(
        sat.az,
        sat.el,
        sphereRadius.value + SPHERE_DEFAULTS.satelliteOffset,
      );

      // Use exact 3D positioning
      ringMesh.position.set(x, y, z);
      hoverMesh.position.set(x, y, z);

      // Make circles face camera (same as 3D view)
      ringMesh.lookAt(0, 0, 0);
      hoverMesh.lookAt(0, 0, 0);

      // Store satellite data on hover mesh
      hoverMesh.userData = sat;

      satelliteGroup.add(ringMesh);
      satelliteGroup.add(hoverMesh);
      satellites.push(hoverMesh);
    }
  }

  // Expose methods to parent component
  defineExpose({
    updatePolygonColors,
    createPolygonCoordinates,
    updateSatelliteOverlays,
    createGridLines,
    createCompassLabels,
  });

  // Animation loop
  function animate () {
    animationId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  // Get container dimensions with 1:1 aspect ratio
  function getContainerSize () {
    if (!containerRef.value) return { width: props.width, height: props.height };

    const rect = containerRef.value.getBoundingClientRect();
    const containerWidth = rect.width || props.width;
    const containerHeight = rect.height || props.height;

    // Force 1:1 aspect ratio - use the smaller dimension
    const size = Math.min(containerWidth, containerHeight);

    return {
      width: size,
      height: size,
    };
  }

  // Handle window resize
  function handleResize () {
    if (!camera || !renderer) return;

    const { width, height } = props.autoResize
      ? getContainerSize()
      : { width: props.width, height: props.height };

    // Update camera bounds to match 3D view
    const aspect = width / height;
    const frustumSize = 3;
    camera.left = (-frustumSize * aspect) / 2;
    camera.right = (frustumSize * aspect) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  onMounted(() => {
    initThreeJS();
    animate();

    if (props.autoResize && containerRef.value) {
      // Use ResizeObserver for better performance than window resize
      resizeObserver = new ResizeObserver((entries) => {
        if (entries.length > 0) {
          handleResize();
        }
      });
      resizeObserver.observe(containerRef.value);
    } else {
      window.addEventListener("resize", handleResize);
    }

    // Initial resize to fit container
    handleResize();
  });

  onUnmounted(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    if (polygonGeometry) {
      polygonGeometry.dispose();
    }

    if (polygonMaterial) {
      polygonMaterial.dispose();
    }

    // Cleanup grid, satellites, and compass
    if (gridGroup) {
      for (const child of gridGroup.children) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    }

    if (compassGroup) {
      for (const child of compassGroup.children) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    }

    for (const sat of satellites) {
      if (sat.geometry) sat.geometry.dispose();
      if (sat.material) sat.material.dispose();
    }

    if (renderer) {
      renderer.dispose();
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    window.removeEventListener("resize", handleResize);
  });

  watch([() => props.width, () => props.height], () => {
    if (!props.autoResize) {
      handleResize();
    }
  });

  // Watch for changes to satellite data and grid visibility
  watch(() => props.satelliteData, updateSatelliteOverlays, { deep: true });
  watch(() => props.showGrid, createGridLines);
  watch(() => props.showSatellites, updateSatelliteOverlays);
</script>

<style scoped>
.svg-threejs-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
}

.threejs-canvas {
  max-width: 100%;
  max-height: 100%;
  display: block;
  aspect-ratio: 1/1;
}
</style>
