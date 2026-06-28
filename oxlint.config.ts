import { defineConfig } from "@gameroman/config/oxlint/typeaware";

export default defineConfig({
  rules: {
    "no-floating-promises": "warn",
    "no-this-alias": "warn",
  },
  options: {
    typeCheck: false,
  },
});
