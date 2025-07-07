/**
 * plugins/vuetify.js
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Composables
import { createVuetify } from "vuetify";

// Custom SVG icons for better performance
import { SvgIcon } from "@/composables/useIcons";

// Styles
import "vuetify/styles";

// Custom icon set using our SVG icons
const customSvg = {
  component: SvgIcon,
};

// Icon aliases that Vuetify components use internally
const aliases = {
  menu: 'mdi-menu',
  collapse: 'mdi-chevron-up',
  expand: 'mdi-chevron-down',
  next: 'mdi-chevron-right',
  prev: 'mdi-chevron-left',
  close: 'mdi-close',
  complete: 'mdi-check',
  cancel: 'mdi-close-circle',
  delete: 'mdi-close-circle',
  clear: 'mdi-close-circle',
  success: 'mdi-check-circle',
  info: 'mdi-information',
  warning: 'mdi-alert',
  error: 'mdi-close-circle',
  dropdown: 'mdi-chevron-down',
  edit: 'mdi-pencil',
  ratingEmpty: 'mdi-star-outline',
  ratingFull: 'mdi-star',
  ratingHalf: 'mdi-star-half-full',
  checkboxOn: 'mdi-checkbox-marked',
  checkboxOff: 'mdi-checkbox-blank-outline',
  checkboxIndeterminate: 'mdi-minus-box'
};

export default createVuetify({
  theme: {
    defaultTheme: "dark",
  },
  icons: {
    defaultSet: "customSvg",
    aliases,
    sets: {
      customSvg,
    },
  },
  components: {
    SvgIcon,
  },
});
