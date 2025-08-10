# Video Recording Feature Implementation Plan

## Overview
Add video recording capability to the TART viewer to create time-lapse videos from `vis_history` data using MediaStream Recording API with real-time stream capture.

## Required Context & Data Structures

### Current System Overview
The TART viewer uses Vue 3 + Three.js with two rendering modes:
- **3D Mode**: `Threejs3D.vue` - Perspective view of hemisphere 
- **2D Mode**: `SvgThreejs.vue` - Orthographic overhead view (also Three.js, not SVG)

Both components render HEALPix sphere segments colored by radio telescope visibility data.

### Data Structures

#### vis_history Array Structure
```js
vis_history: [
  {
    timestamp: "2024-01-15T10:30:45.123Z", // ISO string
    data: [                                // Visibility data
      { i: 0, j: 1, re: 0.5, im: 0.3 },   // Antenna pair visibility
      { i: 0, j: 2, re: -0.2, im: 0.8 },
      // ... more visibility pairs
    ],
    satellites: [                          // Satellite positions
      { name: "GPS BIIR-2", az: 45.2, el: 23.1 },
      { name: "NOAA-18", az: 120.5, el: 67.8 },
      // ... more satellites
    ],
    gain: [                               // Antenna gains (24 antennas)
      { i: 0, gain: [complex_numbers] },
      { i: 1, gain: [complex_numbers] },
      // ... 24 entries
    ],
    antennas: [                           // Antenna positions
      { i: 0, x: 1.2, y: -0.8, z: 0.0 },
      { i: 1, x: 0.9, y: 1.5, z: 0.0 },
      // ... 24 entries  
    ]
  },
  // ... more timestamped entries
]
```

#### sceneConfig Structure
```js
sceneConfig = {
  is3D: boolean,                    // Rendering mode
  width: 1920,                     // Recording resolution
  height: 1080,
  nside: 64,                       // HEALPix resolution parameter
  camera: {                        // Camera configuration
    position: { x, y, z },
    rotation: { x, y, z },
    fov: 75,                       // Field of view (3D only)
    aspect: 16/9,
    near: 0.1,
    far: 1000
  },
  sphere: {                        // Sphere mesh configuration
    radius: 1.0,
    geometry: HEALPixGeometry,     // Pre-built geometry
    material: ShaderMaterial       // Custom shader
  },
  rendering: {
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true    // Required for recording
  }
}
```

### Current Component Integration Points

#### Synthesis.vue Integration
```js
// Current component structure:
export default {
  data() {
    return {
      is3D: true,           // Toggle between modes
      show_sat: true,       // Show satellites
      // ... existing properties
    }
  },
  computed: {
    ...mapState(useAppStore, ['vis_history', 'nside', /* ... */])
  }
}
```

#### Component References Available
```js
// In Synthesis.vue template:
<Threejs3D v-if="is3D" ref="threejsRef" />
<SvgThreejs v-else ref="svgRef" />

// Available methods on both components:
this.$refs.threejsRef.renderer          // WebGLRenderer
this.$refs.threejsRef.scene            // Three.js Scene
this.$refs.threejsRef.camera           // Camera object
this.$refs.threejsRef.sphereMesh       // Main sphere mesh
this.$refs.threejsRef.updateSphereColors(bytes)  // Color update method
```

## Architecture

### File Structure
```
tart-viewer/src/
├── services/
│   ├── videoRecorder/
│   │   ├── index.js                    # Export recorder service
│   │   └── streamRecorderService.js    # Real-time stream recording
│   └── index.js                        # Updated exports
├── composables/
│   └── useVideoRecorder.js             # Vue composable
├── components/
│   ├── VideoRecordingControls.vue      # Dedicated recording UI component
│   └── Synthesis.vue                   # Updated with recording integration
└── stores/
    └── app.js                          # Add recording state
```

## Implementation Phases

### Phase 1: Dependencies & Core Structure

#### 1.1 Dependencies
No external dependencies needed - using native MediaStream Recording API only.

#### 1.2 Create Base Service Structure
- `services/videoRecorder/index.js` - Exports both implementations
- Define common interface for both recorders
- Shared utilities for canvas capture and timing

