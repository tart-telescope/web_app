/**
 * MediaRecorder Video Recording Service
 *
 * Creates time-lapse videos using MediaRecorder API with offscreen rendering.
 * This approach provides real-time encoding with smaller memory footprint.
 */

import { get_color_bytes_only_simd, get_hemisphere_pixel_corners } from 'gridless'
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  Vector3,
  WebGLRenderer
} from 'three'

export default class MediaRecorderService {
  constructor(settings = {}) {
    this.settings = {
      frameRate: settings.frameRate || 60,
      format: settings.format || 'mp4',
      quality: settings.quality || 1.0,
      width: settings.width || 1080,
      height: settings.height || 1080,
      ...settings
    }

    this.isRecording = false
    this.recorder = null
    this.offscreenRenderer = null
    this.recordingScene = null
    this.recordingCamera = null
    this.sphereMesh = null
    this.sphereGeometry = null
    this.sphereMaterial = null
    this.canvas = null
    this.satelliteGroup = null
    this.compassGroup = null
    this.gridGroup = null
  }

  /**
   * Check MediaRecorder capabilities
   */
  getCapabilities() {
    if (typeof MediaRecorder === 'undefined') {
      return { supported: false, reason: 'MediaRecorder not available' }
    }

    const formats = this.getSupportedFormats()
    if (formats.length === 0) {
      return { supported: false, reason: 'No supported video formats' }
    }

    const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'

    return {
      supported: true,
      hasOffscreenCanvas,
      formats,
      maxFrameRate: 120,
      recommendedFrameRate: 30
    }
  }

  /**
   * Get supported video formats
   */
  getSupportedFormats() {
    if (typeof MediaRecorder === 'undefined') {
      return []
    }

    // Prioritize MP4 formats first
    const formats = [
      'video/mp4;codecs=h264',
      'video/mp4;codecs=avc1.42E01E',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ]

    return formats.filter(format => MediaRecorder.isTypeSupported(format))
  }

