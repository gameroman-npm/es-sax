import { test } from "./index.ts";

// split high-order numeric attributes into surrogate pairs
test({
  xml: "<a>&#x1f525;</a>",
  expect: [
    ["opentagstart", { name: "A", attributes: {} }],
    ["opentag", { name: "A", attributes: {}, isSelfClosing: false }],
    ["text", "\ud83d\udd25"],
    ["closetag", "A"],
  ],
  strict: false,
  opt: {},
});
