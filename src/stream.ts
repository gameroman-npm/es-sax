import type { Stream as NodeStream } from "node:stream";

let Stream: typeof NodeStream;
try {
  Stream = require("node:stream").Stream;
} catch {
  // @ts-expect-error
  Stream = function () {};
}

// @ts-expect-error
if (!Stream) Stream = function () {};

export default Stream;
