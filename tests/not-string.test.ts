import assert from "node:assert";
import { test } from "node:test";

import sax from "es-sax";

test("should parse buffer input correctly", () => {
  const parser = sax.parser(true);

  parser.onopentag = function (node) {
    assert.deepStrictEqual(node, {
      name: "x",
      attributes: {},
      isSelfClosing: false,
    });
  };

  const xml = Buffer.from("<x>y</x>");
  parser.write(xml).close();
});
