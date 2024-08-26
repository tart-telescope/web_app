<template>
    <v-list-item>
        <template v-if="authenticated">
            <v-btn block color="error" @click="logout">Logout</v-btn>
        </template>
        <template v-else>
            <v-text-field
                type="password"
                v-model="pass"
                outlined
                label="Password"
                @keydown.enter="auth(pass)"
            >
            </v-text-field>
            <v-spacer />
            <v-btn
                :loading="authenticating"
                color="secondary"
                block
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
import { useAppStore } from "@/stores/app";
import { mapState, mapActions } from "pinia";

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
