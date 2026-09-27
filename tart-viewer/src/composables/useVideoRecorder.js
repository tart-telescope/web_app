/**
 * Vue Composable for Video Recording
 *
 * Provides reactive state management and methods for recording time-lapse videos
 * from vis_history data using either MediaRecorder or CCapture services.
 */

import { storeToRefs } from "pinia";
import { computed, onUnmounted, ref, watch, watchEffect } from "vue";
import { createVideoRecorder, detectBestRecordingMethod, RecorderUtils, RECORDING_SETTINGS } from "@/services/videoRecorder";
import { useAppStore } from "@/stores/app";

/**
 * Resolve a data source that may be a getter or a plain value.
 *
 * Callers pass getters now. A prop handed over by value is a snapshot taken at
 * setup: `watch(() => prop, ...)` has no reactive dependency and never fires,
 * and a ref built from it keeps pointing at whatever array existed then.
 *
 * That is how the recorder came to export 60 frames of a 601-record history.
 * The store replaces vis_history on every file load — the sort at the end of it
 * returns a new array — so a captured reference is not merely stale, it is
 * permanently detached, while the live data path keeps pushing into the
 * current array and makes it look like it is creeping along.
 */
function resolve(source, fallback) {
  const value = typeof source === "function" ? source() : source;
  return value ?? fallback;
}

/**
 * What an export would cover: how many frames, out of how many, and the
 * timestamps the video will start and end on.
 *
 * The first and last timestamps are the point. A frame count on its own cannot
 * be checked against the timeline by eye, and "60 of 601" looked like a
 * plausible export until the span was printed next to it — the recorder was
 * working from a stale copy of the history, so the video silently covered one
 * file while every other number in the app looked right.
 */
function describeExport(history, selected) {
  const first = selected[0]?.timestamp ?? null;
  const last = selected.at(-1)?.timestamp ?? null;
  const elapsed = selected.length > 1 ? (new Date(last) - new Date(first)) / 1000 : 0;

  return (
    `${selected.length}/${history.length} frames  ` +
    `${first ? new Date(first).toISOString() : "—"} .. ${last ? new Date(last).toISOString() : "—"}` +
    `  (${elapsed.toFixed(0)}s of data, ${(selected.length / RECORDING_SETTINGS.frameRate).toFixed(1)}s of video)`
  );
}

