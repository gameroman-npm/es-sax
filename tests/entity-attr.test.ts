import sax from "es-sax";

import { test } from "./index.ts";

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
