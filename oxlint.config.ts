import { defineConfig } from "@gameroman/config/oxlint/typeaware";

export default defineConfig({
  rules: {
    "no-floating-promises": "warn",
    "no-unnecessary-condition": "warn",
  },
  options: {
    typeCheck: false,
  },
});
