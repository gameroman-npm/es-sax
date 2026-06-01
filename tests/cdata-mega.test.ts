import assert from "node:assert";
import process from "node:process";
import { test } from "node:test";

import sax from "es-sax";

test("cdata-mega", () => {
  var bytesInMiB = 1024 * 1024;
  var cdataSize = 1 * bytesInMiB;
  var expectedUpperBound = cdataSize * 2;
  var cdataContent = "X".repeat(cdataSize);
  var xml = "<r><![CDATA[" + cdataContent + "]]></r>";

  var memoryUsageBefore = process.memoryUsage().heapUsed;

  var parser = sax.parser();
  var parsedCData = null;
  parser.oncdata = (c) => {
    parsedCData = c;
  };
  parser.write(xml).close();
  var memoryUsageDiff = process.memoryUsage().heapUsed - memoryUsageBefore;

  assert.strictEqual(parsedCData, cdataContent);
  assert.ok(
    memoryUsageDiff < expectedUpperBound,
    "Expected at most " +
      expectedUpperBound / bytesInMiB +
      " MiB to be allocated, was " +
      memoryUsageDiff / bytesInMiB,
  );
});
