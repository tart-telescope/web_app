import vuetify from "eslint-config-vuetify";

export default vuetify(
  {
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/block-lang": "off",
      "vue/order-in-components": "off",
    },
  },
  {
    ignores: ["pkg/**", "dist/**", "node_modules/**", "*.d.ts", "**/*.d.ts"],
  },
);
