<template>
  <v-list-item>
    <template v-if="authenticated">
      <v-btn block color="error" @click="logout">Logout</v-btn>
    </template>
    <template v-else>
      <v-text-field
        v-model="pass"
        label="Password"
        outlined
        type="password"
        @keydown.enter="auth(pass)"
      />
      <v-spacer />
      <v-btn
        block
        color="secondary"
        :loading="authenticating"
        @click="auth(pass)"
      >
        Login
        <v-icon right>mdi-key</v-icon>
      </v-btn>
    </template>
  </v-list-item>
  <v-spacer />
  <v-spacer />
</template>

<script>
  import { mapActions, mapState } from "pinia";
  import { useAppStore } from "@/stores/app";

  export default {
    name: "LoginComponent",
    components: {},
    props: {},
    data() {
      return {
        pass: "",
        loading: false,
      };
    },
    methods: {
      ...mapActions(useAppStore, ["auth", "logout"]),
    },
    computed: {
      ...mapState(useAppStore, ["token", "authenticating", "info"]),
      authenticated() {
        return this.token ? true : false;
      },
    },
  };
</script>
