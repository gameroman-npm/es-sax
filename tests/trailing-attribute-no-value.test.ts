import { test } from "./index.ts";

test({
  xml: "<root attrib>",
  expect: [
    ["opentagstart", { name: "ROOT", attributes: {} }],
    ["attribute", { name: "ATTRIB", value: "attrib" }],
    [
      "opentag",
      {
        name: "ROOT",
        attributes: { ATTRIB: "attrib" },
        isSelfClosing: false,
      },
    ],
  ],
  opt: { trim: true },
});
