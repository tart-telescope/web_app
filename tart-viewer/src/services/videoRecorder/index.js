/**
 * Video Recording Services
 *
 * Provides two different approaches for creating time-lapse videos from vis_history data:
 * 1. MediaRecorder API - Modern, efficient, real-time encoding
 * 2. CCapture.js - Frame-by-frame capture with more control
 */

import StreamRecorderService from './streamRecorderService.js'

/**
 * Common interface that both recording services implement
 */
export const VideoRecorderInterface = {
  // Core methods
  async recordHistory(/* sceneConfig, historySnapshot, options, onProgress */) {
    throw new Error('recordHistory must be implemented')
  },

  stop() {
    throw new Error('stop must be implemented')
  },

  // Capability detection
  getCapabilities() {
    throw new Error('getCapabilities must be implemented')
  },

  getSupportedFormats() {
    throw new Error('getSupportedFormats must be implemented')
  }
}

/**
 * Fixed recording settings - optimized for best quality
 */
export const RECORDING_SETTINGS = {
  frameRate: 60,
  quality: 1.0,
  format: 'mp4',
  width: 1080,
  height: 1080,
  maxFrames: 3600, // 60fps * 60 seconds max
  maxDuration: 60_000, // 60 seconds max
}

/**
 * Utility functions shared by both services
 */
export const RecorderUtils = {
  /**
   * Create deep copy snapshot of vis_history for recording
   * Ensures data integrity during recording process
   */
  createDataSnapshot(visHistory) {
    if (!Array.isArray(visHistory) || visHistory.length === 0) {
      throw new Error('vis_history must be a non-empty array')
    }

    // Deep copy to create immutable snapshot
    // Using JSON parse/stringify as it's widely supported and works well for our data structure
    // eslint-disable-next-line unicorn/prefer-structured-clone
    const snapshot = JSON.parse(JSON.stringify(visHistory))

    // Sort by timestamp to ensure proper chronological order
    snapshot.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    return snapshot
  },

  /**
   * Extract scene configuration from components for offscreen rendering
   */
  extractSceneConfig(is3D, refs) {
    const activeRef = is3D ? refs.threejsRef : refs.svgRef

    if (!activeRef) {
      throw new Error('No active renderer reference available')
    }

    return {
      is3D,
      width: 1080, // Default recording resolution
      height: 1080,
      camera: activeRef.camera ? {
        position: activeRef.camera.position.clone(),
        rotation: activeRef.camera.rotation.clone(),
        fov: activeRef.camera.fov,
        aspect: 1/1, // Force widescreen for recording
        near: activeRef.camera.near,
        far: activeRef.camera.far
      } : null,
      scene: activeRef.scene,
      sphereGeometry: activeRef.sphereGeometry,
      sphereMaterial: activeRef.sphereMaterial
    }
  },

  /**
   * Get canvas from either 2D or 3D component (legacy - for fallback)
   */
  getCurrentCanvas(is3D, refs) {
    if (is3D && refs.threejsRef?.renderer) {
      return refs.threejsRef.renderer.domElement
    } else if (refs.svgRef?.renderer) {
      return refs.svgRef.renderer.domElement
    }
    throw new Error('No canvas renderer available')
  },

  /**
   * Wait for rendering to complete before capturing frame
   */
  async waitForRenderCompletion() {
    // Wait for Vue reactivity
    await new Promise(resolve => {
      if (typeof window !== 'undefined' && window.requestAnimationFrame) {
        // Wait for next animation frame
        requestAnimationFrame(() => {
          // Double RAF for safety - ensures WebGL render is complete
          requestAnimationFrame(resolve)
        })
      } else {
        // Fallback for non-browser environments
        setTimeout(resolve, 16) // ~60fps
      }
    })
  },

  /**
   * Get fixed recording settings
   */
  getRecordingSettings() {
    return { ...RECORDING_SETTINGS }
  },

  /**
   * Calculate estimated file size and duration from snapshot
   */
  estimateRecording(dataSnapshot) {
    const frameCount = Math.min(dataSnapshot.length, RECORDING_SETTINGS.maxFrames)
    const duration = frameCount / RECORDING_SETTINGS.frameRate

    // Rough file size estimation (very approximate)
    const bytesPerFrame = 100_000 * RECORDING_SETTINGS.quality // ~100KB per frame at full quality
    const estimatedSize = frameCount * bytesPerFrame

    return {
      frameCount,
      duration,
      estimatedSize,
      estimatedSizeMB: Math.round(estimatedSize / 1024 / 1024),
      firstTimestamp: dataSnapshot[0]?.timestamp,
      lastTimestamp: dataSnapshot[frameCount - 1]?.timestamp
    }
  },

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) {return '0 Byte'}
    const i = Number.parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10)
    return Math.round(bytes / (1024 ** i) * 100) / 100 + ' ' + sizes[i]
  },

  /**
   * Format duration for display
   */
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  },

  /**
   * Validate vis_history data before recording
   */
  validateVisHistory(visHistory) {
    if (!Array.isArray(visHistory)) {
      throw new TypeError('vis_history must be an array')
    }

    if (visHistory.length === 0) {
      throw new Error('vis_history is empty - no frames to record')
    }

    // Check that all entries have required properties
    const invalidEntries = visHistory.filter(entry =>
      !entry.timestamp || !entry.data
    )

    if (invalidEntries.length > 0) {
      throw new Error(`${invalidEntries.length} entries missing required timestamp or data properties`)
    }

    return true
  }
}

/**
 * Factory function to create appropriate recorder
 */
export function createVideoRecorder() {
  const settings = RecorderUtils.getRecordingSettings()
  return new StreamRecorderService(settings)
}

/**
 * Detect best available recording method
 */
export function detectBestRecordingMethod() {
  // Check MediaRecorder support
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
    // Prefer stream recording for better performance
    const webmSupported = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    const mp4Supported = MediaRecorder.isTypeSupported('video/mp4;codecs=h264')

    if (webmSupported || mp4Supported) {
      return 'stream'
    }
  }

  // Fall back to stream recording
  return 'stream'
}


/**
 * Export recording services
 */
export { default as StreamRecorderService } from './streamRecorderService.js'
export default {
  StreamRecorderService,
  createVideoRecorder,
  detectBestRecordingMethod,
  RecorderUtils,
  RECORDING_SETTINGS
}