  /**
   * Create offscreen renderer with isolated scene
   */
  createOffscreenRenderer() {
    // Always use DOM canvas for MediaStream recording since OffscreenCanvas doesn't support captureStream
    console.log('🎨 Creating DOM canvas for MediaStream recording')
    const canvas = document.createElement('canvas')
    canvas.width = this.settings.width
    canvas.height = this.settings.height

    // Hide the canvas
    if (canvas.style) {
      canvas.style.display = 'none'
      canvas.style.position = 'absolute'
      canvas.style.top = '-9999px'
      canvas.style.left = '-9999px'
    }

    document.body.append(canvas)
    console.log('✅ DOM canvas created for captureStream support')

    console.log('✅ Canvas created:', canvas)
    console.log('🔍 Canvas properties:', {
      width: canvas.width,
      height: canvas.height,
      hasStyle: !!canvas.style,
      constructor: canvas.constructor.name
    })

    // Create WebGL renderer with extensive error handling
    console.log('🎮 Creating WebGL renderer...')
    try {
      this.offscreenRenderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      })
      console.log('✅ WebGL renderer created successfully')
    } catch (error) {
      console.error('❌ WebGL renderer creation failed:', error)
      console.error('❌ Canvas at failure:', canvas)
      throw new Error(`WebGL renderer initialization failed: ${error.message}`)
    }

    console.log('📏 Setting renderer size:', this.settings.width, 'x', this.settings.height)
    try {
      this.offscreenRenderer.setSize(this.settings.width, this.settings.height, false)
      console.log('✅ Renderer size set successfully')
    } catch (error) {
      console.error('❌ Failed to set renderer size:', error)
      throw new Error(`Failed to set renderer size: ${error.message}`)
    }

    try {
      this.offscreenRenderer.setClearColor(0x000000, 1)
      console.log('✅ Clear color set successfully')
    } catch (error) {
      console.error('❌ Failed to set clear color:', error)
      throw new Error(`Failed to set clear color: ${error.message}`)
    }

    // Store canvas reference
    this.canvas = canvas
    console.log('✅ Offscreen renderer setup complete')

    return canvas
  }

  /**
   * Create isolated scene from scene configuration
   */
  createSceneFromConfig(sceneConfig) {
    this.recordingScene = new Scene()

    // Create camera based on configuration from main component
    const cameraConfig = sceneConfig.camera || {}

    if (cameraConfig.type === 'perspective') {
      // Perspective camera (rare case)
      this.recordingCamera = new PerspectiveCamera(
        cameraConfig.fov || 75,
        this.settings.width / this.settings.height,
        cameraConfig.near || 0.1,
        cameraConfig.far || 1000
      )
    } else {
      // Orthographic camera (default - matches main component)
      // Use square aspect ratio like main component
      const frustumSize = 3

      this.recordingCamera = new OrthographicCamera(
        -frustumSize / 2,   // left
        frustumSize / 2,    // right
        frustumSize / 2,    // top
        -frustumSize / 2,   // bottom
        0.1,
        1000
      )
    }

    // Set camera position - fixed optimal position
    this.recordingCamera.position.set(0, 3.5, 0)

    // Set camera to look at center (like main component)
    this.recordingCamera.lookAt(0, 0, 0)

    // Apply the critical rotation for North up, East left orientation (like main component)
    this.recordingCamera.rotation.z = Math.PI // Rotate 180 degrees

    console.log('📷 Recording camera created:', {
      type: cameraConfig.type || 'orthographic',
      position: this.recordingCamera.position,
      rotation: this.recordingCamera.rotation
    })

    // Create sphere geometry for recording
    if (sceneConfig.nside) {
      this.sphereCache = get_hemisphere_pixel_corners(sceneConfig.nside)
    }

    // Create shader material for sphere
    this.createSphereMaterial()

    // Create overlay groups
    this.satelliteGroup = new Group()
    this.compassGroup = new Group()
    this.gridGroup = new Group()

    return this.recordingScene
  }

  /**
   * Create sphere material with shaders
   */
  createSphereMaterial() {
    const vertexShader = `
      attribute vec3 color;
      varying vec3 vColor;

      void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `

    const fragmentShader = `
      precision mediump float;
      varying vec3 vColor;

      void main() {
        gl_FragColor = vec4(vColor, 1.0);
      }
    `

    this.sphereMaterial = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: false,
      wireframe: false,
      side: DoubleSide,
      lights: false
    })
  }

  /**
   * Convert lon,lat to 3D Cartesian coordinates
   */
  lonLatToCartesian(lon, lat, radius = 1) {
    const phi = lat // latitude
    const theta = lon // longitude

    const x = -radius * Math.cos(phi) * Math.sin(theta) // Mirror along NS axis
    const y = radius * Math.sin(phi)
    const z = radius * Math.cos(phi) * Math.cos(theta)

    return [x, y, z]
  }

  /**
   * Update sphere colors with visibility data
   */
  updateSphereWithVisData(visData, nside) {
    if (!this.recordingScene || !this.sphereCache) {
      return
    }

    // Prepare payload for WASM processing
    const payload = JSON.stringify({
      info: { info: visData.info || {} },
      ant_pos: visData.antennas || [],
      gains: visData.gain || [],
      data: [[{
        data: visData.data || [],
        timestamp: visData.timestamp
      }, []]]
    })

    try {
      // Get color data from WASM
      const colorBytes = get_color_bytes_only_simd(payload, nside)

      // Update sphere colors
      this.updateSphereColors(colorBytes)
    } catch (error) {
      console.warn('Failed to update sphere colors:', error)
    }
  }

  /**
   * Update colors of existing sphere
   */
  updateSphereColors(colorBytes) {
    if (!this.sphereMesh || !this.sphereGeometry) {
      return
    }

    const colorAttribute = this.sphereGeometry.getAttribute('color')
    if (!colorAttribute) {
      return
    }

    const colorArray = colorAttribute.array
    const pixelCount = colorBytes.length / 3

    for (let i = 0; i < pixelCount; i++) {
      const r = colorBytes[i * 3] / 255
      const g = colorBytes[i * 3 + 1] / 255
      const b = colorBytes[i * 3 + 2] / 255

      // Set color for all 4 vertices of the quad
      for (let j = 0; j < 4; j++) {
        const colorIndex = (i * 4 + j) * 3
        if (colorIndex < colorArray.length) {
          colorArray[colorIndex] = r
          colorArray[colorIndex + 1] = g
          colorArray[colorIndex + 2] = b
        }
      }
    }

    colorAttribute.needsUpdate = true

    // Force re-render after color update
    if (this.offscreenRenderer && this.recordingScene && this.recordingCamera) {
      this.offscreenRenderer.render(this.recordingScene, this.recordingCamera)
    }
  }

  /**
   * Create compass labels (N, S, E, W)
   */
  createCompassLabels() {
    if (!this.compassGroup) return

    // Clear existing labels
    for (const child of this.compassGroup.children) {
      if (child.geometry) child.geometry.dispose()
      if (child.material) child.material.dispose()
    }
    this.compassGroup.clear()

    const offset = 0.2 // Offset from sphere edge
    const directions = [
      { label: 'N', x: 0, z: 1 },
      { label: 'E', x: 1, z: 0 },
      { label: 'S', x: 0, z: -1 },
      { label: 'W', x: -1, z: 0 }
    ]

    for (const dir of directions) {
      // Create canvas for text
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      canvas.width = 128
      canvas.height = 128

      context.fillStyle = 'rgba(255, 255, 255, 0.9)'
      context.font = 'bold 64px Arial'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(dir.label, 64, 64)

      // Create sprite
      const texture = new CanvasTexture(canvas)
      const spriteMaterial = new SpriteMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.001
      })
      const sprite = new Sprite(spriteMaterial)
      sprite.scale.set(0.4, 0.4, 1)
      sprite.position.set(dir.x * (1 + offset), 0.1, dir.z * (1 + offset))

      this.compassGroup.add(sprite)
    }
  }

  /**
   * Create grid lines for elevation and azimuth
   */
  createGridLines() {
    if (!this.gridGroup || !this.recordingScene) return

    // Clear existing grid lines
    for (const child of this.gridGroup.children) {
      if (child.geometry) child.geometry.dispose()
      if (child.material) child.material.dispose()
    }
    this.gridGroup.clear()

    const radius = 1.0
    // Use same grid settings as main component
    const material = new MeshBasicMaterial({
      color: 0xffffff, // White like main component
      transparent: true,
      opacity: 0.6, // Match GRID_SETTINGS.opacity
      side: DoubleSide
    })

    // Elevation circles (30°, 60°, 80°) - match main component exactly
    const elevations = [30, 60, 80]
    for (const el of elevations) {
      const elRad = (el * Math.PI) / 180
      // Make circles slightly larger than sphere radius like main component
      const expandedRadius = radius * 1.02
      const circleRadius = expandedRadius * Math.cos(elRad)
      const circleY = expandedRadius * Math.sin(elRad)

      if (circleRadius > 0.01) {
        // Use ring geometry for clean circular lines like main component
        const geometry = new RingGeometry(
          circleRadius - 0.003, // Match GRID_SETTINGS.lineWidth * 0.003
          circleRadius + 0.003,
          64
        )
        const circleMaterial = new MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.6,
          side: DoubleSide
        })
        const circle = new Mesh(geometry, circleMaterial)
        circle.position.y = circleY
        circle.rotation.x = Math.PI / 2
        this.gridGroup.add(circle)
      }
    }

    // Azimuth lines (every 45°) - match main component exactly
    for (let az = 0; az < 360; az += 45) {
      const azRad = (az * Math.PI) / 180
      const points = []

      // Create line from horizon to zenith like main component
      for (let el = 0; el <= 90; el += 1) {
        const elRad = (el * Math.PI) / 180
        const r = radius * Math.cos(elRad)
        const y = radius * Math.sin(elRad)
        const x = r * Math.cos(azRad)
        const z = r * Math.sin(azRad)
        points.push(new Vector3(x, y, z))
      }

      // Create tube geometry for thicker azimuth lines to match elevation circles
      const curve = new CatmullRomCurve3(points)
      const tubeGeometry = new TubeGeometry(
        curve,
        40,
        0.003, // Match GRID_SETTINGS.lineWidth * 0.003
        8,
        false
      )
      const tubeMaterial = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6
      })
      const tube = new Mesh(tubeGeometry, tubeMaterial)
      this.gridGroup.add(tube)
    }

    console.log('🌐 Grid creation complete. GridGroup children:', this.gridGroup.children.length)
  }

  /**
   * Create composite canvas with 3D render + 2D text overlays
   */
  createCompositeFrame(webglCanvas, telescopeInfo, timestamp) {
    // Create a 2D canvas for compositing
    const compositeCanvas = document.createElement('canvas')
    compositeCanvas.width = webglCanvas.width
    compositeCanvas.height = webglCanvas.height
    
    const ctx = compositeCanvas.getContext('2d')
    const width = compositeCanvas.width
    const height = compositeCanvas.height
    
    // Draw the WebGL canvas onto the 2D canvas
    ctx.drawImage(webglCanvas, 0, 0, width, height)
    
    // Add text overlays
    const fontSize = Math.max(16, width / 40)
    ctx.font = `bold ${fontSize}px Arial`
    
    // Telescope info (bottom left)
    console.log('📡 Telescope info object:', telescopeInfo)
    
    let telescopeName = 'TART'
    let location = ''
    
    // Handle nested info structure: { info: { info: actualInfo } }
    let actualInfo = telescopeInfo
    if (telescopeInfo && telescopeInfo.info) {
      actualInfo = telescopeInfo.info
    }
    
    if (actualInfo && typeof actualInfo === 'object') {
      // Extract telescope name
      telescopeName = actualInfo.name || 
                    actualInfo.telescope || 
                    actualInfo.telescope_name ||
                    actualInfo.site_name ||
                    'TART'
      
      // Extract location - handle various possible formats
      if (actualInfo.location && typeof actualInfo.location === 'string') {
        location = actualInfo.location
      } else if (actualInfo.site && typeof actualInfo.site === 'string') {
        location = actualInfo.site
      } else if (actualInfo.observatory && typeof actualInfo.observatory === 'string') {
        location = actualInfo.observatory
      } else if (actualInfo.address && typeof actualInfo.address === 'string') {
        location = actualInfo.address
      }
      
      // Clean up location text - remove common artifacts
      if (location) {
        location = location.replace(/\s+/g, ' ').trim()
        // Remove "undefined" or "[object Object]" if they appear
        if (location.includes('undefined') || location.includes('[object Object]')) {
          location = ''
        }
      }
    }
    
    // Ensure strings, not objects
    if (typeof telescopeName !== 'string') {
      telescopeName = 'TART'
    }
    if (typeof location !== 'string') {
      location = ''
    }
    
    const infoText = location ? `${telescopeName} - ${location}` : telescopeName
    console.log('📡 Final info text:', infoText)
    
    // Background for telescope info
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    const infoMetrics = ctx.measureText(infoText)
    const infoPadding = 8
    const infoWidth = infoMetrics.width + infoPadding * 2
    const infoHeight = fontSize + infoPadding * 2
    ctx.fillRect(10, height - infoHeight - 10, infoWidth, infoHeight)
    
    // Text for telescope info
    ctx.fillStyle = 'white'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(infoText, 10 + infoPadding, height - 10 - infoPadding)
    
    // Timestamp (top right)
    if (timestamp) {
      const timestampText = new Date(timestamp).toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
      
      // Background for timestamp
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
      const timestampMetrics = ctx.measureText(timestampText)
      const timestampPadding = 8
      const timestampWidth = timestampMetrics.width + timestampPadding * 2
      const timestampHeight = fontSize + timestampPadding * 2
      ctx.fillRect(width - timestampWidth - 10, 10, timestampWidth, timestampHeight)
      
      // Text for timestamp
      ctx.fillStyle = 'white'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillText(timestampText, width - 10 - timestampPadding, 10 + timestampPadding)
    }
    
    return compositeCanvas
  }

  /**
   * Update satellite overlays
   */
  updateSatelliteOverlays(satelliteData, showSatellites = true) {
    if (!this.satelliteGroup) {
      console.warn('❌ No satelliteGroup available')
      return
    }

    console.log('🛰️ Updating satellite overlays:', satelliteData?.length || 0, 'satellites')

    // Clear existing satellites
    this.satelliteGroup.clear()

    if (!showSatellites || !satelliteData || satelliteData.length === 0) {
      console.log('❌ No satellite data or satellites disabled')
      return
    }

    for (const satellite of satelliteData) {
      if (satellite.el < 0) continue // Skip satellites below horizon

      // Use exact same azElToCartesian conversion as main component
      const azRad = (satellite.az * Math.PI) / 180
      const elRad = (satellite.el * Math.PI) / 180

      // Match main component's satellite positioning with exact offset
      const sphereRadius = 1.0
      const satelliteOffset = 0.005 // SPHERE_DEFAULTS.satelliteOffset
      const radius = sphereRadius + satelliteOffset

      // Match main component's coordinate system exactly
      const x = radius * Math.cos(elRad) * Math.sin(azRad)
      const y = radius * Math.sin(elRad) 
      const z = radius * Math.cos(elRad) * Math.cos(azRad)

      // Create ring geometry like main component (not circle)
      const ringGeometry = new RingGeometry(
        0.035,  // SATELLITE_SETTINGS.ringInnerRadius
        0.045,  // SATELLITE_SETTINGS.ringOuterRadius
        24
      )
      const material = new MeshBasicMaterial({
        color: 0xff0000, // Red satellites like main component (COLORS.hoveredSatellite)
        transparent: true,
        opacity: 0.8,
        side: DoubleSide
      })
      const satelliteMesh = new Mesh(ringGeometry, material)
      satelliteMesh.position.set(x, y, z)
      satelliteMesh.lookAt(0, 0, 0)

      this.satelliteGroup.add(satelliteMesh)
      console.log(`✅ Added satellite ${satellite.name} at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`)
    }

    console.log(`🛰️ Total satellites added: ${this.satelliteGroup.children.length}`)
  }

  /**
   * Create sphere mesh from corners data
   */
  createSphereFromCorners(cornersData) {
    if (!this.recordingScene || !this.sphereMaterial) {
      return
    }

    // Remove existing sphere mesh
    if (this.sphereMesh) {
      this.recordingScene.remove(this.sphereMesh)
      if (this.sphereGeometry) {
        this.sphereGeometry.dispose()
      }
    }

    const pixelCount = cornersData.length / 8
    if (pixelCount === 0) {return}

    // Create arrays for vertices, colors, and indices
    const vertices = []
    const colors = []
    const normals = []
    const indices = []

    // Process each pixel (quad) from the corners
    for (let i = 0; i < pixelCount; i++) {
      const cornerOffset = i * 8

      // Get the 4 corners in lon,lat
      const corners = []
      for (let j = 0; j < 4; j++) {
        const lon = cornersData[cornerOffset + j * 2]
        const lat = cornersData[cornerOffset + j * 2 + 1]
        corners.push([lon, lat])
      }

      // Convert to 3D coordinates
      const baseIndex = vertices.length / 3

      for (let j = 0; j < 4; j++) {
        const [lon, lat] = corners[j]
        const [x, y, z] = this.lonLatToCartesian(lon, lat, 1)

        vertices.push(x, y, z)

        // Normal is just the normalized position for a sphere
        const length = Math.hypot(x, y, z)
        normals.push(x / length, y / length, z / length)

        // Default black color for now - will be updated by updateSphereColors
        colors.push(0, 0, 0)
      }

      // Create two triangles for the quad
      indices.push(
        baseIndex,
        baseIndex + 1,
        baseIndex + 2, // first triangle
        baseIndex + 2,
        baseIndex + 3,
        baseIndex // second triangle
      )
    }

    // Create buffer geometry
    this.sphereGeometry = new BufferGeometry()
    this.sphereGeometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(vertices), 3)
    )
    this.sphereGeometry.setAttribute(
      'color',
      new BufferAttribute(new Float32Array(colors), 3)
    )
    this.sphereGeometry.setAttribute(
      'normal',
      new BufferAttribute(new Float32Array(normals), 3)
    )
    this.sphereGeometry.setIndex(indices)

    // Create mesh
    this.sphereMesh = new Mesh(this.sphereGeometry, this.sphereMaterial)
    this.sphereMesh.name = 'sphereMesh'

    // Add overlay groups to sphere mesh so they rotate together
    if (this.satelliteGroup) {
      this.sphereMesh.add(this.satelliteGroup)
    }
    if (this.compassGroup) {
      this.sphereMesh.add(this.compassGroup)
    }
    if (this.gridGroup) {
      this.sphereMesh.add(this.gridGroup)
    }

    this.recordingScene.add(this.sphereMesh)

    // Create overlays after sphere is added
    console.log('🧭 Creating compass labels...')
    this.createCompassLabels()
    console.log('📊 Creating grid lines...')
    this.createGridLines()
    console.log('✅ Overlays created - compass:', this.compassGroup.children.length, 'grid:', this.gridGroup.children.length)
    
    // Debug: Check if grid is actually attached to sphere
    console.log('🔍 Sphere mesh children:', this.sphereMesh.children.length)
    console.log('🔍 GridGroup attached to sphere:', this.sphereMesh.children.includes(this.gridGroup))
  }

  /**
   * Main recording method
   */
  async recordHistory(sceneConfig, historySnapshot, options, onProgress) {
    if (this.isRecording) {
      throw new Error('Recording already in progress')
    }

    // Validate inputs
    if (!Array.isArray(historySnapshot) || historySnapshot.length === 0) {
      throw new Error('History snapshot is empty or invalid')
    }

    const capabilities = this.getCapabilities()
    if (!capabilities.supported) {
      throw new Error(`MediaRecorder not supported: ${capabilities.reason}`)
    }

    try {
      this.isRecording = true

      // Create offscreen rendering setup
      const webglCanvas = this.createOffscreenRenderer()
      this.createSceneFromConfig(sceneConfig)

      // Create sphere geometry if needed
      if (this.sphereCache) {
        this.createSphereFromCorners(this.sphereCache)
      }

      // Create composite canvas for text overlays
      const compositeCanvas = document.createElement('canvas')
      compositeCanvas.width = this.settings.width
      compositeCanvas.height = this.settings.height

      // Set up MediaRecorder with composite canvas
      console.log('🎬 Using composite canvas for recording')

      const stream = compositeCanvas.captureStream(this.settings.frameRate)
      console.log('✅ Stream created:', stream)

      // Choose best available format (prioritizing MP4)
      const supportedFormats = this.getSupportedFormats()
      let mimeType = supportedFormats[0] || 'video/webm'

      console.log('📹 Available formats:', supportedFormats)
      console.log('🎬 Using format:', mimeType)
      
      if (mimeType.includes('mp4')) {
        console.log('✅ Recording as MP4')
      } else {
        console.log('⚠️ MP4 not supported, using:', mimeType)
      }

      this.recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: this.calculateBitrate()
      })

      // Set up recording data collection
      const chunks = []
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      // Handle recording completion
      const recordingPromise = new Promise((resolve, reject) => {
        this.recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType })
          this.downloadVideo(blob, `tart-timelapse-${Date.now()}.${this.getFileExtension(mimeType)}`)
          resolve(blob)
        }

        this.recorder.addEventListener('error', (event) => {
          reject(new Error(`Recording failed: ${event.error}`))
        })
      })

      // Start recording
      this.recorder.start(1000) // Collect data every second

      // Store canvas references for cleanup
      this.canvas = compositeCanvas
      this.webglCanvas = webglCanvas

      // Render each frame from history snapshot
      const totalFrames = historySnapshot.length
      const frameDuration = 1000 / this.settings.frameRate // milliseconds per frame

      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        const visData = historySnapshot[frameIndex]

        // Update scene with current vis data
        this.updateSphereWithVisData(visData, sceneConfig.nside)

        // Update satellite overlays if data exists
        if (visData.satellites) {
          console.log('🛰️ Updating satellites for frame', frameIndex, ':', visData.satellites.length, 'satellites')
          this.updateSatelliteOverlays(visData.satellites, true)
          console.log('✅ Satellites updated, group has', this.satelliteGroup.children.length, 'children')
        }

        // Render 3D scene to WebGL canvas
        this.offscreenRenderer.render(this.recordingScene, this.recordingCamera)
        
        // Create composite frame with text overlays
        const frame = this.createCompositeFrame(webglCanvas, sceneConfig.info || {}, visData.timestamp)
        
        // Draw composite frame to recording canvas
        const ctx = compositeCanvas.getContext('2d')
        ctx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height)
        ctx.drawImage(frame, 0, 0)

        // Report progress
        if (onProgress) {
          onProgress({
            percentage: (frameIndex + 1) / totalFrames,
            frameIndex: frameIndex + 1,
            totalFrames: totalFrames,
            currentTimestamp: visData.timestamp,
            estimatedTimeRemaining: ((totalFrames - frameIndex - 1) * frameDuration) / 1000
          })
        }

        // Wait for next frame timing
        await new Promise(resolve => setTimeout(resolve, frameDuration))

        // Check if recording was stopped
        if (!this.isRecording) {
          break
        }
      }

      // Stop recording
      this.recorder.stop()

      // Wait for recording to complete
      await recordingPromise

    } catch (error) {
      console.error('Recording failed:', error)
      throw error
    } finally {
      this.cleanup()
    }
  }

  /**
   * Stop recording
   */
  stop() {
    this.isRecording = false
    if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.stop()
    }
  }

  /**
   * Calculate appropriate bitrate based on resolution and quality
   */
  calculateBitrate() {
    const pixelCount = this.settings.width * this.settings.height
    // Very high bitrate for scientific quality - approximately 20-25 bits per pixel
    const baseBitrate = Math.floor(pixelCount * 20) // 20 bits per pixel for scientific quality
    return Math.floor(baseBitrate * this.settings.quality)
  }

  /**
   * Get file extension for mime type
   */
  getFileExtension(mimeType) {
    if (mimeType.includes('webm')) {return 'webm'}
    if (mimeType.includes('mp4')) {return 'mp4'}
    return 'video'
  }

  /**
   * Download the recorded video
   */
  downloadVideo(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.append(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.isRecording = false

    if (this.recorder) {
      this.recorder = null
    }

    if (this.offscreenRenderer) {
      this.offscreenRenderer.dispose()
      this.offscreenRenderer = null
    }

    if (this.sphereGeometry) {
      this.sphereGeometry.dispose()
      this.sphereGeometry = null
    }

    if (this.sphereMaterial) {
      this.sphereMaterial.dispose()
      this.sphereMaterial = null
    }

    // Clean up canvas if it's a DOM element
    if (this.canvas) {
      // Only remove DOM canvas elements, not OffscreenCanvas
      if (this.canvas.parentNode && typeof this.canvas.remove === 'function') {
        this.canvas.remove()
      }
      this.canvas = null
    }

    if (this.recordingScene) {
      // Dispose of scene resources
      this.recordingScene.traverse((child) => {
        if (child.geometry) {
          child.geometry.dispose()
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            for (const material of child.material) {
              material.dispose()
            }
          } else {
            child.material.dispose()
          }
        }
      })
      this.recordingScene = null
    }

    // Clean up overlay groups
    if (this.satelliteGroup) {
      for (const child of this.satelliteGroup.children) {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      }
      this.satelliteGroup = null
    }

    if (this.compassGroup) {
      for (const child of this.compassGroup.children) {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      }
      this.compassGroup = null
    }

    // Clean up grid lines
    if (this.gridGroup) {
      for (const child of this.gridGroup.children) {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      }
    }



    this.recordingCamera = null
    this.sphereCache = null
    this.sphereMesh = null
  }
}
