<template>
  <div v-if="!localMode">Redirecting to default telescope...</div>
  <Home v-else />
</template>

<script setup>
  import { computed, onMounted } from "vue";
  import { useRouter } from "vue-router";
  import Home from "@/components/Home.vue";
  import { useAppStore } from "@/stores/app";

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
