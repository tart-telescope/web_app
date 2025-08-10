<template>
  <v-card class="video-recording-controls" elevation="2">
    <v-card-title class="pb-2">
      <v-icon class="mr-2">mdi-file-download</v-icon>
      Record Time-lapse Video
      <v-chip v-if="hasHistoryData" color="primary" size="small">
        {{ totalFrames }} frames
      </v-chip>
    </v-card-title>

    <!-- Recording Status -->
    <v-card-text v-if="isRecording" class="pb-2">
      <v-alert class="mb-3" color="info" variant="tonal">
        <v-row align="center">
          <v-col>
            <div class="font-weight-medium">{{ progressText }}</div>
            <div class="text-caption">{{ recordingMethod.toUpperCase() }} recording in progress...</div>
          </v-col>
          <v-col cols="auto">
            <v-btn
              color="error"
              size="small"
              variant="outlined"
              @click="stopRecording"
            >
              <v-icon start>mdi-stop</v-icon>
              Stop
            </v-btn>
          </v-col>
        </v-row>
        <v-progress-linear
          class="mt-3"
          color="primary"
          height="8"
          :model-value="recordingProgress * 100"
        />
      </v-alert>
    </v-card-text>

    <!-- Recording Methods -->
    <v-card-text v-if="!isRecording">
      <!-- Single Recording Button -->
      <v-btn
        block
        class="text-none"
        color="primary"
        :disabled="!canRecord"
        size="large"
        variant="elevated"
        @click="startRecordingWithMethod"
      >
        <v-icon start>mdi-download</v-icon>
        <div class="text-left">
          <div class="font-weight-bold">Record Video</div>
          <div class="text-caption">60fps • 1080x1080 • MP4</div>
        </div>
      </v-btn>

      <!-- Error Display -->
      <v-alert
        v-if="recordingError"
        class="mt-3"
        closable
        color="error"
        variant="tonal"
        @click:close="recordingError = null"
      >
        <strong>Recording Failed:</strong> {{ recordingError }}
      </v-alert>

    </v-card-text>
  </v-card>
</template>

<script setup>
  import { computed, onMounted, ref, watch } from 'vue'
  import { useVideoRecorder } from '@/composables/useVideoRecorder'
  import { RECORDING_SETTINGS } from '@/services/videoRecorder'

  const props = defineProps({
    is3D: {
      type: Boolean,
      required: true
    },
    componentRefs: {
      type: Object,
      required: true
    },
    visHistory: {
      type: Array,
      default: () => []
    },
    nside: {
      type: Number,
      default: 64
    },
    info: {
      type: Object,
      default: () => ({})
    }
  })

  const emit = defineEmits(['add-test-data'])

  // Use video recorder composable with props data instead of store
  const {
    isRecording,
    recordingProgress,
    recordingMethod,
    recordingError,
    currentFrame,
    totalFrames,
    hasHistoryData,
    canRecord,
    recordingStats,
    progressText,
    estimatedSizeText,
    estimatedDurationText,
    startRecording,
    stopRecording,
    getAvailableMethods
  } = useVideoRecorder(props.visHistory, props.nside, props.info)

  // Get recording settings
  const recordingSettings = computed(() => RECORDING_SETTINGS)

  // Local reactive data
  const availableMethods = ref([])

  // Start recording with fixed settings
  async function startRecordingWithMethod() {
    try {
      console.log('🚀 Starting recording...')
      await startRecording(props.is3D, props.componentRefs)
      console.log('✅ Recording started successfully')
    } catch (error) {
      console.error('❌ Failed to start recording:', error)
      recordingError.value = error.message
    }
  }

  // Initialize component on mount
  onMounted(() => {
    console.log('🎬 VideoRecordingControls mounted')
    console.log('⚙️ Recording settings:', recordingSettings.value)
  })
</script>

<style scoped>
.video-recording-controls {
  max-width: 600px;
}

.text-caption {
  line-height: 1.2;
}

.v-btn .v-icon {
  opacity: 0.8;
}

.v-expansion-panel-text {
  padding-top: 16px;
}
</style>
