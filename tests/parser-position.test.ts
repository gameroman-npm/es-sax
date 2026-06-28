import assert from "node:assert";
import { test } from "node:test";

import sax from "es-sax";

function testPosition(chunks, expectedEvents) {
  const parser = sax.parser();

  expectedEvents.forEach(function (expectation) {
    parser[`on${expectation[0]}`] = function () {
      for (const prop in expectation[1]) {
        assert.strictEqual(parser[prop], expectation[1][prop]);
      }
    };
  });

  chunks.forEach(function (chunk) {
    parser.write(chunk);
  });
}

test("should track positions for a single chunk", function () {
  testPosition(
    ["<div>abcdefgh</div>"],
    [
      ["opentagstart", { position: 5, startTagPosition: 1 }],
      ["opentag", { position: 5, startTagPosition: 1 }],
      ["text", { position: 19, startTagPosition: 14 }],
      ["closetag", { position: 19, startTagPosition: 14 }],
    ],
  );
});

test("should track positions across split chunks", function () {
  testPosition(
    ["<div>abcde", "fgh</div>"],
    [
      ["opentagstart", { position: 5, startTagPosition: 1 }],
      ["opentag", { position: 5, startTagPosition: 1 }],
      ["text", { position: 19, startTagPosition: 14 }],
      ["closetag", { position: 19, startTagPosition: 14 }],
    ],
  );
});