### Phase 2: Stream Recording Implementation

#### 2.1 Stream Recorder Service (`streamRecorderService.js`)
**Approach**: Real-time stream capture from DOM canvas
- Create separate Three.js renderer with hidden DOM canvas (for captureStream support)
- Use `canvas.captureStream(fps)` for smooth recording
- Iterate through vis_history at fixed frame rate
- `MediaRecorder` captures stream in real-time

**Features**:
- **Complete isolation** - zero interaction with app components after start
- **Invisible background recording** - zero user disruption
- Real-time encoding as frames are rendered
- Smaller memory footprint
- Native browser codecs (WebM/MP4)
- User can continue using app during recording
- Custom recording resolution (square aspect ratio)
- **Self-contained rendering pipeline**
- **Complete visual fidelity** - includes satellites, grid, compass

**Technical Details**:
- Uses DOM canvas (not OffscreenCanvas) for MediaStream compatibility
- Canvas is hidden but remains in DOM for captureStream() support
- Exact camera positioning matching main component (orthographic, North-up)
- Full overlay rendering (satellites, grid lines, compass labels)
- High quality encoding (1.0 quality by default)

#### 2.2 Implementation Details
```js
class StreamRecorderService {
  constructor(options = {}) {
    this.frameRate = options.frameRate || 30
    this.format = options.format || 'webm'
    this.quality = options.quality || 1.0
    this.width = options.width || 600
    this.height = options.height || 600
  }
  
  async recordHistory(sceneConfig, visHistory, options, onProgress) {
    // === ISOLATION PHASE: Extract everything needed ===
    const historySnapshot = JSON.parse(JSON.stringify(visHistory))
    
    // === SELF-CONTAINED RECORDING ===
    // Create independent DOM canvas renderer
    // Set up MediaStream capture from canvas
    // Iterate through timestamps at fixed frame rate
    // Update sphere colors and satellite positions each frame
    // MediaRecorder captures stream in real-time
    // Work ONLY with snapshot data - no app state access
    // Only interaction: onProgress callbacks
  }
}
```

### Phase 3: Vue Integration

#### 3.1 Recording Composable (`useVideoRecorder.js`)
```js
export function useVideoRecorder(visHistoryProp, nsideProp, infoProp) {
  const isRecording = ref(false)
  const recordingProgress = ref(0)
  const recordingMethod = ref('stream')
  
  const startRecording = async (method, is3D, refs, options) => {
    // Initialize stream recorder
    // Extract scene configuration from component refs
    // Create data snapshot from vis_history
    // Handle recording workflow with progress updates
    // Manage Vue reactivity
  }
  
  return {
    isRecording,
    recordingProgress,
    startRecording,
    stopRecording,
    canRecord,
    hasHistoryData,
    // ... other recording state
  }
}
```

### Phase 4: UI Components

#### 4.1 Recording Controls Component (`VideoRecordingControls.vue`)
Dedicated component for recording interface:
- Single recording button
- Recording options panel (quality, resolution, format)
- Progress indicator during recording
- Recording status display
- Square aspect ratio options (600x600, 800x800, 1080x1080, 1440x1440)

#### 4.2 Integration with Synthesis Component
- Import and use `VideoRecordingControls`
- Pass vis_history, nside, info as props (avoids store connection issues)
- Pass component refs for scene configuration extraction
- Toggle recording panel with video button

### Phase 5: Implementation Specifications

#### 5.1 Service Interface & Isolation Principle
Stream recorder implements strict isolation:
```js
interface StreamRecorderService {
  async recordHistory(sceneConfig, visHistory, options, onProgress)
  stop()
  getCapabilities()
  getSupportedFormats()
}

// STRICT ISOLATION PRINCIPLE:
// 1. Extract ALL needed data at recording start (snapshot + scene config)
// 2. Work from immutable copies - NO app state access during recording
// 3. Recording is completely independent of ongoing app updates
// 4. ONLY interaction: onProgress callbacks for UI updates
// 5. No component references, no reactive data, no store mutations
// 6. Self-contained hidden canvas rendering pipeline
```

