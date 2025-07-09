<template>
  <div ref="containerRef" class="svg-threejs-container">
    <canvas ref="canvasRef" class="threejs-canvas" />
  </div>
</template>

<script setup>
  import {
    BufferAttribute,
    BufferGeometry,
    LinearSRGBColorSpace,
    LinearToneMapping,
    Mesh,
    MeshBasicMaterial,
    OrthographicCamera,
    Scene,
    ShaderMaterial,
    WebGLRenderer,
  } from "three";
  import { onMounted, onUnmounted, ref, watch } from "vue";
  import {
    CAMERA_DEFAULTS,
    COLORS,
    DEFAULT_DIMENSIONS,
    MATERIAL_DEFAULTS,
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
  let scene, camera, renderer, animationId;
  let polygonMesh = null;
  let polygonGeometry = null;
  let polygonMaterial = null;
  let resizeObserver = null;

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

    // Camera setup - simplified view
    camera = new OrthographicCamera(
      -1,
      1,
      1,
      -1,
      CAMERA_DEFAULTS.orthographic.near,
      CAMERA_DEFAULTS.orthographic.far,
    );
    camera.position.set(
      CAMERA_DEFAULTS.orthographic.position.x,
      CAMERA_DEFAULTS.orthographic.position.y,
      CAMERA_DEFAULTS.orthographic.position.z,
    );
    camera.lookAt(
      CAMERA_DEFAULTS.orthographic.lookAt.x,
      CAMERA_DEFAULTS.orthographic.lookAt.y,
      CAMERA_DEFAULTS.orthographic.lookAt.z,
    );

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

    // Create mesh
    polygonMesh = new Mesh(polygonGeometry, polygonMaterial);
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

  // Expose methods to parent component
  defineExpose({
    updatePolygonColors,
    createPolygonCoordinates,
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

    camera.left = -1;
    camera.right = 1;
    camera.top = 1;
    camera.bottom = -1;
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
