import { defineConfig } from "@gameroman/config/oxlint/typeaware";

export default defineConfig({
  rules: {
    "no-floating-promises": "warn",
    "no-unnecessary-condition": "warn",
    "no-this-alias": "warn",
    "no-var": "warn",
  },
  options: {
    typeCheck: false,
  },
});
