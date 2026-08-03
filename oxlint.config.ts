import { defineConfig } from "@gameroman/config/oxlint/ts";

export default defineConfig({
  options: { typeCheck: false },
  overrides: [
    { files: ["**/tests/**"], rules: { "no-floating-promises": "off" } },
  ],
});
