import { ENTITIES, EVENTS, XML_ENTITIES } from "./constants";
import { SAXParser } from "./parser";
import { STATE } from "./state";
import { SAXStream } from "./stream";
import type { SAXOptions } from "./types";

interface Sax {
  MAX_BUFFER_LENGTH: number;
  ENTITIES: Record<string, string>;
  EVENTS: typeof EVENTS;
  XML_ENTITIES: typeof XML_ENTITIES;
  STATE: typeof STATE;

  parser(strict?: boolean, opt?: SAXOptions): SAXParser;
  createStream(strict?: boolean, opt?: SAXOptions): SAXStream;

  SAXParser: typeof SAXParser;
  SAXStream: typeof SAXStream;
}

function parser(strict?: boolean, opt?: SAXOptions): SAXParser {
  return new SAXParser(strict, opt);
}

function createStream(strict?: boolean, opt?: SAXOptions): SAXStream {
  return new SAXStream(strict, opt);
}

const sax: Sax = {
  /**
   * When we pass the `MAX_BUFFER_LENGTH` position, start checking for buffer overruns.
   * When we check, schedule the next check for `MAX_BUFFER_LENGTH - (max(buffer lengths))`,
   * since that's the earliest that a buffer overrun could occur.  This way, checks are
   * as rare as required, but as often as necessary to ensure never crossing this bound.
   * Furthermore, buffers are only tested at most once per `write()`, so passing a very
   * large string into `write()` might have undesirable effects, but this is manageable by
   * the caller, so it is assumed to be safe.  Thus, a call to `write()` may, in the extreme
   * edge case, result in creating at most one complete copy of the string passed in.
   * Set to Infinity to have unlimited buffers.
   */
  MAX_BUFFER_LENGTH: 64 * 1024,

  ENTITIES,

  EVENTS,

  XML_ENTITIES,

  STATE,

  parser,

  createStream,

  SAXParser,

  SAXStream,
};

Object.keys(sax.ENTITIES).forEach(function (key: keyof typeof sax.ENTITIES) {
  const e = sax.ENTITIES[key]!;
  const s = typeof e === "number" ? String.fromCharCode(e) : e;
  sax.ENTITIES[key] = s;
});

export { createStream, parser };
export default sax;
