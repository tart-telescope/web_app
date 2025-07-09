<template>
  <v-footer app height="40">
    <a
      v-for="item in items"
      :key="item.title"
      class="d-inline-block mx-2 social-link"
      :href="item.href"
      rel="noopener noreferrer"
      target="_blank"
      :title="item.title"
    >
      <v-icon :icon="item.icon" :size="item.icon === '$vuetify' ? 24 : 16" />
    </a>

    <v-btn flat @click="toggleTheme">{{
      theme.global.current.value.dark ? "light mode" : "dark mode"
    }}</v-btn>
    <v-btn> Build: {{ commitSHA }} </v-btn>
  </v-footer>
</template>

<script setup>
  import { useTheme } from "vuetify";

  const commitSHA = import.meta.env.VITE_COMMIT_SHA;

  const theme = useTheme();

  function toggleTheme() {
    theme.global.name.value = theme.global.current.value.dark ? "light" : "dark";
  }

  const items = [
    {
      title: "TART Docs",
      icon: "mdi-shield-star-outline",
      href: "https://tart.elec.ac.nz/doc/",
    },
    {
      title: "TART GitHub",
      icon: `mdi-github`,
      href: "https://github.com/tart-telescope",
    },
    {
      title: "TART Telegram",
      icon: `mdi-message`,
      href: "https://reddit.com/r/vuetifyjs",
    },
  ];
</script>

<style scoped lang="sass">
.social-link :deep(.v-icon)
  color: rgba(var(--v-theme-on-background), var(--v-disabled-opacity))
  text-decoration: none
  transition: .2s ease-in-out

  &:hover
    color: rgba(25, 118, 210, 1)
</style>
