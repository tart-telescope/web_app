<template>
  <v-btn
    v-if="!isRecording"
    :disabled="!canRecord"
    color="primary"
    size="small"
    variant="outlined"
    @click="startRecordingWithMethod"
  >
    <v-icon start size="small">mdi-video</v-icon>
    Export MP4
  </v-btn>

  <!-- Recording Progress -->
  <div v-else class="recording-status">
    <v-btn
      color="error"
      size="small"
      variant="outlined"
      @click="stopRecording"
    >
      <v-icon start size="small">mdi-stop</v-icon>
      Stop
    </v-btn>
    <v-tooltip bottom>
      <template #activator="{ props }">
        <v-progress-circular
          v-bind="props"
          :model-value="recordingProgress * 100"
          :size="24"
          :width="3"
          class="ml-2"
          color="primary"
        />
      </template>
      <span>{{ progressText }}</span>
    </v-tooltip>
  </div>

  <!-- Error Snackbar -->
  <v-snackbar
    v-model="showError"
    color="error"
    timeout="5000"
  >
    Recording Failed: {{ recordingError }}
    <template #actions>
      <v-btn
        color="white"
        variant="text"
        @click="showError = false"
      >
        Close
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useVideoRecorder } from '@/composables/useVideoRecorder'

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

// Use video recorder composable
const {
  isRecording,
  recordingProgress,
  recordingError,
  hasHistoryData,
  canRecord,
  progressText,
  startRecording,
  stopRecording
} = useVideoRecorder(props.visHistory, props.nside, props.info)

// Local state for error display
const showError = ref(false)

// Watch for recording errors
watch(recordingError, (newError) => {
  if (newError) {
    showError.value = true
  }
}, { immediate: true })

// Start recording
async function startRecordingWithMethod() {
  try {
    await startRecording(props.is3D, props.componentRefs)
  } catch (error) {
    console.error('❌ Failed to start recording:', error)
    recordingError.value = error.message
  }
}
</script>

<style scoped>
.recording-status {
  display: flex;
  align-items: center;
}
</style>