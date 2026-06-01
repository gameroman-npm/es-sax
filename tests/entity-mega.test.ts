import sax from "es-sax";

import { test } from "./index.ts";

var xml = "<r>";
var text = "";
for (var i in sax.ENTITIES) {
  xml += "&" + i + ";";
  text += sax.ENTITIES[i];
}
xml += "</r>";
test({
  xml: xml,
  expect: [
    ["opentagstart", { name: "R", attributes: {} }],
    ["opentag", { name: "R", attributes: {}, isSelfClosing: false }],
    ["text", text],
    ["closetag", "R"],
  ],
});
