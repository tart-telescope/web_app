<template>
  <div v-if="!localMode">Redirecting to default telescope...</div>
  <SimpleView v-else-if="localMode && isSimpleView" />
  <Home v-else />
</template>

<script setup>
  import { computed, onMounted } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import Home from "@/components/Home.vue";
  import SimpleView from "@/components/SimpleView.vue";
  import { useAppStore } from "@/stores/app";

  const router = useRouter();
  const route = useRoute();
  const appStore = useAppStore();

  const localMode = computed(() => appStore.localMode);
  const isSimpleView = computed(() => route.query.view === 'simple');

  onMounted(() => {
    // Only redirect if not in local mode
    if (!localMode.value) {
      router.replace({ path: "/zm-cbu", query: route.query });
    }
  });
</script>
