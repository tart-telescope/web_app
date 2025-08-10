/**
 * Vue Composable for Video Recording
 * 
 * Provides reactive state management and methods for recording time-lapse videos
 * from vis_history data using either MediaRecorder or CCapture services.
 */

import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'
import { createVideoRecorder, detectBestRecordingMethod, RecorderUtils, RECORDING_SETTINGS } from '@/services/videoRecorder'
import { useAppStore } from '@/stores/app'

export function useVideoRecorder(visHistoryProp, nsideProp, infoProp) {
  // Access store for zoom range
  const store = useAppStore()
  
  // Use provided data as reactive refs
  const vis_history = ref(visHistoryProp || [])
  const nside = ref(nsideProp || 64)
  const info = ref(infoProp || {})
  
  // Watch for prop changes and update refs
  watch(() => visHistoryProp, (newValue) => {
    vis_history.value = newValue || []
    console.log('🔄 vis_history updated from props:', vis_history.value.length, 'frames')
  }, { immediate: true })
  
  watch(() => nsideProp, (newValue) => {
    nside.value = newValue || 64
  }, { immediate: true })
  
  watch(() => infoProp, (newValue) => {
    info.value = newValue || {}
  }, { immediate: true })
  
  // Debug logging
  console.log('🎬 Video recorder initialized with props')
  console.log('📈 vis_history length:', vis_history.value?.length || 0)
  console.log('🔢 nside:', nside.value)
  console.log('ℹ️ info:', info.value)
  
  // Recording state
  const isRecording = ref(false)
  const recordingProgress = ref(0)
  const recordingMethod = ref('stream')
  
  // Progress tracking
  const currentFrame = ref(0)
  const totalFrames = ref(0)
  const currentTimestamp = ref(null)
  const estimatedTimeRemaining = ref(0)
  const recordingError = ref(null)
  
  // Active recorder instance
  let activeRecorder = null
  
  // Computed properties
  // Filter vis_history to only include visible/zoomed range
  const filteredVisHistory = computed(() => {
    try {
      const history = vis_history.value
      if (!history || !Array.isArray(history) || history.length === 0) {
        return []
      }

      // If no zoom range, return full history
      const zoomRange = store.currentZoomRange
      if (!zoomRange || !zoomRange.min || !zoomRange.max) {
        console.log('📹 Recording full history:', history.length, 'frames')
        return history
      }

      // Filter by zoom range (convert zoom range from seconds to milliseconds)
      const minTime = zoomRange.min * 1000
      const maxTime = zoomRange.max * 1000
      
      const filtered = history.filter(item => {
        const timestamp = new Date(item.timestamp).getTime()
        return timestamp >= minTime && timestamp <= maxTime
      })

      console.log('📹 Recording filtered history:', {
        totalFrames: history.length,
        filteredFrames: filtered.length,
        zoomRange: { min: zoomRange.min, max: zoomRange.max },
        timeRange: { minTime, maxTime }
      })

      return filtered
    } catch (error) {
      console.warn('❌ Error filtering vis_history:', error)
      return vis_history.value || []
    }
  })

  const hasHistoryData = computed(() => {
    try {
      const history = filteredVisHistory.value
      console.log('🔍 Checking hasHistoryData:', {
        historyValue: history,
        isArray: Array.isArray(history),
        length: history?.length || 0
      })
      return history && Array.isArray(history) && history.length > 0
    } catch (error) {
      console.warn('❌ Error accessing vis_history:', error)
      return false
    }
  })
  
  const recordingStats = computed(() => {
    try {
      if (!hasHistoryData.value) {
        return null
      }
      
      const snapshot = filteredVisHistory.value
      if (!snapshot || !Array.isArray(snapshot)) {
        return null
      }
      
      return RecorderUtils.estimateRecording(snapshot)
    } catch (error) {
      console.warn('Error calculating recording stats:', error)
      return null
    }
  })
  
  const canRecord = computed(() => {
    try {
      const history = filteredVisHistory.value
      return hasHistoryData.value && !isRecording.value && history && Array.isArray(history) && history.length >= 10
    } catch (error) {
      console.warn('Error checking canRecord:', error)
      return false
    }
  })
  
  /**
   * Extract scene configuration from current component state
   */
  function extractSceneConfig(is3D, refs) {
    try {
      console.log('🔧 Extracting scene config:', { is3D, refs })
      const activeRef = is3D ? refs.threejsRef : refs.svgRef
      
      if (!activeRef) {
        console.error('❌ No active renderer reference:', { is3D, refs, activeRef })
        throw new Error('No active renderer reference available')
      }
      
      console.log('📷 Active ref found:', activeRef)
      
      // Extract current camera configuration
      const camera = activeRef.camera
      console.log('📷 Camera object:', camera)
      console.log('📷 Camera type:', camera?.type)
      
      let cameraConfig = null
      if (camera) {
        // Check if it's OrthographicCamera or PerspectiveCamera
        const isOrthographic = camera.isOrthographicCamera || camera.type === 'OrthographicCamera'
        
        if (isOrthographic) {
          // Use orthographic camera settings (like main component)
          cameraConfig = {
            type: 'orthographic',
            position: { 
              x: camera.position?.x || 0, 
              y: camera.position?.y || 3.5, 
              z: camera.position?.z || 0 
            },
            rotation: { 
              x: camera.rotation?.x || 0, 
              y: camera.rotation?.y || 0, 
              z: camera.rotation?.z || 0 
            },
            left: camera.left || -3,
            right: camera.right || 3, 
            top: camera.top || 3,
            bottom: camera.bottom || -3,
            near: camera.near || 0.1,
            far: camera.far || 1000,
            frustumSize: 3 // Match main component
          }
        } else {
          // Perspective camera fallback
          cameraConfig = {
            type: 'perspective',
            position: { 
              x: camera.position?.x || 0, 
              y: camera.position?.y || 0, 
              z: camera.position?.z || 5 
            },
            rotation: { 
              x: camera.rotation?.x || 0, 
              y: camera.rotation?.y || 0, 
              z: camera.rotation?.z || 0 
            },
            fov: camera.fov || 75,
            aspect: RECORDING_SETTINGS.width / RECORDING_SETTINGS.height,
            near: camera.near || 0.1,
            far: camera.far || 1000
          }
        }
      } else {
        // Default to orthographic camera like main component
        cameraConfig = {
          type: 'orthographic',
          position: { x: 0, y: 3.5, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          left: -3,
          right: 3,
          top: 3,
          bottom: -3,
          near: 0.1,
          far: 1000,
          frustumSize: 3
        }
      }
      
      console.log('📷 Camera config:', cameraConfig)
      
      const sceneConfig = {
        is3D,
        nside: nside.value || 64,
        width: RECORDING_SETTINGS.width,
        height: RECORDING_SETTINGS.height,
        camera: cameraConfig,
        info: info.value || {},
        rendering: {
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true
        }
      }
      
      console.log('✅ Scene config extracted:', sceneConfig)
      return sceneConfig
    } catch (error) {
      console.error('❌ Failed to extract scene config:', error)
      throw new Error(`Cannot extract scene configuration: ${error.message}`)
    }
  }
  
  /**
   * Progress callback for recording updates
   */
  function onRecordingProgress(progressData) {
    recordingProgress.value = progressData.percentage
    currentFrame.value = progressData.frameIndex || 0
    totalFrames.value = progressData.totalFrames || 0
    currentTimestamp.value = progressData.currentTimestamp || null
    estimatedTimeRemaining.value = progressData.estimatedTimeRemaining || 0
  }
  
  /**
   * Start recording with fixed optimal settings
   */
  async function startRecording(is3D, refs) {
    console.log('🚀 startRecording called:', { is3D, refs })
    
    if (isRecording.value) {
      throw new Error('Recording already in progress')
    }
    
    if (!hasHistoryData.value || !filteredVisHistory.value) {
      console.error('❌ No history data available:', { hasHistoryData: hasHistoryData.value, filteredHistoryLength: filteredVisHistory.value?.length })
      throw new Error('No history data available for recording')
    }
    
    try {
      console.log('📊 Starting recording setup...')
      
      // Reset state
      recordingError.value = null
      recordingProgress.value = 0
      currentFrame.value = 0
      totalFrames.value = 0
      currentTimestamp.value = null
      estimatedTimeRemaining.value = 0
      
      // Use fixed recording settings
      const recordingSettings = RECORDING_SETTINGS
      console.log('⚙️ Recording settings:', recordingSettings)
      
      // Validate filtered vis_history
      if (!filteredVisHistory.value || !Array.isArray(filteredVisHistory.value)) {
        console.error('❌ filtered vis_history validation failed:', filteredVisHistory.value)
        throw new Error('filtered vis_history is not available or not an array')
      }
      RecorderUtils.validateVisHistory(filteredVisHistory.value)
      console.log('✅ filtered vis_history validated')
      
      // Create data snapshot from filtered history
      console.log('📸 Creating data snapshot...')
      const historySnapshot = RecorderUtils.createDataSnapshot(filteredVisHistory.value)
      totalFrames.value = historySnapshot.length
      console.log('✅ Data snapshot created:', historySnapshot.length, 'frames')
      
      // Extract scene configuration
      console.log('🎬 Extracting scene configuration...')
      const sceneConfig = extractSceneConfig(is3D, refs)
      console.log('✅ Scene config extracted successfully')
      
      // Create recorder
      console.log('🎯 Creating recorder')
      activeRecorder = createVideoRecorder()
      recordingMethod.value = 'stream'
      isRecording.value = true
      console.log('✅ Recorder created successfully')
      
      console.log('🎬 Starting recording:', {
        frames: historySnapshot.length,
        duration: `${recordingStats.value?.duration}s`,
        size: `~${recordingStats.value?.estimatedSizeMB}MB`
      })
      
      // Start recording
      console.log('▶️ Starting actual recording...')
      await activeRecorder.recordHistory(
        sceneConfig, 
        historySnapshot, 
        recordingSettings, 
        onRecordingProgress
      )
      
      console.log('✅ Recording completed successfully')
      
    } catch (error) {
      console.error('❌ Recording failed at step:', error)
      console.error('❌ Error stack:', error.stack)
      recordingError.value = error.message
      throw error
    } finally {
      // Cleanup
      console.log('🧹 Cleaning up recording state')
      isRecording.value = false
      activeRecorder = null
      recordingProgress.value = 0
    }
  }
  
  /**
   * Stop current recording
   */
  function stopRecording() {
    if (activeRecorder && isRecording.value) {
      activeRecorder.stop()
      isRecording.value = false
      activeRecorder = null
      console.log('Recording stopped by user')
    }
  }
  
  /**
   * Get available recording methods with their capabilities
   */
  function getAvailableMethods() {
    const methods = []
    
    try {
      const streamRecorder = createVideoRecorder()
      const capabilities = streamRecorder.getCapabilities()
      methods.push({
        id: 'stream',
        name: 'Video Recording',
        description: `${RECORDING_SETTINGS.frameRate}fps • ${RECORDING_SETTINGS.width}x${RECORDING_SETTINGS.height} • ${RECORDING_SETTINGS.format.toUpperCase()}`,
        supported: capabilities.supported,
        formats: capabilities.formats || [],
        icon: 'mdi-download'
      })
    } catch (error) {
      methods.push({
        id: 'stream',
        name: 'Video Recording',
        description: 'Recording not supported',
        supported: false,
        error: error.message,
        icon: 'mdi-download'
      })
    }
    
    return methods
  }
  
  /**
   * Get recommended recording method
   */
  function getRecommendedMethod() {
    return detectBestRecordingMethod()
  }
  
  /**
   * Get current recording settings
   */
  function getRecordingSettings() {
    return { ...RECORDING_SETTINGS }
  }
  
  /**
   * Get formatted progress text
   */
  const progressText = computed(() => {
    try {
      if (!isRecording.value) {return ''}
      
      const percentage = Math.round(recordingProgress.value * 100)
      const timeRemaining = estimatedTimeRemaining.value
      const timeText = timeRemaining > 0 ? ` (~${timeRemaining.toFixed(1)}s remaining)` : ''
      
      return `Recording: ${currentFrame.value}/${totalFrames.value} frames (${percentage}%)${timeText}`
    } catch (error) {
      console.warn('Error generating progress text:', error)
      return 'Recording...'
    }
  })
  
  /**
   * Get formatted file size estimation
   */
  const estimatedSizeText = computed(() => {
    try {
      if (!recordingStats.value) {
        return ''
      }
      return RecorderUtils.formatFileSize(recordingStats.value.estimatedSize)
    } catch (error) {
      console.warn('Error formatting estimated size:', error)
      return ''
    }
  })
  
  /**
   * Get formatted duration estimation
   */
  const estimatedDurationText = computed(() => {
    try {
      if (!recordingStats.value) {
        return ''
      }
      return RecorderUtils.formatDuration(recordingStats.value.duration)
    } catch (error) {
      console.warn('Error formatting estimated duration:', error)
      return ''
    }
  })

  /**
   * Update totalFrames when filtered vis_history changes
   */
  watch(filteredVisHistory, (newHistory) => {
    totalFrames.value = newHistory && Array.isArray(newHistory) ? newHistory.length : 0;
  }, { immediate: true })
  
  // Cleanup on unmount
  onUnmounted(() => {
    if (isRecording.value && activeRecorder) {
      stopRecording()
    }
  })
  
  return {
    // State
    isRecording,
    recordingProgress,
    recordingMethod,
    recordingError,
    currentFrame,
    totalFrames,
    currentTimestamp,
    estimatedTimeRemaining,
    
    // Computed
    hasHistoryData,
    canRecord,
    recordingStats,
    progressText,
    estimatedSizeText,
    estimatedDurationText,
    
    // Methods
    startRecording,
    stopRecording,
    getAvailableMethods,
    getRecommendedMethod,
    getRecordingSettings,
    extractSceneConfig
  }
}