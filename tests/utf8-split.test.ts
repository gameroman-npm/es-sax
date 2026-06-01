import assert from "node:assert";
import { test } from "node:test";

import sax from "es-sax";

test.skip(() => {
  const saxStream = sax.createStream();

  const b = Buffer.from("误");

  saxStream.on("text", function (text) {
    assert.strictEqual(text, b.toString());
  });

  saxStream.write(Buffer.from("<test><a>"));
  saxStream.write(b.slice(0, 1));
  saxStream.write(b.slice(1));
  saxStream.write(Buffer.from("</a><b>"));
  saxStream.write(b.slice(0, 2));
  saxStream.write(b.slice(2));
  saxStream.write(Buffer.from("</b><c>"));
  saxStream.write(b);
  saxStream.write(Buffer.from("</c>"));
  saxStream.write(Buffer.concat([Buffer.from("<d>"), b.slice(0, 1)]));
  saxStream.end(Buffer.concat([b.slice(1), Buffer.from("</d></test>")]));
});

test.skip(() => {
  const saxStream2 = sax.createStream();

  saxStream2.on("text", function (text) {
    assert.strictEqual(text, "\uFFFD");
  });

  saxStream2.write(Buffer.from("<root>"));
  saxStream2.write(Buffer.from("<e>"));
  saxStream2.write(Buffer.from([0xc0]));
  saxStream2.write(Buffer.from("</e>"));
  saxStream2.write(Buffer.concat([Buffer.from("<f>"), b.slice(0, 1)]));
  saxStream2.write(Buffer.from("</root>"));
  saxStream2.end();
});