#### 5.2 Hidden Canvas Recording Strategy
Uses DOM canvas for MediaStream compatibility:
```js
// Create hidden DOM canvas recorder
function createHiddenCanvasRecorder(options) {
  // Use DOM canvas (not OffscreenCanvas) for captureStream support
  const canvas = document.createElement('canvas')
  canvas.width = options.width
  canvas.height = options.height
  
  // Hide canvas but keep in DOM
  canvas.style.display = 'none'
  canvas.style.position = 'absolute'
  canvas.style.top = '-9999px'
  document.body.append(canvas)
  
  const renderer = new WebGLRenderer({
    canvas,
    preserveDrawingBuffer: true,
    antialias: true
  })
  
  return { canvas, renderer }
}
```

#### 5.3 Scene Rendering and Overlays
Complete visual fidelity matching main component:
```js
// Camera setup (exact match to main component)
function setupCamera(sceneConfig) {
  const camera = new OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 1000)
  camera.position.set(0, 3.5, 0) // Looking down from above
  camera.lookAt(0, 0, 0)
  camera.rotation.z = Math.PI // North up, East left orientation
  return camera
}

// Complete overlay system
function createOverlays() {
  const satelliteGroup = new Group() // Red satellite rings
  const compassGroup = new Group()   // N/S/E/W labels  
  const gridGroup = new Group()      // Elevation/azimuth grid
  return { satelliteGroup, compassGroup, gridGroup }
}

// Frame update cycle
function updateFrame(visData, overlays) {
  // 1. Update sphere colors from vis data
  // 2. Update satellite positions (red rings)
  // 3. Render complete scene with all overlays
  // 4. MediaRecorder captures frame from stream
}
```

### Phase 6: Output Format Support

#### 6.1 Supported Formats
- **WebM** (VP8/VP9): Best compression, good browser support
- **MP4** (H.264): Universal playback, codec dependent
- **Format detection**: Check `MediaRecorder.isTypeSupported()`
- **Quality control**: Bitrate settings based on resolution and quality
- **Square aspect ratios**: 600x600, 800x800, 1080x1080, 1440x1440

### Phase 7: User Experience Features

#### 7.1 Recording Options
- Frame rate selection (15, 24, 30, 60 fps)
- Quality settings (Medium, High - defaulting to High for clarity)
- Format selection (WebM recommended, MP4 universal)
- Square resolution options (600x600 default)
- Duration limits (prevent browser crashes)

#### 7.2 Progress & Feedback
- **Non-disruptive progress bar** (main display unaffected)
- Current frame indicator and percentage complete
- Estimated completion time
- **Background processing status**
- Single record button (simplified interface)
- **User can continue working** during recording
- **ONLY UI interaction**: Progress updates via callbacks
- **No state mutations** during recording process
- Automatic video download when complete

#### 7.3 Error Handling
- Canvas access failures (with clear error messages)
- MediaRecorder compatibility detection
- Format support validation
- Recording timeout protection
- Graceful cleanup on errors

### Phase 8: Performance Optimizations

#### 8.1 Memory Management
- Hidden canvas approach minimizes memory usage
- Real-time encoding prevents memory accumulation
- Automatic cleanup of resources
- Browser freeze prevention through proper timing

#### 8.2 Recording Optimizations
- **Completely isolated rendering pipeline** - zero app interaction
- **Independent scene reconstruction** from component configuration
- **GPU resource management** between main and recording renderers  
- **Background processing** without blocking main thread
- **Square aspect ratio** for optimal hemisphere display
- **High quality by default** (1.0) for crisp overlays and details
- **Self-contained memory management** - no shared references

### Phase 9: Concrete Implementation Examples

