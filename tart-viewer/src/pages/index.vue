<template>
  <div v-if="!localMode">Redirecting to default telescope...</div>
  <Home v-else />
</template>

<script setup>
  import { onMounted, computed } from "vue";
  import { useRouter } from "vue-router";
  import { useAppStore } from "@/stores/app";
  import Home from "@/components/Home.vue";

  const router = useRouter();
  const appStore = useAppStore();

  const localMode = computed(() => appStore.localMode);

  onMounted(() => {
    // Only redirect if not in local mode
    if (!localMode.value) {
      router.replace("/zm-cbu");
    }
  });
</script>
