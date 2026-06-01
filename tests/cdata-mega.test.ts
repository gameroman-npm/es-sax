import assert from "node:assert";
import process from "node:process";
import { test } from "node:test";

import sax from "es-sax";

test("cdata-mega", () => {
  const bytesInMiB = 1024 * 1024;
  const cdataSize = 1 * bytesInMiB;
  const expectedUpperBound = cdataSize * 2;
  const cdataContent = "X".repeat(cdataSize);
  const xml = "<r><![CDATA[" + cdataContent + "]]></r>";

  const memoryUsageBefore = process.memoryUsage().heapUsed;

  const parser = sax.parser();
  let parsedCData = null;
  parser.oncdata = (c) => {
    parsedCData = c;
  };
  parser.write(xml).close();
  const memoryUsageDiff = process.memoryUsage().heapUsed - memoryUsageBefore;

  assert.strictEqual(parsedCData, cdataContent);
  assert.ok(
    memoryUsageDiff < expectedUpperBound,
    "Expected at most " +
      expectedUpperBound / bytesInMiB +
      " MiB to be allocated, was " +
      memoryUsageDiff / bytesInMiB,
  );
});