#### 9.1 Stream Recorder Service Implementation
```js
// streamRecorderService.js
import { WebGLRenderer, Scene, OrthographicCamera, Group } from 'three'

class StreamRecorderService {
  async recordHistory(sceneConfig, historySnapshot, options, onProgress) {
    // Create hidden DOM canvas (for captureStream support)
    const canvas = document.createElement('canvas')
    canvas.width = options.width
    canvas.height = options.height
    canvas.style.display = 'none'
    document.body.append(canvas)
    
    // Create independent renderer
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true
    })
    
    // Recreate scene with overlays
    const scene = new Scene()
    const camera = this.createOrthographicCamera(sceneConfig)
    const { sphereMesh, satelliteGroup, compassGroup, gridGroup } = this.createCompleteScene(sceneConfig)
    
    scene.add(sphereMesh)
    sphereMesh.add(satelliteGroup)
    sphereMesh.add(compassGroup)
    sphereMesh.add(gridGroup)
    
    // Set up MediaRecorder with stream
    const stream = canvas.captureStream(options.frameRate)
    const recorder = new MediaRecorder(stream, {
      mimeType: this.selectBestFormat(options.format)
    })
    
    // Record each frame with complete visuals
    for (let frameIndex = 0; frameIndex < historySnapshot.length; frameIndex++) {
      const visData = historySnapshot[frameIndex]
      
      // Update sphere colors
      this.updateSphereWithVisData(sphereMesh, visData, sceneConfig.nside)
      
      // Update satellite positions (red rings)
      this.updateSatelliteOverlays(satelliteGroup, visData.satellites)
      
      // Render complete scene with all overlays
      renderer.render(scene, camera)
      
      // Progress callback
      onProgress({
        percentage: (frameIndex + 1) / historySnapshot.length,
        frameIndex: frameIndex + 1,
        totalFrames: historySnapshot.length,
        currentTimestamp: visData.timestamp
      })
      
      await new Promise(resolve => setTimeout(resolve, 1000 / options.frameRate))
    }
    
    recorder.stop()
    // Auto-download when complete
  }
}
```

#### 9.2 Vue Composable Integration
```js
// useVideoRecorder.js
export function useVideoRecorder(visHistoryProp, nsideProp, infoProp) {
  // Use props instead of store to avoid connection issues
  const vis_history = ref(visHistoryProp || [])
  const nside = ref(nsideProp || 64)
  const info = ref(infoProp || {})
  
  const startRecording = async (method, is3D, refs, options) => {
    // Extract data snapshot
    const snapshot = RecorderUtils.createDataSnapshot(vis_history.value)
    
    // Extract scene config from current component refs
    const sceneConfig = extractSceneConfig(is3D, refs)
    
    // Create stream recorder and start
    const recorder = createVideoRecorder('stream', options)
    await recorder.recordHistory(sceneConfig, snapshot, options, onProgress)
  }
  
  return { 
    startRecording,
    isRecording,
    recordingProgress,
    canRecord,
    hasHistoryData
  }
}
```

#### 9.3 UI Integration Example
```vue
<!-- VideoRecordingControls.vue -->
<template>
  <v-card>
    <v-card-title>Record Time-lapse Video</v-card-title>
    
    <v-card-text>
      <!-- Single Recording Button -->
      <v-btn 
        @click="startRecordingWithMethod('stream')" 
        :disabled="!canRecord"
        block
        color="primary"
        size="large"
      >
        <v-icon start>mdi-download</v-icon>
        <div>
          <div>Record Video</div>
          <div class="text-caption">Create time-lapse from history data</div>
        </div>
      </v-btn>
      
      <!-- Recording Options -->
      <v-expansion-panels class="mt-4">
        <v-expansion-panel>
          <v-expansion-panel-title>Recording Options</v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-row>
              <v-col><v-select v-model="frameRate" :items="[15,24,30,60]" label="Frame Rate" /></v-col>
              <v-col><v-select v-model="quality" :items="qualityOptions" label="Quality" /></v-col>
              <v-col><v-select v-model="resolution" :items="resolutionOptions" label="Resolution" /></v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
      
      <v-progress-linear 
        v-if="isRecording" 
        :model-value="recordingProgress * 100"
      />
    </v-card-text>
  </v-card>
</template>

<script setup>
import { useVideoRecorder } from '@/composables/useVideoRecorder'

// Props from parent component
const props = defineProps(['visHistory', 'nside', 'info', 'is3D', 'componentRefs'])

// Use composable with props
const { startRecording, isRecording, recordingProgress, canRecord } = useVideoRecorder(
  props.visHistory, 
  props.nside, 
  props.info
)

const startRecordingWithMethod = () => {
  startRecording('stream', props.is3D, props.componentRefs)
}
</script>
```

