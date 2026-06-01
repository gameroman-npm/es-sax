import { test } from "./index.ts";

var sax = require("../");
sax.ENTITIES.elem = "<B/>";
test({
  opt: { unparsedEntities: true },
  xml: `<A ATTR="&elem;"/>`,
  expect: [
    ["opentagstart", { name: "A", attributes: {} }],
    ["attribute", { name: "ATTR", value: "<B/>" }],
    [
      "opentag",
      { name: "A", attributes: { ATTR: "<B/>" }, isSelfClosing: true },
    ],
    ["closetag", "A"],
  ],
});
