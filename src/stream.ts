import type { Stream as NodeStream, Readable } from "node:stream";

import { EVENTS } from "./constants";
import { SAXParser } from "./parser";
import type { QualifiedTag, SAXOptions, Tag } from "./types";
import { determineBufferEncoding } from "./util";

let Stream: typeof NodeStream;
try {
  Stream = (await import("node:stream")).Stream;
} catch {
  // @ts-expect-error
  Stream = function () {};
}

// @ts-expect-error
// oxlint-disable-next-line no-unnecessary-condition
if (!Stream) Stream = function () {};

const streamWraps = EVENTS.filter(function (ev) {
  return ev !== "error" && ev !== "end";
});

type StreamEvent = Exclude<(typeof EVENTS)[number], "error" | "end">;

class SAXStream extends Stream {
  declare private _parser: SAXParser;

  constructor(strict?: boolean, opt?: SAXOptions) {
    super();

    this._parser = new SAXParser(strict, opt);
    this.writable = true;
    this.readable = true;

    this._parser.onend = () => {
      this.emit("end");
    };

    this._parser.onerror = (er) => {
      this.emit("error", er);

      // if didn't throw, then means error was handled.
      // go ahead and clear error, so we can write again.
      this._parser.error = null;
    };

    this._decoder = null;
    this._decoderBuffer = null;

    // Set up dynamic getters/setters for stream wraps
    streamWraps.forEach((ev) => {
      Object.defineProperty(this, `on${ev}`, {
        get: () => this._parser[`on${ev}`],
        set: (h) => {
          if (!h) {
            this.removeAllListeners(ev);
            this._parser[`on${ev}`] = h;
            return h;
          }
          this.on(ev, h);
        },
        enumerable: true,
        configurable: false,
      });
    });
  }

  private _decodeBuffer(data, isEnd) {
    if (this._decoderBuffer) {
      // Keep incomplete leading bytes until we have enough data to infer the
      // stream encoding, then decode the buffered prefix together with the next chunk.
      data = Buffer.concat([this._decoderBuffer, data]);
      this._decoderBuffer = null;
    }

    if (!this._decoder) {
      const encoding = determineBufferEncoding(data, isEnd);
      if (!encoding) {
        // A very short first chunk may not contain enough bytes to detect the
        // encoding yet, so defer decoding until the next write/end call.
        this._decoderBuffer = data;
        return "";
      }

      // Store the detected transport encoding so strict mode can compare it
      // with the optional encoding declared in the XML prolog later on.
      this._parser.encoding = encoding;
      this._decoder = new TextDecoder(encoding);
    }

    return this._decoder.decode(data, { stream: !isEnd });
  }

  write(data: string | Buffer): true {
    if (
      typeof Buffer === "function" &&
      typeof Buffer.isBuffer === "function" &&
      Buffer.isBuffer(data)
    ) {
      data = this._decodeBuffer(data, false);
    } else if (this._decoderBuffer) {
      // Flush any buffered binary prefix before handling a string chunk.
      // This only matters if the caller mixes Buffer and string writes (used in test).
      const remaining = this._decodeBuffer(Buffer.alloc(0), true);
      if (remaining) {
        this._parser.write(remaining);
        this.emit("data", remaining);
      }
    }

    this._parser.write(data.toString());
    this.emit("data", data);
    return true;
  }

  end(chunk?: string | Buffer): true {
    if (chunk && chunk.length) {
      this.write(chunk);
    }
    // Flush any remaining decoded data from the TextDecoder
    if (this._decoderBuffer) {
      const finalChunk = this._decodeBuffer(Buffer.alloc(0), true);
      if (finalChunk) {
        this._parser.write(finalChunk);
        this.emit("data", finalChunk);
      }
    } else if (this._decoder) {
      const remaining = this._decoder.decode();
      if (remaining) {
        this._parser.write(remaining);
        this.emit("data", remaining);
      }
    }
    this._parser.end();
    return true;
  }

  override on(
    event: "text",
    listener: (this: this, text: string) => void,
  ): this;
  override on(
    event: "doctype",
    listener: (this: this, doctype: string) => void,
  ): this;
  override on(
    event: "processinginstruction",
    listener: (this: this, node: { name: string; body: string }) => void,
  ): this;
  override on(
    event: "sgmldeclaration",
    listener: (this: this, sgmlDecl: string) => void,
  ): this;
  override on(
    event: "opentag" | "opentagstart",
    listener: (this: this, tag: Tag | QualifiedTag) => void,
  ): this;
  override on(
    event: "closetag",
    listener: (this: this, tagName: string) => void,
  ): this;
  override on(
    event: "attribute",
    listener: (this: this, attr: { name: string; value: string }) => void,
  ): this;
  override on(
    event: "comment",
    listener: (this: this, comment: string) => void,
  ): this;
  override on(
    event:
      | "opencdata"
      | "closecdata"
      | "end"
      | "ready"
      | "close"
      | "readable"
      | "drain"
      | "finish",
    listener: (this: this) => void,
  ): this;
  override on(
    event: "cdata",
    listener: (this: this, cdata: string) => void,
  ): this;
  override on(
    event: "opennamespace" | "closenamespace",
    listener: (this: this, ns: { prefix: string; uri: string }) => void,
  ): this;
  override on(
    event: "script",
    listener: (this: this, script: string) => void,
  ): this;
  override on(
    event: "data",
    listener: (this: this, chunk: unknown) => void,
  ): this;
  override on(event: "error", listener: (this: this, err: Error) => void): this;
  override on(
    event: "pipe" | "unpipe",
    listener: (this: this, src: Readable) => void,
  ): this;
  override on(
    event: string | symbol,
    listener: (this: this, ...args: unknown[]) => void,
  ): this;

  override on(ev: StreamEvent, handler: (...args: unknown[]) => void) {
    if (!this._parser[`on${ev}`] && streamWraps.indexOf(ev) !== -1) {
      this._parser[`on${ev}`] = (...args: unknown[]) => {
        this.emit(ev, ...args);
      };
    }

    return super.on(ev, handler);
  }
}

export { SAXStream };