export function useVideoRecorder(visHistorySource, nsideSource, infoSource) {
  // Access store for zoom range
  const store = useAppStore();

  // Read through on every access, so the recorder always sees the current
  // history rather than the one that happened to exist when it mounted.
  const vis_history = computed(() => resolve(visHistorySource, []));
  const nside = computed(() => resolve(nsideSource, 64));
  const info = computed(() => resolve(infoSource, {}));

  // Recording state
  const isRecording = ref(false);
  const recordingProgress = ref(0);
  const recordingMethod = ref("stream");

  // Progress tracking
  const currentFrame = ref(0);
  const totalFrames = ref(0);
  const currentTimestamp = ref(null);
  const estimatedTimeRemaining = ref(0);
  const recordingError = ref(null);

  // Active recorder instance
  let activeRecorder = null;

  // Computed properties
  // Filter vis_history to only include visible/zoomed range
  const filteredVisHistory = computed(() => {
    try {
      const history = vis_history.value;
      if (!history || !Array.isArray(history) || history.length === 0) {
        return [];
      }

      // If no zoom range, return full history
      const zoomRange = store.currentZoomRange;
      if (!zoomRange || !zoomRange.min || !zoomRange.max) {
        return history;
      }

      // Filter by zoom range (convert zoom range from seconds to milliseconds)
      const minTime = zoomRange.min * 1000;
      const maxTime = zoomRange.max * 1000;

      return history.filter((item) => {
        const timestamp = new Date(item.timestamp).getTime();
        return timestamp >= minTime && timestamp <= maxTime;
      });
    } catch (error) {
      console.warn("❌ Error filtering vis_history:", error);
      return vis_history.value || [];
    }
  });

  // Published quietly, following the window.h5wasmWarm convention. The
  // recorder's own view of the history is otherwise invisible from outside, and
  // it is the thing that was wrong when the export covered one file: every
  // number the app showed came from the store. Not logged, because this
  // re-evaluates on every render.
  watchEffect(() => {
    globalThis.recorderView = {
      frames: filteredVisHistory.value.length,
      total: vis_history.value.length,
    };
  });

  const hasHistoryData = computed(() => {
    try {
      const history = filteredVisHistory.value;
      return history && Array.isArray(history) && history.length > 0;
    } catch (error) {
      console.warn("❌ Error accessing vis_history:", error);
      return false;
    }
  });

  const recordingStats = computed(() => {
    try {
      if (!hasHistoryData.value) {
        return null;
      }

      const snapshot = filteredVisHistory.value;
      if (!snapshot || !Array.isArray(snapshot)) {
        return null;
      }

      return RecorderUtils.estimateRecording(snapshot);
    } catch (error) {
      console.warn("Error calculating recording stats:", error);
      return null;
    }
  });

  const canRecord = computed(() => {
    try {
      const history = filteredVisHistory.value;
      return hasHistoryData.value && !isRecording.value && history && Array.isArray(history) && history.length >= 10;
    } catch (error) {
      console.warn("Error checking canRecord:", error);
      return false;
    }
  });

  /**
   * Extract scene configuration from current component state
   */
  function extractSceneConfig(is3D, refs) {
    try {
      const activeRef = is3D ? refs.threejsRef : refs.svgRef;

      if (!activeRef) {
        console.error("❌ No active renderer reference:", { is3D, refs, activeRef });
        throw new Error("No active renderer reference available");
      }

      // Extract current camera configuration
      const camera = activeRef.camera;

      let cameraConfig = null;
      if (camera) {
        // Check if it's OrthographicCamera or PerspectiveCamera
        const isOrthographic = camera.isOrthographicCamera || camera.type === "OrthographicCamera";

        if (isOrthographic) {
          // Use orthographic camera settings (like main component)
          cameraConfig = {
            type: "orthographic",
            position: {
              x: camera.position?.x || 0,
              y: camera.position?.y || 3.5,
              z: camera.position?.z || 0,
            },
            rotation: {
              x: camera.rotation?.x || 0,
              y: camera.rotation?.y || 0,
              z: camera.rotation?.z || 0,
            },
            left: camera.left || -3,
            right: camera.right || 3,
            top: camera.top || 3,
            bottom: camera.bottom || -3,
            near: camera.near || 0.1,
            far: camera.far || 1000,
            frustumSize: 3, // Match main component
          };
        } else {
          // Perspective camera fallback
          cameraConfig = {
            type: "perspective",
            position: {
              x: camera.position?.x || 0,
              y: camera.position?.y || 0,
              z: camera.position?.z || 5,
            },
            rotation: {
              x: camera.rotation?.x || 0,
              y: camera.rotation?.y || 0,
              z: camera.rotation?.z || 0,
            },
            fov: camera.fov || 75,
            aspect: RECORDING_SETTINGS.width / RECORDING_SETTINGS.height,
            near: camera.near || 0.1,
            far: camera.far || 1000,
          };
        }
      } else {
        // Default to orthographic camera like main component
        cameraConfig = {
          type: "orthographic",
          position: { x: 0, y: 3.5, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          left: -3,
          right: 3,
          top: 3,
          bottom: -3,
          near: 0.1,
          far: 1000,
          frustumSize: 3,
        };
      }

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
          preserveDrawingBuffer: true,
        },
      };

      return sceneConfig;
    } catch (error) {
      console.error("❌ Failed to extract scene config:", error);
      throw new Error(`Cannot extract scene configuration: ${error.message}`);
    }
  }

  /**
   * Progress callback for recording updates
   */
  function onRecordingProgress(progressData) {
    recordingProgress.value = progressData.percentage;
    currentFrame.value = progressData.frameIndex || 0;
    totalFrames.value = progressData.totalFrames || 0;
    currentTimestamp.value = progressData.currentTimestamp || null;
    estimatedTimeRemaining.value = progressData.estimatedTimeRemaining || 0;
  }

  /**
   * Start recording with fixed optimal settings
   */
  async function startRecording(is3D, refs) {
    if (isRecording.value) {
      throw new Error("Recording already in progress");
    }

    if (!hasHistoryData.value || !filteredVisHistory.value) {
      console.error("❌ No history data available:", {
        hasHistoryData: hasHistoryData.value,
        filteredHistoryLength: filteredVisHistory.value?.length,
      });
      throw new Error("No history data available for recording");
    }

    try {
      // Reset state
      recordingError.value = null;
      recordingProgress.value = 0;
      currentFrame.value = 0;
      totalFrames.value = 0;
      currentTimestamp.value = null;
      estimatedTimeRemaining.value = 0;

      const recordingSettings = RECORDING_SETTINGS;

      // Validate filtered vis_history
      if (!filteredVisHistory.value || !Array.isArray(filteredVisHistory.value)) {
        throw new Error("filtered vis_history is not available or not an array");
      }
      RecorderUtils.validateVisHistory(filteredVisHistory.value);

      // The one place this is worth saying out loud. It used to be logged from
      // the filtered-history computed, so it printed on every render instead of
      // when an export was actually asked for.
      console.log(`📹 Export: ${describeExport(vis_history.value, filteredVisHistory.value)}`);

      const historySnapshot = RecorderUtils.createDataSnapshot(filteredVisHistory.value);
      totalFrames.value = historySnapshot.length;

      const sceneConfig = extractSceneConfig(is3D, refs);

      activeRecorder = createVideoRecorder();
      recordingMethod.value = "stream";
      isRecording.value = true;

      await activeRecorder.recordHistory(sceneConfig, historySnapshot, recordingSettings, onRecordingProgress);
    } catch (error) {
      console.error("❌ Recording failed:", error);
      recordingError.value = error.message;
      throw error;
    } finally {
      isRecording.value = false;
      activeRecorder = null;
      recordingProgress.value = 0;
    }
  }

  /**
   * Stop current recording
   */
  function stopRecording() {
    if (activeRecorder && isRecording.value) {
      activeRecorder.stop();
      isRecording.value = false;
      activeRecorder = null;
      console.log("Recording stopped by user");
    }
  }

  /**
   * Get available recording methods with their capabilities
   */
  function getAvailableMethods() {
    const methods = [];

    try {
      const streamRecorder = createVideoRecorder();
      const capabilities = streamRecorder.getCapabilities();
      methods.push({
        id: "stream",
        name: "Video Recording",
        description: `${RECORDING_SETTINGS.frameRate}fps • ${RECORDING_SETTINGS.width}x${RECORDING_SETTINGS.height} • ${RECORDING_SETTINGS.format.toUpperCase()}`,
        supported: capabilities.supported,
        formats: capabilities.formats || [],
        icon: "mdi-download",
      });
    } catch (error) {
      methods.push({
        id: "stream",
        name: "Video Recording",
        description: "Recording not supported",
        supported: false,
        error: error.message,
        icon: "mdi-download",
      });
    }

    return methods;
  }

  /**
   * Get recommended recording method
   */
  function getRecommendedMethod() {
    return detectBestRecordingMethod();
  }

  /**
   * Get current recording settings
   */
  function getRecordingSettings() {
    return { ...RECORDING_SETTINGS };
  }

  /**
   * Get formatted progress text
   */
  const progressText = computed(() => {
    try {
      if (!isRecording.value) {
        return "";
      }

      const percentage = Math.round(recordingProgress.value * 100);
      const timeRemaining = estimatedTimeRemaining.value;
      let timeText = "";
      if (timeRemaining !== null && timeRemaining > 0) {
        timeText = ` (~${timeRemaining.toFixed(1)}s remaining)`;
      } else if (timeRemaining === null) {
        timeText = " (~N/A remaining)";
      }

      return `Recording: ${currentFrame.value}/${totalFrames.value} frames (${percentage}%)${timeText}`;
    } catch (error) {
      console.warn("Error generating progress text:", error);
      return "Recording...";
    }
  });

  /**
   * Get formatted file size estimation
   */
  const estimatedSizeText = computed(() => {
    try {
      if (!recordingStats.value) {
        return "";
      }
      return RecorderUtils.formatFileSize(recordingStats.value.estimatedSize);
    } catch (error) {
      console.warn("Error formatting estimated size:", error);
      return "";
    }
  });

  /**
   * Get formatted duration estimation
   */
  const estimatedDurationText = computed(() => {
    try {
      if (!recordingStats.value) {
        return "";
      }
      return RecorderUtils.formatDuration(recordingStats.value.duration);
    } catch (error) {
      console.warn("Error formatting estimated duration:", error);
      return "";
    }
  });

  /**
   * Update totalFrames when filtered vis_history changes
   */
  watch(
    filteredVisHistory,
    (newHistory) => {
      totalFrames.value = newHistory && Array.isArray(newHistory) ? newHistory.length : 0;
    },
    { immediate: true },
  );

  // Cleanup on unmount
  onUnmounted(() => {
    if (isRecording.value && activeRecorder) {
      stopRecording();
    }
  });

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
    extractSceneConfig,
  };
}
