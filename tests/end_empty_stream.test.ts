import assert from "node:assert";
import { test } from "node:test";

import sax from "es-sax";

const saxStream = sax.createStream();

test.skip("stream should end without throwing an error", function () {
  assert.doesNotThrow(function () {
    saxStream.end();
  });
});
