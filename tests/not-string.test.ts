import assert from "node:assert";
import { test } from "node:test";

import sax from "es-sax";

test("should parse buffer input correctly", () => {
  var parser = sax.parser(true);

  parser.onopentag = function (node) {
    assert.deepStrictEqual(node, {
      name: "x",
      attributes: {},
      isSelfClosing: false,
    });
  };

  var xml = Buffer.from("<x>y</x>");
  parser.write(xml).close();
});