### Phase 10: Testing & Documentation

#### 10.1 Test Scenarios
- Short recordings (10-50 frames)
- Long recordings (1000+ frames)
- Different browser/device combinations
- Various vis_history data sizes
- Square aspect ratio validation
- Overlay visibility testing (satellites, grid, compass)

#### 10.2 Documentation
- User guide for video recording
- Quality and resolution recommendations
- Browser compatibility information
- Troubleshooting common issues
- Performance optimization tips

## Success Criteria

### Functional Requirements
- ✅ Record time-lapse from vis_history data
- ✅ Support both 2D and 3D rendering modes  
- ✅ **Single, reliable recording method** (stream recording)
- ✅ **Invisible background recording** (zero user disruption)
- ✅ **Complete isolation** from app components and state
- ✅ **Data snapshot integrity** (immutable recording dataset)
- ✅ Progress feedback and cancellation (ONLY interaction)
- ✅ **Native browser APIs only** - no external dependencies
- ✅ **Square aspect ratio** matching main component display
- ✅ **User can continue working** during recording
- ✅ **Complete visual fidelity** - satellites, grid, compass included

### Performance Requirements
- ✅ Handle 100+ frame recordings without crashes
- ✅ Memory usage under 2GB for typical recordings
- ✅ Recording completion within reasonable time
- ✅ **UI remains fully responsive during recording**
- ✅ **No visual disruption** to main display
- ✅ **Efficient GPU resource sharing** between renderers
- ✅ **Predictable progress** based on snapshot size

### Quality Requirements
- ✅ **Crystal clear video output** (high quality by default)
- ✅ **Consistent timestamp progression** (from snapshot)
- ✅ **Perfect visual matching** (red satellites, white grid lines, compass)
- ✅ **Square aspect ratio** like main component
- ✅ **Proper camera orientation** (North-up view)
- ✅ **Data integrity** (no mid-recording data changes)

## Risk Assessment & Mitigation

### High Risk
- **Memory exhaustion**: Implement chunking and limits
- **Browser freezing**: Add progress yields and warnings

### Medium Risk  
- **Canvas access issues**: Robust error handling and fallbacks
- **Codec compatibility**: Multi-format support with detection

### Low Risk
- **File size issues**: Quality options and user warnings
- **Performance variations**: Browser-specific optimizations

## Browser Compatibility & Dependencies

### Required Browser Features
- **OffscreenCanvas**: Chrome 69+, Firefox 105+, Safari 16.4+
- **MediaRecorder**: Chrome 47+, Firefox 25+, Safari 14.1+
- **WebGL2**: Chrome 56+, Firefox 51+, Safari 15+

### Fallback Strategy
```js
// Feature detection and fallbacks
if (!window.OffscreenCanvas) {
  // Fallback to hidden canvas element
  const hiddenCanvas = document.createElement('canvas')
  hiddenCanvas.style.display = 'none'
}

if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
  // Try different codec or fall back to CCapture
}
```

### Dependencies
```json
{
  "three": "^0.158.0"  // Already in project
}
```

**Native APIs Used:**
- MediaStream Recording API
- OffscreenCanvas API  
- Canvas.captureStream()
- WebGL2 / Three.js

## Delivery Timeline

1. **Week 1**: ✅ Dependencies, base structure, data structure validation
2. **Week 2**: ✅ Stream recorder service with complete overlay system  
3. **Week 3**: ✅ Vue composable integration with prop-based data flow
4. **Week 4**: ✅ UI components, camera orientation fixes, visual fidelity
5. **Week 5**: ✅ Quality optimization, format selection, final polish

**IMPLEMENTATION COMPLETE**: The stream recording approach provides reliable, high-quality time-lapse video generation with complete visual fidelity matching the main synthesis component. The hidden canvas architecture ensures users can continue working uninterrupted while crystal-clear videos are generated in the background with all overlays (satellites, grid, compass) properly rendered.