<template>
  <SimpleView v-if="isSimpleView" />
  <Home v-else />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import Home from '@/components/Home.vue'
  import SimpleView from '@/components/SimpleView.vue'

  // The telescope selection logic is handled in the default layout
  // This page renders either Home or SimpleView based on query parameter
  const route = useRoute()
  const isSimpleView = computed(() => route.query.view === 'simple')
</script>
