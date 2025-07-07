<template>
  <div>Redirecting to default telescope...</div>
</template>

<script setup>
  import { onMounted } from "vue";
  import { useRouter } from "vue-router";

  const router = useRouter();

  onMounted(() => {
    // Redirect to default telescope
    router.replace("/zm-cbu");
  });
</script>
