import { SAXParser } from "./parser";
import sax from "./sax";
import Stream from "./stream";
import { determineBufferEncoding } from "./util";

(function (sax) {
  const streamWraps = sax.EVENTS.filter(function (ev) {
    return ev !== "error" && ev !== "end";
  });

  // wrapper for non-node envs
  sax.parser = function (strict, opt) {
    return new SAXParser(strict, opt);
  };

  class SAXStream extends Stream {
    constructor(strict, opt) {
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
        Object.defineProperty(this, "on" + ev, {
          get: () => this._parser["on" + ev],
          set: (h) => {
            if (!h) {
              this.removeAllListeners(ev);
              this._parser["on" + ev] = h;
              return h;
            }
            this.on(ev, h);
          },
          enumerable: true,
          configurable: false,
        });
      });
    }

    _decodeBuffer(data, isEnd) {
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

    write(data) {
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

    end(chunk) {
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

    on(ev, handler) {
      if (!this._parser["on" + ev] && streamWraps.indexOf(ev) !== -1) {
        this._parser["on" + ev] = (...args) => {
          this.emit(ev, ...args);
        };
      }

      return super.on(ev, handler);
    }
  }

  function createStream(strict, opt) {
    return new SAXStream(strict, opt);
  }

  sax.SAXParser = SAXParser;
  sax.SAXStream = SAXStream;
  sax.createStream = createStream;

  Object.keys(sax.ENTITIES).forEach(function (key) {
    const e = sax.ENTITIES[key];
    const s = typeof e === "number" ? String.fromCharCode(e) : e;
    sax.ENTITIES[key] = s;
  });
})(sax);

export default sax;
