<template>
  <div
    ref="containerRef"
    class="threejs-3d-container"
    :class="{ 'scene-visible': sceneVisible }"
  >
    <canvas ref="canvasRef" class="threejs-canvas" />
    <div class="controls">
      <button @click="resetCamera">Reset View</button>
    </div>

    <!-- Satellite tooltip -->
    <div
      v-if="hoveredSatelliteInfo"
      class="satellite-tooltip"
      :style="{
        left: hoveredSatelliteInfo.screenX + 'px',
        top: hoveredSatelliteInfo.screenY + 'px',
      }"
    >
      <div class="tooltip-content">
        <div class="satellite-name">{{ hoveredSatelliteInfo.name }}</div>
        <div class="satellite-coords">
          <span class="coord-left">El: {{ hoveredSatelliteInfo.el.toFixed(1) }}°</span>
          <span class="coord-right">Az: {{ hoveredSatelliteInfo.az.toFixed(1) }}°</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="js">
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
    ANIMATION_SETTINGS,
    CAMERA_DEFAULTS,
    COLORS,
    COORDINATE_DISPLAY_STYLES,
    COORDINATE_SYSTEMS,
    DEFAULT_DIMENSIONS,
    GESTURE_SETTINGS,
    GRID_SETTINGS,
    INTERACTION_DEFAULTS,
    MATERIAL_DEFAULTS,
    MATH_CONSTANTS,
    PERFORMANCE_SETTINGS,
    SATELLITE_SETTINGS,
    SPHERE_DEFAULTS,
    ZOOM_LIMITS,
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
  });

  const canvasRef = ref(null);
  const containerRef = ref(null);
  const sphereRadius = ref(SPHERE_DEFAULTS.radius);
  const hoveredSatelliteInfo = ref(null);
  const sceneVisible = ref(false);

  let scene, camera, renderer, animationId;
  let sphereMesh = null;
  let sphereGeometry = null;
  let sphereMaterial = null;
  let resizeObserver = null;
  let controls = null;
  let satelliteGroup = null;
  let satellites = [];
  let raycaster = null;
  let hoveredSatellite = null;
  let compassGroup = null;
  let gridGroup = null;
  let coordinateDiv = null;
  let positionIndicator = null;

  // Mouse interaction state
  let isMouseDown = false;
  let mouseX = 0,
      mouseY = 0;
  let targetRotationX = 0,
      targetRotationY = 0;
  let rotationX = 0,
      rotationY = 0;
  let mouse = { x: 0, y: 0 };

  // Emit events to parent
  const emit = defineEmits(["satellite-hover", "satellite-click"]);

  // Vertex shader for 3D sphere
  const vertexShader = `
  attribute vec3 color;
  varying vec3 vColor;

  void main() {
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

  // Fragment shader without lighting for flat appearance
  const fragmentShader = `
  precision mediump float;
  varying vec3 vColor;

  void main() {
    // Use base color without lighting for flat appearance
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

  // Convert lon,lat to 3D Cartesian coordinates
  function lonLatToCartesian(lon, lat, radius = 1) {
    const phi = lat; // latitude
    const theta = lon; // longitude

    const x = -radius * Math.cos(phi) * Math.sin(theta); // Mirror along NS axis
    const y = radius * Math.sin(phi);
    const z = radius * Math.cos(phi) * Math.cos(theta);

    return [x, y, z];
  }

  // Initialize Three.js scene
  function initThreeJS() {
    if (!canvasRef.value) return;

    // Scene setup
    scene = new Scene();
    // No background - use transparent

    // Camera setup - orthographic for uniform view
    const { width, height } = props.autoResize
      ? getContainerSize()
      : { width: props.width, height: props.height };
    const aspect = width / height;
    const frustumSize = CAMERA_DEFAULTS.sphereView.frustumSize;
    camera = new OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      CAMERA_DEFAULTS.orthographic.near,
      CAMERA_DEFAULTS.orthographic.far,
    );
    camera.position.set(
      CAMERA_DEFAULTS.sphereView.position.x,
      CAMERA_DEFAULTS.sphereView.position.y,
      CAMERA_DEFAULTS.sphereView.position.z,
    ); // Position further above sphere looking down
    camera.lookAt(
      CAMERA_DEFAULTS.sphereView.lookAt.x,
      CAMERA_DEFAULTS.sphereView.lookAt.y,
      CAMERA_DEFAULTS.sphereView.lookAt.z,
    ); // Look at center of sphere
    if (CAMERA_DEFAULTS.sphereView.rotateForNorthUp) {
      camera.rotation.z = Math.PI; // Rotate 180 degrees for North up, East left
    }

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
    // renderer.shadowMap.enabled = false;

    // No lighting - use true material colors

    // Create satellite group (will be added to sphere mesh later)
    satelliteGroup = new Group();

    // Create compass group for direction labels
    compassGroup = new Group();

    // Create grid group for elevation and azimuth lines
    gridGroup = new Group();

    // Initialize raycaster for mouse interaction
    raycaster = new Raycaster();

    // Create shader material - unlit for true colors
    sphereMaterial = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: MATERIAL_DEFAULTS.transparent,
      wireframe: MATERIAL_DEFAULTS.wireframe,
      side: MATERIAL_DEFAULTS.side, // DoubleSide - visible from both sides
      lights: false, // Disable lighting
    });

    // Add mouse controls
    setupMouseControls();

    // Create coordinate sprite
    createCoordinateSprite();

    // Create position indicator
    createPositionIndicator();
  }

  // Setup mouse interaction
  function setupMouseControls() {
    if (!canvasRef.value) return;

    canvasRef.value.addEventListener("mousedown", onMouseDown);
    canvasRef.value.addEventListener("mousemove", onMouseMove);
    canvasRef.value.addEventListener("mouseup", onMouseUp);
    canvasRef.value.addEventListener("mouseleave", onMouseLeave);
    canvasRef.value.addEventListener("wheel", onMouseWheel, { passive: false });

    // Touch events for mobile
    canvasRef.value.addEventListener("touchstart", onTouchStart, { passive: false });
    canvasRef.value.addEventListener("touchmove", onTouchMove, { passive: false });
    canvasRef.value.addEventListener("touchend", onTouchEnd, { passive: false });
  }

  function onMouseDown(event) {
    event.preventDefault();
    isMouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;

    // Hide coordinate sprite when dragging starts
    if (coordinateDiv) {
      coordinateDiv.style.display = "none";
    }

    // Hide position indicator when dragging starts
    if (positionIndicator) {
      positionIndicator.visible = false;
    }
  }

  function onMouseMove(event) {
    // Update mouse position for coordinate sprite
    const rect = canvasRef.value.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Only check for satellite hover and update coordinates when not dragging
    if (!isMouseDown) {
      // Check for satellite hover
      checkSatelliteHover();

      // Update coordinate sprite
      updateCoordinateSprite(mouse);
      return;
    }

    event.preventDefault();

    // Handle mouse dragging rotation
    const deltaX = event.clientX - mouseX;
    const deltaY = event.clientY - mouseY;

    targetRotationY += deltaX * (INTERACTION_DEFAULTS.rotationSensitivity / 200);
    targetRotationX -= deltaY * (INTERACTION_DEFAULTS.rotationSensitivity / 200);
    targetRotationX = Math.max(
      -INTERACTION_DEFAULTS.verticalRotationLimit,
      Math.min(INTERACTION_DEFAULTS.verticalRotationLimit, targetRotationX),
    );

    mouseX = event.clientX;
    mouseY = event.clientY;
  }

  function onMouseUp(event) {
    isMouseDown = false;

    // Show coordinate sprite again when mouse dragging ends
    if (coordinateDiv) {
      coordinateDiv.style.display = "block";
    }

    // Show position indicator again when mouse dragging ends
    if (positionIndicator) {
      positionIndicator.visible = true;
    }

    // Check for satellite click
    if (hoveredSatellite) {
      emit("satellite-click", hoveredSatellite.userData);
    }
  }

  function onMouseLeave() {
    // Reset mouse down state when mouse leaves canvas
    isMouseDown = false;

    // Hide coordinate sprite and position indicator when mouse leaves canvas
    if (coordinateDiv) {
      coordinateDiv.style.display = "none";
    }
    if (positionIndicator) {
      positionIndicator.visible = false;
    }
  }

  function onMouseWheel(event) {
    event.preventDefault();
    
    const delta =
      event.deltaY > 0
        ? INTERACTION_DEFAULTS.zoomSensitivity
        : 1 / INTERACTION_DEFAULTS.zoomSensitivity;

    // For orthographic camera, adjust the frustum size instead of position
    const aspect = camera.right / camera.top;
    const frustumSize = camera.top * 2 * delta;

    // Clamp frustum size to reasonable bounds
    const clampedSize = Math.max(
      ZOOM_LIMITS.min,
      Math.min(ZOOM_LIMITS.max, frustumSize),
    );

    camera.left = (-clampedSize * aspect) / 2;
    camera.right = (clampedSize * aspect) / 2;
    camera.top = clampedSize / 2;
    camera.bottom = -clampedSize / 2;
    camera.updateProjectionMatrix();
  }

  // Touch events
  function onTouchStart(event) {
    event.preventDefault();
    
    if (event.touches.length === 1) {
      mouseX = event.touches[0].clientX;
      mouseY = event.touches[0].clientY;
      isMouseDown = true;

      // Hide coordinate sprite when touch dragging starts
      if (coordinateDiv) {
        coordinateDiv.style.display = "none";
      }

      // Hide position indicator when touch dragging starts
      if (positionIndicator) {
        positionIndicator.visible = false;
      }
    }
  }

  function onTouchMove(event) {
    if (event.touches.length === 1) {
      // Update mouse position for coordinate sprite
      const rect = canvasRef.value.getBoundingClientRect();
      mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;

      // Only check for satellite hover and update coordinates when not dragging
      if (!isMouseDown) {
        // Check for satellite hover
        checkSatelliteHover();

        // Update coordinate sprite
        updateCoordinateSprite(mouse);
        return;
      }

      event.preventDefault();

      // Handle touch dragging rotation
      const deltaX = event.touches[0].clientX - mouseX;
      const deltaY = event.touches[0].clientY - mouseY;

      targetRotationY += deltaX * (GESTURE_SETTINGS.singleTouchSensitivity / 200);
      targetRotationX -= deltaY * (GESTURE_SETTINGS.singleTouchSensitivity / 200);
      targetRotationX = Math.max(
        -INTERACTION_DEFAULTS.verticalRotationLimit,
        Math.min(INTERACTION_DEFAULTS.verticalRotationLimit, targetRotationX),
      );

      mouseX = event.touches[0].clientX;
      mouseY = event.touches[0].clientY;
    }
  }

  function onTouchEnd(event) {
    event.preventDefault();
    
    isMouseDown = false;

    // Show coordinate sprite when touch dragging ends
    if (coordinateDiv) {
      coordinateDiv.style.display = "block";
    }

    // Show position indicator when touch dragging ends
    if (positionIndicator) {
      positionIndicator.visible = true;
    }
  }

  // Convert azimuth/elevation to 3D coordinates on sphere
  function azElToCartesian(azimuth, elevation, radius = 1) {
    // Convert degrees to radians
    const azRad = (azimuth * Math.PI) / 180;
    const elRad = (elevation * Math.PI) / 180;

    // Convert to cartesian coordinates
    const x = radius * Math.cos(elRad) * Math.sin(azRad);
    const y = radius * Math.sin(elRad);
    const z = radius * Math.cos(elRad) * Math.cos(azRad);

    return [x, y, z];
  }

  // Convert 3D cartesian coordinates to azimuth/elevation
  function cartesianToAzEl(x, y, z) {
    // Calculate radius (distance from origin)
    const radius = Math.hypot(x, y, z);

    // Calculate elevation (angle from horizontal plane)
    const elevation = Math.asin(y / radius) * (180 / Math.PI);

    // Calculate azimuth (angle from north, measured clockwise)
    let azimuth = Math.atan2(x, z) * (180 / Math.PI);

    // Ensure azimuth is in range [0, 360)
    if (azimuth < 0) {
      azimuth += 360;
    }

    return { azimuth, elevation };
  }

  // Check for satellite hover
  function checkSatelliteHover() {
    if (!raycaster || !camera || satellites.length === 0) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(satellites);

    if (intersects.length > 0) {
      const newHovered = intersects[0].object;
      if (hoveredSatellite !== newHovered) {
        // Reset previous hovered satellite
        if (hoveredSatellite) {
          hoveredSatellite.scale.set(1, 1, 1);
          // Reset ring glow
          if (hoveredSatellite.ringMesh) {
            hoveredSatellite.ringMesh.material.color.setHex(
              COLORS.hoveredSatellite,
            );
            hoveredSatellite.ringMesh.material.opacity = 0.8;
          }
        }

        // Highlight new hovered satellite
        hoveredSatellite = newHovered;
        hoveredSatellite.scale.set(1.5, 1.5, 1.5);
        // Add ring glow
        if (hoveredSatellite.ringMesh) {
          hoveredSatellite.ringMesh.material.color.setHex(0x21_96_f3); // Teal glow (secondary theme color)
          hoveredSatellite.ringMesh.material.opacity = 1; // Full opacity
        }

        // Calculate screen coordinates for tooltip positioning
        const vector = new Vector3();
        vector.setFromMatrixPosition(hoveredSatellite.matrixWorld);
        vector.project(camera);

        const canvas = canvasRef.value;
        const rect = canvas.getBoundingClientRect();
        const screenX = ((vector.x + 1) * rect.width) / 2;
        const screenY = ((-vector.y + 1) * rect.height) / 2;

        // Store hover info for tooltip
        hoveredSatelliteInfo.value = {
          ...hoveredSatellite.userData,
          screenX: screenX,
          screenY: screenY,
        };

        // Emit hover event
        emit("satellite-hover", hoveredSatelliteInfo.value);
      }
    } else if (hoveredSatellite) {
      // Reset hovered satellite
      hoveredSatellite.scale.set(1, 1, 1);
      // Reset ring glow
      if (hoveredSatellite.ringMesh) {
        hoveredSatellite.ringMesh.material.color.setHex(COLORS.hoveredSatellite);
        hoveredSatellite.ringMesh.material.opacity = 0.8;
      }
      hoveredSatellite = null;
      hoveredSatelliteInfo.value = null;
      emit("satellite-hover", null);
    }
  }

  // Create coordinate sprite element
  function createCoordinateSprite() {
    // Create HTML element for coordinates
    coordinateDiv = document.createElement("div");
    coordinateDiv.style.position = COORDINATE_DISPLAY_STYLES.position;
    coordinateDiv.style.background = COORDINATE_DISPLAY_STYLES.background;
    coordinateDiv.style.color = COORDINATE_DISPLAY_STYLES.color;
    coordinateDiv.style.padding = COORDINATE_DISPLAY_STYLES.padding;
    coordinateDiv.style.borderRadius = COORDINATE_DISPLAY_STYLES.borderRadius;
    coordinateDiv.style.fontSize = COORDINATE_DISPLAY_STYLES.fontSize;
    coordinateDiv.style.fontFamily = COORDINATE_DISPLAY_STYLES.fontFamily;
    coordinateDiv.style.pointerEvents = COORDINATE_DISPLAY_STYLES.pointerEvents;
    coordinateDiv.style.display = "none";
    coordinateDiv.style.zIndex = COORDINATE_DISPLAY_STYLES.zIndex;
    coordinateDiv.style.whiteSpace = COORDINATE_DISPLAY_STYLES.whiteSpace;
    coordinateDiv.style.userSelect = COORDINATE_DISPLAY_STYLES.userSelect;

    if (canvasRef.value && canvasRef.value.parentElement) {
      canvasRef.value.parentElement.append(coordinateDiv);
    }
  }

  // Create position indicator "+" sprite
  function createPositionIndicator() {
    // Create canvas for "+" symbol
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 64;
    canvas.height = 64;

    // Clear canvas
    context.clearRect(0, 0, 64, 64);

    // Draw light blue "+" symbol
    context.strokeStyle = "#00BFFF"; // Light blue
    context.lineWidth = 4;
    context.lineCap = "round";

    // Draw horizontal line
    context.beginPath();
    context.moveTo(16, 32);
    context.lineTo(48, 32);
    context.stroke();

    // Draw vertical line
    context.beginPath();
    context.moveTo(32, 16);
    context.lineTo(32, 48);
    context.stroke();

    // Create texture and sprite
    const texture = new CanvasTexture(canvas);
    const spriteMaterial = new SpriteMaterial({
      map: texture,
      transparent: true,
    });

    positionIndicator = new Sprite(spriteMaterial);
    positionIndicator.scale.set(0.1, 0.1, 1); // Adjust size as needed
    positionIndicator.visible = false;
    scene.add(positionIndicator);
  }

  // Update coordinate sprite position and content
  function updateCoordinateSprite(mousePos) {
    if (!coordinateDiv || !sphereMesh || hoveredSatellite) {
      if (coordinateDiv) coordinateDiv.style.display = "none";
      return;
    }

    // Cast ray to sphere
    raycaster.setFromCamera(mousePos, camera);
    const intersects = raycaster.intersectObject(sphereMesh);

    if (intersects.length > 0) {
      const intersection = intersects[0];
      const point = intersection.point.clone();

      // Show position indicator at intersection point
      if (positionIndicator) {
        positionIndicator.position.copy(intersection.point);
        positionIndicator.lookAt(camera.position);
        positionIndicator.visible = true;
      }

      // Transform point from world space to sphere's local space
      // This undoes the rotation applied to the sphere mesh
      sphereMesh.worldToLocal(point);

      // Convert to azimuth/elevation
      const coords = cartesianToAzEl(point.x, point.y, point.z);

      // Update coordinate display
      coordinateDiv.innerHTML = `Az: ${coords.azimuth.toFixed(1)}°<br>El: ${coords.elevation.toFixed(1)}°`;
      coordinateDiv.style.display = "block";

      // Position the sprite near the mouse
      const canvas = canvasRef.value;
      const rect = canvas.getBoundingClientRect();
      coordinateDiv.style.left = `${mousePos.x * (rect.width / 2) + rect.width / 2 + 10}px`;
      coordinateDiv.style.top = `${-mousePos.y * (rect.height / 2) + rect.height / 2 - 10}px`;
    } else {
      coordinateDiv.style.display = "none";
      if (positionIndicator) {
        positionIndicator.visible = false;
      }
    }
  }

  // Update satellite overlays
  function updateSatelliteOverlays(satelliteData, showSatellites = true) {
    if (!satelliteGroup) return;

    // Clear existing satellites
    for (const sat of satellites) {
      satelliteGroup.remove(sat);
      // Also remove the ring mesh if it exists
      if (sat.ringMesh) {
        satelliteGroup.remove(sat.ringMesh);
        sat.ringMesh.geometry.dispose();
        sat.ringMesh.material.dispose();
      }
      sat.geometry.dispose();
      sat.material.dispose();
    }
    satellites = [];
    hoveredSatellite = null;

    if (!showSatellites || !satelliteData || satelliteData.length === 0) return;

    // Create satellite circles
    for (const sat of satelliteData) {
      // Only show satellites above horizon (elevation > 0)
      if (sat.el <= 0) continue;

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
        side: MATERIAL_DEFAULTS.side, // DoubleSide - visible from both sides
      });

      // Create invisible full circle for hover detection
      const hoverGeometry = new CircleGeometry(radius, 12);
      const hoverMaterial = new MeshBasicMaterial({
        transparent: true,
        opacity: 0, // Completely invisible
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

      // Position satellite slightly outside sphere surface
      const [x, y, z] = azElToCartesian(
        sat.az,
        sat.el,
        sphereRadius.value + SPHERE_DEFAULTS.satelliteOffset,
      );

      ringMesh.position.set(x, y, z);
      hoverMesh.position.set(x, y, z);

      // Make circles face camera
      ringMesh.lookAt(0, 0, 0);
      hoverMesh.lookAt(0, 0, 0);

      // Store satellite data on hover mesh (for raycasting)
      hoverMesh.userData = sat;

      satelliteGroup.add(ringMesh);
      satelliteGroup.add(hoverMesh);
      satellites.push(hoverMesh); // Only hover mesh for raycasting
    }
  }

  // Create compass direction labels
  function createGridLines() {
    if (!gridGroup || !scene) {
      console.log("Cannot create grid - missing gridGroup or scene");
      return;
    }

    // Clear existing grid lines
    for (const child of gridGroup.children) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    gridGroup.clear();

    const radius = sphereRadius.value;
    // MeshBasicMaterial is already unlit by default
    const material = new MeshBasicMaterial({
      color: COLORS.grid,
      transparent: true,
      opacity: GRID_SETTINGS.opacity,
    });

    // Elevation circles (30°, 60°, 80°) - skip horizon and pole for now
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

      // Create tube geometry for thicker azimuth lines to match elevation circles
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

  // Grid is already added to sphere mesh above, don't add to scene directly
  }

  function createCompassLabels() {
    if (!compassGroup) return;

    // Clear existing labels
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

  // Create 3D sphere mesh from hemisphere pixel corners
  function createSphereFromCorners(cornersArray) {
    if (!scene || !renderer || !camera) {
      return;
    }

    // Reset scene visibility for fade-in effect
    sceneVisible.value = false;

    // Remove existing sphere mesh
    if (sphereMesh) {
      scene.remove(sphereMesh);
      if (sphereGeometry) {
        sphereGeometry.dispose();
      }
    }

    const pixelCount = cornersArray.length / 8;
    if (pixelCount === 0) return;

    // Create arrays for vertices, colors, and indices
    const vertices = [];
    const colors = [];
    const normals = [];
    const indices = [];

    // Process each pixel (quad) from the corners
    for (let i = 0; i < pixelCount; i++) {
      const cornerOffset = i * 8;

      // Get the 4 corners in lon,lat
      const corners = [];
      for (let j = 0; j < 4; j++) {
        const lon = cornersArray[cornerOffset + j * 2];
        const lat = cornersArray[cornerOffset + j * 2 + 1];
        corners.push([lon, lat]);
      }

      // Convert to 3D coordinates
      const baseIndex = vertices.length / 3;

      for (let j = 0; j < 4; j++) {
        const [lon, lat] = corners[j];
        const [x, y, z] = lonLatToCartesian(lon, lat, sphereRadius.value);

        vertices.push(x, y, z);

        // Normal is just the normalized position for a sphere
        const length = Math.hypot(x, y, z);
        normals.push(x / length, y / length, z / length);

        // Default black color for now - will be updated by updateSphereColors
        colors.push(0, 0, 0);
      }

      // Create two triangles for the quad
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
    sphereGeometry = new BufferGeometry();
    sphereGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(vertices), 3),
    );
    sphereGeometry.setAttribute(
      "color",
      new BufferAttribute(new Float32Array(colors), 3),
    );
    sphereGeometry.setAttribute(
      "normal",
      new BufferAttribute(new Float32Array(normals), 3),
    );
    sphereGeometry.setIndex(indices);

    // Create mesh
    sphereMesh = new Mesh(sphereGeometry, sphereMaterial);

    // Add satellite group to sphere mesh so they rotate together
    if (satelliteGroup) {
      sphereMesh.add(satelliteGroup);
    }

    // Add compass group to sphere mesh so they rotate together
    if (compassGroup) {
      sphereMesh.add(compassGroup);
    }

    // Add grid group to sphere mesh so they rotate together
    if (gridGroup) {
      sphereMesh.add(gridGroup);
    }

    scene.add(sphereMesh);

    // Create compass labels after sphere is created
    createCompassLabels();

    // Create grid lines after sphere is created

    createGridLines();
  }

  // Update colors of existing sphere
  function updateSphereColors(colorBytes) {
    if (!sphereMesh || !sphereGeometry) {
      return;
    }

    const colorAttribute = sphereGeometry.getAttribute("color");
    if (!colorAttribute) {
      return;
    }

    const colorArray = colorAttribute.array;
    const pixelCount = colorBytes.length / 3;

    for (let i = 0; i < pixelCount; i++) {
      const r = colorBytes[i * 3] / 255;
      const g = colorBytes[i * 3 + 1] / 255;
      const b = colorBytes[i * 3 + 2] / 255;

      // Set color for all 4 vertices of the quad
      for (let j = 0; j < 4; j++) {
        const colorIndex = (i * 4 + j) * 3;
        if (colorIndex < colorArray.length) {
          colorArray[colorIndex] = r;
          colorArray[colorIndex + 1] = g;
          colorArray[colorIndex + 2] = b;
        }
      }
    }

    colorAttribute.needsUpdate = true;

    // Show scene with fade-in on first color update
    if (!sceneVisible.value) {
      sceneVisible.value = true;
    }

    // Force re-render after color update
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // Update sphere radius
  function updateSphereRadius() {
    if (sphereGeometry) {
      const positionAttribute = sphereGeometry.getAttribute("position");
      const normalAttribute = sphereGeometry.getAttribute("normal");

      if (positionAttribute && normalAttribute) {
        const positions = positionAttribute.array;
        const normals = normalAttribute.array;

        for (let i = 0; i < positions.length; i += 3) {
          const nx = normals[i];
          const ny = normals[i + 1];
          const nz = normals[i + 2];

          positions[i] = nx * sphereRadius.value;
          positions[i + 1] = ny * sphereRadius.value;
          positions[i + 2] = nz * sphereRadius.value;
        }

        positionAttribute.needsUpdate = true;
      }
    }

    // Update satellite positions to match new sphere radius
    for (const sat of satellites) {
      const userData = sat.userData;
      const [x, y, z] = azElToCartesian(
        userData.az,
        userData.el,
        sphereRadius.value + SPHERE_DEFAULTS.indicatorOffset,
      );
      sat.position.set(x, y, z);
    }

    // Update compass labels when sphere radius changes
    createCompassLabels();
  }

  // Reset camera to default position
  function resetCamera() {
    camera.position.set(
      CAMERA_DEFAULTS.sphereView.position.x,
      CAMERA_DEFAULTS.sphereView.position.y,
      CAMERA_DEFAULTS.sphereView.position.z,
    ); // Position further above sphere looking down
    camera.lookAt(
      CAMERA_DEFAULTS.sphereView.lookAt.x,
      CAMERA_DEFAULTS.sphereView.lookAt.y,
      CAMERA_DEFAULTS.sphereView.lookAt.z,
    ); // Look at center of sphere
    if (CAMERA_DEFAULTS.sphereView.rotateForNorthUp) {
      camera.rotation.z = Math.PI; // Rotate 180 degrees for North up, East left
    }

    // Reset orthographic camera frustum to default size
    const { width, height } = props.autoResize
      ? getContainerSize()
      : { width: props.width, height: props.height };
    const aspect = width / height;
    const frustumSize = CAMERA_DEFAULTS.sphereView.frustumSize;
    camera.left = (-frustumSize * aspect) / 2;
    camera.right = (frustumSize * aspect) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();

    targetRotationX = 0;
    targetRotationY = 0;
    rotationX = 0;
    rotationY = 0;
    if (sphereMesh) {
      sphereMesh.rotation.set(0, 0, 0);
    }
  }

  // Expose methods to parent component
  defineExpose({
    updateSphereColors,
    createSphereFromCorners,
    updateSatelliteOverlays,
    resetCamera,
  });

  // Animation loop
  function animate() {
    animationId = requestAnimationFrame(animate);

    // Smooth rotation interpolation
    rotationX +=
      (targetRotationX - rotationX) * INTERACTION_DEFAULTS.smoothingFactor;
    rotationY +=
      (targetRotationY - rotationY) * INTERACTION_DEFAULTS.smoothingFactor;

    if (sphereMesh) {
      sphereMesh.rotation.x = rotationX;
      sphereMesh.rotation.y = rotationY;
    }

    // Sprites automatically face the camera, no manual rotation needed

    renderer.render(scene, camera);
  }

  // Get container dimensions
  function getContainerSize() {
    if (!containerRef.value) return { width: props.width, height: props.height };

    const rect = containerRef.value.getBoundingClientRect();
    const containerWidth = rect.width || props.width;
    const containerHeight = rect.height || props.height;

    return {
      width: containerWidth,
      height: containerHeight,
    };
  }

  // Handle window resize
  function handleResize() {
    if (!camera || !renderer) return;

    const { width, height } = props.autoResize
      ? getContainerSize()
      : { width: props.width, height: props.height };

    const aspect = width / height;
    const frustumSize = 4;
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
    
    // Reset camera to ensure proper initial zoom level
    setTimeout(() => {
      resetCamera();
    }, 100);
  });

  onUnmounted(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    if (sphereGeometry) {
      sphereGeometry.dispose();
    }

    if (sphereMaterial) {
      sphereMaterial.dispose();
    }

    if (renderer) {
      renderer.dispose();
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    window.removeEventListener("resize", handleResize);

    // Clean up satellites
    if (satellites) {
      for (const sat of satellites) {
        if (sat.geometry) sat.geometry.dispose();
        if (sat.material) sat.material.dispose();
      }
      satellites = [];
    }

    // Clean up compass labels
    if (compassGroup) {
      for (const child of compassGroup.children) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    }

    // Clean up coordinate sprite
    if (coordinateDiv && coordinateDiv.parentElement) {
      coordinateDiv.remove();
    }

    // Clean up position indicator
    if (positionIndicator) {
      if (positionIndicator.geometry) positionIndicator.geometry.dispose();
      if (positionIndicator.material) positionIndicator.material.dispose();
      if (scene) scene.remove(positionIndicator);
    }

    // Clean up grid lines
    if (gridGroup) {
      for (const child of gridGroup.children) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    }

    // Remove mouse event listeners
    if (canvasRef.value) {
      canvasRef.value.removeEventListener("mousedown", onMouseDown);
      canvasRef.value.removeEventListener("mousemove", onMouseMove);
      canvasRef.value.removeEventListener("mouseup", onMouseUp);
      canvasRef.value.removeEventListener("mouseleave", onMouseLeave);
      canvasRef.value.removeEventListener("wheel", onMouseWheel);
      canvasRef.value.removeEventListener("touchstart", onTouchStart);
      canvasRef.value.removeEventListener("touchmove", onTouchMove);
      canvasRef.value.removeEventListener("touchend", onTouchEnd);
    }
  });

  watch([() => props.width, () => props.height], () => {
    if (!props.autoResize) {
      handleResize();
    }
  });
</script>

<style scoped>
.threejs-3d-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  opacity: 0;
  transition: opacity 0.2s ease-in;
}

.threejs-3d-container.scene-visible {
  opacity: 1;
}

.threejs-canvas {
  flex: 1;
  display: block;
  cursor: grab;
}

.threejs-canvas:active {
  cursor: grabbing;
}

.threejs-3d-container {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  touch-action: none;
}

.threejs-canvas {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  touch-action: none;
}

.controls {
  position: absolute;
  top: 10px;
  left: 10px;
  font-size: 12px;
}

.controls button {
  background: #444;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
}

.controls button:hover {
  background: #666;
}

.satellite-tooltip {
  position: absolute;
  z-index: 1000;
  pointer-events: none;
  transform: translate(-50%, -100%);
  margin-top: -10px;
}

.tooltip-content {
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.satellite-name {
  font-weight: bold;
  margin-bottom: 2px;
}

.satellite-coords {
  font-size: 11px;
  opacity: 0.9;
  display: flex;
  justify-content: space-between;
  min-width: 120px;
}

.coord-left {
  text-align: left;
}

.coord-right {
  text-align: right;
}
</style>
