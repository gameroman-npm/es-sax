import assert from "node:assert";
import { test } from "node:test";

import sax from "es-sax";

test("parses utf-16 xml streams when the declaration says UTF-16", async () => {
  const stream = sax.createStream(true);
  const result: {
    processinginstruction: null | { name: string; body: string };
    opentagstart: null;
    opentag: null;
    text: string;
    closetag: null | string;
    error: null | string;
    errorCount: number;
  } = {
    processinginstruction: null,
    opentagstart: null,
    opentag: null,
    text: "",
    closetag: null,
    error: null,
    errorCount: 0,
  };
  const xml =
    '<?xml version="1.0" encoding="UTF-16"?>\n<person>Hi Jérôme</person>';
  const utf16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(xml, "utf16le"),
  ]);

  stream.on("processinginstruction", function (node) {
    result.processinginstruction = node;
  });

  stream.on("opentagstart", function (node) {
    result.opentagstart = node;
  });

  stream.on("opentag", function (node) {
    result.opentag = node;
  });

  stream.on("text", function (text) {
    result.text += text;
  });

  stream.on("closetag", function (name) {
    result.closetag = name;
  });

  stream.on("error", function (err) {
    if (!result.error) {
      result.error = err.message;
    }
    result.errorCount += 1;
  });

  // Wrap the assertion inside a Promise that resolves when the stream ends
  await new Promise<void>((resolve) => {
    stream.on("end", function () {
      assert.deepStrictEqual(result, {
        processinginstruction: {
          name: "xml",
          body: 'version="1.0" encoding="UTF-16"',
        },
        opentagstart: { name: "person", attributes: {}, isSelfClosing: false },
        opentag: { name: "person", attributes: {}, isSelfClosing: false },
        text: "\nHi Jérôme",
        closetag: "person",
        error: null,
        errorCount: 0,
      });
      resolve();
    });

    stream.write(utf16.slice(0, 7));
    stream.write(utf16.slice(7, 34));
    stream.end(utf16.slice(34));
  });
});

test("fails in strict mode when declared encoding conflicts with detected utf-16", async () => {
  const stream = sax.createStream(true);
  let error: string | null = null;
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<person>Hi Jérôme</person>';
  const utf16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(xml, "utf16le"),
  ]);

  stream.on("error", function (err) {
    if (!error) {
      error = err.message;
    }
  });

  await new Promise<void>((resolve) => {
    stream.on("end", function () {
      assert.strictEqual(
        error,
        "XML declaration encoding UTF-8 does not match detected stream encoding UTF-16LE\nLine: 0\nColumn: 38\nChar: >",
      );
      resolve();
    });

    stream.write(utf16.slice(0, 9));
    stream.end(utf16.slice(9));
  });
});

test("does not fail in non-strict mode when declared encoding conflicts with detected utf-16", async () => {
  const stream = sax.createStream(false);
  const result: { text: string; error: null | string } = {
    text: "",
    error: null,
  };
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<person>Hi Jérôme</person>';
  const utf16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(xml, "utf16le"),
  ]);

  stream.on("text", function (text) {
    result.text += text;
  });

  stream.on("error", function (err) {
    if (!result.error) {
      result.error = err.message;
    }
  });

  await new Promise<void>((resolve) => {
    stream.on("end", function () {
      assert.deepStrictEqual(result, {
        text: "\nHi Jérôme",
        error: null,
      });
      resolve();
    });

    stream.write(utf16.slice(0, 9));
    stream.end(utf16.slice(9));
  });
});
