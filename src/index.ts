import {
  CDATA,
  DOCTYPE,
  ENTITIES,
  EVENTS,
  XML_ENTITIES,
  entityBody,
  entityStart,
  nameBody,
  nameStart,
  rootNS,
} from "./constants";
import {
  attrib,
  beginWhiteSpace,
  checkBufferLength,
  clearBuffers,
  closeTag,
  closeText,
  emit,
  emitNode,
  error,
  flushBuffers,
  newTag,
  strictFail,
  validateXmlDeclarationEncoding,
} from "./parser";
import { STATE } from "./state";
import Stream from "./stream";
import {
  charAt,
  determineBufferEncoding,
  isAttribEnd,
  isMatch,
  isQuote,
  isWhitespace,
  notMatch,
  qname,
  textopts,
} from "./util";

const sax: unknown = {};

(function (sax) {
  // When we pass the MAX_BUFFER_LENGTH position, start checking for buffer overruns.
  // When we check, schedule the next check for MAX_BUFFER_LENGTH - (max(buffer lengths)),
  // since that's the earliest that a buffer overrun could occur.  This way, checks are
  // as rare as required, but as often as necessary to ensure never crossing this bound.
  // Furthermore, buffers are only tested at most once per write(), so passing a very
  // large string into write() might have undesirable effects, but this is manageable by
  // the caller, so it is assumed to be safe.  Thus, a call to write() may, in the extreme
  // edge case, result in creating at most one complete copy of the string passed in.
  // Set to Infinity to have unlimited buffers.
  sax.MAX_BUFFER_LENGTH = 64 * 1024;

  sax.ENTITIES = ENTITIES;

  sax.EVENTS = EVENTS;

  sax.XML_ENTITIES = XML_ENTITIES;

  const streamWraps = sax.EVENTS.filter(function (ev) {
    return ev !== "error" && ev !== "end";
  });

  function SAXParser(strict, opt) {
    if (!(this instanceof SAXParser)) {
      return new SAXParser(strict, opt);
    }

    const parser = this;
    clearBuffers(parser);
    parser.q = parser.c = "";
    parser.bufferCheckPosition = sax.MAX_BUFFER_LENGTH;
    parser.encoding = null;
    parser.opt = opt || {};
    parser.opt.lowercase = parser.opt.lowercase || parser.opt.lowercasetags;
    parser.looseCase = parser.opt.lowercase ? "toLowerCase" : "toUpperCase";
    parser.opt.maxEntityCount = parser.opt.maxEntityCount || 512;
    parser.opt.maxEntityDepth = parser.opt.maxEntityDepth || 4;
    parser.entityCount = parser.entityDepth = 0;
    parser.tags = [];
    parser.closed = parser.closedRoot = parser.sawRoot = false;
    parser.tag = parser.error = null;
    parser.strict = !!strict;
    parser.noscript = !!(strict || parser.opt.noscript);
    parser.state = S.BEGIN;
    parser.strictEntities = parser.opt.strictEntities;
    parser.ENTITIES = parser.strictEntities
      ? Object.create(sax.XML_ENTITIES)
      : Object.create(sax.ENTITIES);
    parser.attribList = [];

    // namespaces form a prototype chain.
    // it always points at the current tag,
    // which protos to its parent tag.
    if (parser.opt.xmlns) {
      parser.ns = Object.create(rootNS);
    }

    // disallow unquoted attribute values if not otherwise configured
    // and strict mode is true
    if (parser.opt.unquotedAttributeValues === undefined) {
      parser.opt.unquotedAttributeValues = !strict;
    }

    // mostly just for error reporting
    parser.trackPosition = parser.opt.position !== false;
    if (parser.trackPosition) {
      parser.position = parser.line = parser.column = 0;
    }
    emit(parser, "onready");
  }

  SAXParser.prototype = {
    end: function () {
      end(this);
    },
    write: write,
    resume: function () {
      this.error = null;
      return this;
    },
    close: function () {
      return this.write(null);
    },
    flush: function () {
      flushBuffers(this);
    },
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

  // wrapper for non-node envs
  sax.parser = function (strict, opt) {
    return new SAXParser(strict, opt);
  };

  function createStream(strict, opt) {
    return new SAXStream(strict, opt);
  }

  sax.SAXParser = SAXParser;
  sax.SAXStream = SAXStream;
  sax.createStream = createStream;

  sax.STATE = STATE;

  Object.keys(sax.ENTITIES).forEach(function (key) {
    const e = sax.ENTITIES[key];
    const s = typeof e === "number" ? String.fromCharCode(e) : e;
    sax.ENTITIES[key] = s;
  });

  for (const s in sax.STATE) {
    sax.STATE[sax.STATE[s]] = s;
  }

  // shorthand
  const S = sax.STATE;

  function end(parser) {
    if (parser.sawRoot && !parser.closedRoot)
      strictFail(parser, "Unclosed root tag");
    if (
      parser.state !== S.BEGIN &&
      parser.state !== S.BEGIN_WHITESPACE &&
      parser.state !== S.TEXT
    ) {
      error(parser, "Unexpected end");
    }
    closeText(parser);
    parser.c = "";
    parser.closed = true;
    emit(parser, "onend");
    SAXParser.call(parser, parser.strict, parser.opt);
    return parser;
  }

  function openTag(parser, selfClosing?) {
    if (parser.opt.xmlns) {
      // emit namespace binding events
      const tag = parser.tag;

      // add namespace info to tag
      const qn = qname(parser.tagName);
      tag.prefix = qn.prefix;
      tag.local = qn.local;
      tag.uri = tag.ns[qn.prefix] || "";

      if (tag.prefix && !tag.uri) {
        strictFail(
          parser,
          "Unbound namespace prefix: " + JSON.stringify(parser.tagName),
        );
        tag.uri = qn.prefix;
      }

      const parent = parser.tags[parser.tags.length - 1] || parser;
      if (tag.ns && parent.ns !== tag.ns) {
        Object.keys(tag.ns).forEach(function (p) {
          emitNode(parser, "onopennamespace", {
            prefix: p,
            uri: tag.ns[p],
          });
        });
      }

      // handle deferred onattribute events
      // Note: do not apply default ns to attributes:
      //   http://www.w3.org/TR/REC-xml-names/#defaulting
      for (let i = 0, l = parser.attribList.length; i < l; i++) {
        const nv = parser.attribList[i];
        const name = nv[0];
        const value = nv[1];
        const qualName = qname(name, true);
        const prefix = qualName.prefix;
        const local = qualName.local;
        const uri = prefix === "" ? "" : tag.ns[prefix] || "";
        const a = {
          name: name,
          value: value,
          prefix: prefix,
          local: local,
          uri: uri,
        };

        // if there's any attributes with an undefined namespace,
        // then fail on them now.
        if (prefix && prefix !== "xmlns" && !uri) {
          strictFail(
            parser,
            "Unbound namespace prefix: " + JSON.stringify(prefix),
          );
          a.uri = prefix;
        }
        parser.tag.attributes[name] = a;
        emitNode(parser, "onattribute", a);
      }
      parser.attribList.length = 0;
    }

    parser.tag.isSelfClosing = !!selfClosing;

    // process the tag
    parser.sawRoot = true;
    parser.tags.push(parser.tag);
    emitNode(parser, "onopentag", parser.tag);
    if (!selfClosing) {
      // special case for <script> in non-strict mode.
      if (!parser.noscript && parser.tagName.toLowerCase() === "script") {
        parser.state = S.SCRIPT;
      } else {
        parser.state = S.TEXT;
      }
      parser.tag = null;
      parser.tagName = "";
    }
    parser.attribName = parser.attribValue = "";
    parser.attribList.length = 0;
  }

  function parseEntity(parser) {
    let entity = parser.entity;
    const entityLC = entity.toLowerCase();
    let num;
    let numStr = "";

    if (parser.ENTITIES[entity]) {
      return parser.ENTITIES[entity];
    }
    if (parser.ENTITIES[entityLC]) {
      return parser.ENTITIES[entityLC];
    }
    entity = entityLC;
    if (entity.charAt(0) === "#") {
      if (entity.charAt(1) === "x") {
        entity = entity.slice(2);
        num = parseInt(entity, 16);
        numStr = num.toString(16);
      } else {
        entity = entity.slice(1);
        num = parseInt(entity, 10);
        numStr = num.toString(10);
      }
    }
    entity = entity.replace(/^0+/, "");
    if (
      isNaN(num) ||
      numStr.toLowerCase() !== entity ||
      num < 0 ||
      num > 0x10ffff
    ) {
      strictFail(parser, "Invalid character entity");
      return "&" + parser.entity + ";";
    }

    return String.fromCodePoint(num);
  }

  function write(chunk) {
    const parser = this;
    if (this.error) {
      throw this.error;
    }
    if (parser.closed) {
      return error(
        parser,
        "Cannot write after close. Assign an onready handler.",
      );
    }
    if (chunk === null) {
      return end(parser);
    }
    if (typeof chunk === "object") {
      chunk = chunk.toString();
    }
    let i = 0;
    let c = "";
    while (true) {
      c = charAt(chunk, i++);
      parser.c = c;

      if (!c) {
        break;
      }

      if (parser.trackPosition) {
        parser.position++;
        if (c === "\n") {
          parser.line++;
          parser.column = 0;
        } else {
          parser.column++;
        }
      }

      switch (parser.state) {
        case S.BEGIN:
          parser.state = S.BEGIN_WHITESPACE;
          if (c === "\uFEFF") {
            continue;
          }
          beginWhiteSpace(parser, c);
          continue;

        case S.BEGIN_WHITESPACE:
          beginWhiteSpace(parser, c);
          continue;

        case S.TEXT:
          if (parser.sawRoot && !parser.closedRoot) {
            var starti = i - 1;
            while (c && c !== "<" && c !== "&") {
              c = charAt(chunk, i++);
              if (c && parser.trackPosition) {
                parser.position++;
                if (c === "\n") {
                  parser.line++;
                  parser.column = 0;
                } else {
                  parser.column++;
                }
              }
            }
            parser.textNode += chunk.substring(starti, i - 1);
          }
          if (
            c === "<" &&
            !(parser.sawRoot && parser.closedRoot && !parser.strict)
          ) {
            parser.state = S.OPEN_WAKA;
            parser.startTagPosition = parser.position;
          } else {
            if (!isWhitespace(c) && (!parser.sawRoot || parser.closedRoot)) {
              strictFail(parser, "Text data outside of root node.");
            }
            if (c === "&") {
              parser.state = S.TEXT_ENTITY;
            } else {
              parser.textNode += c;
            }
          }
          continue;

        case S.SCRIPT:
          // only non-strict
          if (c === "<") {
            parser.state = S.SCRIPT_ENDING;
          } else {
            parser.script += c;
          }
          continue;

        case S.SCRIPT_ENDING:
          if (c === "/") {
            parser.state = S.CLOSE_TAG;
          } else {
            parser.script += "<" + c;
            parser.state = S.SCRIPT;
          }
          continue;

        case S.OPEN_WAKA:
          // either a /, ?, !, or text is coming next.
          if (c === "!") {
            parser.state = S.SGML_DECL;
            parser.sgmlDecl = "";
          } else if (isWhitespace(c)) {
            // wait for it...
          } else if (isMatch(nameStart, c)) {
            parser.state = S.OPEN_TAG;
            parser.tagName = c;
          } else if (c === "/") {
            parser.state = S.CLOSE_TAG;
            parser.tagName = "";
          } else if (c === "?") {
            parser.state = S.PROC_INST;
            parser.procInstName = parser.procInstBody = "";
          } else {
            strictFail(parser, "Unencoded <");
            // if there was some whitespace, then add that in.
            if (parser.startTagPosition + 1 < parser.position) {
              const pad = parser.position - parser.startTagPosition;
              c = new Array(pad).join(" ") + c;
            }
            parser.textNode += "<" + c;
            parser.state = S.TEXT;
          }
          continue;

        case S.SGML_DECL:
          if (parser.sgmlDecl + c === "--") {
            parser.state = S.COMMENT;
            parser.comment = "";
            parser.sgmlDecl = "";
            continue;
          }

          if (parser.doctype && parser.doctype !== true && parser.sgmlDecl) {
            parser.state = S.DOCTYPE_DTD;
            parser.doctype += "<!" + parser.sgmlDecl + c;
            parser.sgmlDecl = "";
          } else if ((parser.sgmlDecl + c).toUpperCase() === CDATA) {
            emitNode(parser, "onopencdata");
            parser.state = S.CDATA;
            parser.sgmlDecl = "";
            parser.cdata = "";
          } else if ((parser.sgmlDecl + c).toUpperCase() === DOCTYPE) {
            parser.state = S.DOCTYPE;
            if (parser.doctype || parser.sawRoot) {
              strictFail(parser, "Inappropriately located doctype declaration");
            }
            parser.doctype = "";
            parser.sgmlDecl = "";
          } else if (c === ">") {
            emitNode(parser, "onsgmldeclaration", parser.sgmlDecl);
            parser.sgmlDecl = "";
            parser.state = S.TEXT;
          } else if (isQuote(c)) {
            parser.state = S.SGML_DECL_QUOTED;
            parser.sgmlDecl += c;
          } else {
            parser.sgmlDecl += c;
          }
          continue;

        case S.SGML_DECL_QUOTED:
          if (c === parser.q) {
            parser.state = S.SGML_DECL;
            parser.q = "";
          }
          parser.sgmlDecl += c;
          continue;

        case S.DOCTYPE:
          if (c === ">") {
            parser.state = S.TEXT;
            emitNode(parser, "ondoctype", parser.doctype);
            parser.doctype = true; // just remember that we saw it.
          } else {
            parser.doctype += c;
            if (c === "[") {
              parser.state = S.DOCTYPE_DTD;
            } else if (isQuote(c)) {
              parser.state = S.DOCTYPE_QUOTED;
              parser.q = c;
            }
          }
          continue;

        case S.DOCTYPE_QUOTED:
          parser.doctype += c;
          if (c === parser.q) {
            parser.q = "";
            parser.state = S.DOCTYPE;
          }
          continue;

        case S.DOCTYPE_DTD:
          if (c === "]") {
            parser.doctype += c;
            parser.state = S.DOCTYPE;
          } else if (c === "<") {
            parser.state = S.OPEN_WAKA;
            parser.startTagPosition = parser.position;
          } else if (isQuote(c)) {
            parser.doctype += c;
            parser.state = S.DOCTYPE_DTD_QUOTED;
            parser.q = c;
          } else {
            parser.doctype += c;
          }
          continue;

        case S.DOCTYPE_DTD_QUOTED:
          parser.doctype += c;
          if (c === parser.q) {
            parser.state = S.DOCTYPE_DTD;
            parser.q = "";
          }
          continue;

        case S.COMMENT:
          if (c === "-") {
            parser.state = S.COMMENT_ENDING;
          } else {
            parser.comment += c;
          }
          continue;

        case S.COMMENT_ENDING:
          if (c === "-") {
            parser.state = S.COMMENT_ENDED;
            parser.comment = textopts(parser.opt, parser.comment);
            if (parser.comment) {
              emitNode(parser, "oncomment", parser.comment);
            }
            parser.comment = "";
          } else {
            parser.comment += "-" + c;
            parser.state = S.COMMENT;
          }
          continue;

        case S.COMMENT_ENDED:
          if (c !== ">") {
            strictFail(parser, "Malformed comment");
            // allow <!-- blah -- bloo --> in non-strict mode,
            // which is a comment of " blah -- bloo "
            parser.comment += "--" + c;
            parser.state = S.COMMENT;
          } else if (parser.doctype && parser.doctype !== true) {
            parser.state = S.DOCTYPE_DTD;
          } else {
            parser.state = S.TEXT;
          }
          continue;

        case S.CDATA:
          var starti = i - 1;
          while (c && c !== "]") {
            c = charAt(chunk, i++);
            if (c && parser.trackPosition) {
              parser.position++;
              if (c === "\n") {
                parser.line++;
                parser.column = 0;
              } else {
                parser.column++;
              }
            }
          }
          parser.cdata += chunk.substring(starti, i - 1);
          if (c === "]") {
            parser.state = S.CDATA_ENDING;
          }
          continue;

        case S.CDATA_ENDING:
          if (c === "]") {
            parser.state = S.CDATA_ENDING_2;
          } else {
            parser.cdata += "]" + c;
            parser.state = S.CDATA;
          }
          continue;

        case S.CDATA_ENDING_2:
          if (c === ">") {
            if (parser.cdata) {
              emitNode(parser, "oncdata", parser.cdata);
            }
            emitNode(parser, "onclosecdata");
            parser.cdata = "";
            parser.state = S.TEXT;
          } else if (c === "]") {
            parser.cdata += "]";
          } else {
            parser.cdata += "]]" + c;
            parser.state = S.CDATA;
          }
          continue;

        case S.PROC_INST:
          if (c === "?") {
            parser.state = S.PROC_INST_ENDING;
          } else if (isWhitespace(c)) {
            parser.state = S.PROC_INST_BODY;
          } else {
            parser.procInstName += c;
          }
          continue;

        case S.PROC_INST_BODY:
          if (!parser.procInstBody && isWhitespace(c)) {
            continue;
          } else if (c === "?") {
            parser.state = S.PROC_INST_ENDING;
          } else {
            parser.procInstBody += c;
          }
          continue;

        case S.PROC_INST_ENDING:
          if (c === ">") {
            const procInstEndData = {
              name: parser.procInstName,
              body: parser.procInstBody,
            };
            validateXmlDeclarationEncoding(parser, procInstEndData);
            emitNode(parser, "onprocessinginstruction", procInstEndData);
            parser.procInstName = parser.procInstBody = "";
            parser.state = S.TEXT;
          } else {
            parser.procInstBody += "?" + c;
            parser.state = S.PROC_INST_BODY;
          }
          continue;

        case S.OPEN_TAG:
          if (isMatch(nameBody, c)) {
            parser.tagName += c;
          } else {
            newTag(parser);
            if (c === ">") {
              openTag(parser);
            } else if (c === "/") {
              parser.state = S.OPEN_TAG_SLASH;
            } else {
              if (!isWhitespace(c)) {
                strictFail(parser, "Invalid character in tag name");
              }
              parser.state = S.ATTRIB;
            }
          }
          continue;

        case S.OPEN_TAG_SLASH:
          if (c === ">") {
            openTag(parser, true);
            closeTag(parser);
          } else {
            strictFail(
              parser,
              "Forward-slash in opening tag not followed by >",
            );
            parser.state = S.ATTRIB;
          }
          continue;

        case S.ATTRIB:
          // haven't read the attribute name yet.
          if (isWhitespace(c)) {
            continue;
          } else if (c === ">") {
            openTag(parser);
          } else if (c === "/") {
            parser.state = S.OPEN_TAG_SLASH;
          } else if (isMatch(nameStart, c)) {
            parser.attribName = c;
            parser.attribValue = "";
            parser.state = S.ATTRIB_NAME;
          } else {
            strictFail(parser, "Invalid attribute name");
          }
          continue;

        case S.ATTRIB_NAME:
          if (c === "=") {
            parser.state = S.ATTRIB_VALUE;
          } else if (c === ">") {
            strictFail(parser, "Attribute without value");
            parser.attribValue = parser.attribName;
            attrib(parser);
            openTag(parser);
          } else if (isWhitespace(c)) {
            parser.state = S.ATTRIB_NAME_SAW_WHITE;
          } else if (isMatch(nameBody, c)) {
            parser.attribName += c;
          } else {
            strictFail(parser, "Invalid attribute name");
          }
          continue;

        case S.ATTRIB_NAME_SAW_WHITE:
          if (c === "=") {
            parser.state = S.ATTRIB_VALUE;
          } else if (isWhitespace(c)) {
            continue;
          } else {
            strictFail(parser, "Attribute without value");
            parser.tag.attributes[parser.attribName] = "";
            parser.attribValue = "";
            emitNode(parser, "onattribute", {
              name: parser.attribName,
              value: "",
            });
            parser.attribName = "";
            if (c === ">") {
              openTag(parser);
            } else if (isMatch(nameStart, c)) {
              parser.attribName = c;
              parser.state = S.ATTRIB_NAME;
            } else {
              strictFail(parser, "Invalid attribute name");
              parser.state = S.ATTRIB;
            }
          }
          continue;

        case S.ATTRIB_VALUE:
          if (isWhitespace(c)) {
            continue;
          } else if (isQuote(c)) {
            parser.q = c;
            parser.state = S.ATTRIB_VALUE_QUOTED;
          } else {
            if (!parser.opt.unquotedAttributeValues) {
              error(parser, "Unquoted attribute value");
            }
            parser.state = S.ATTRIB_VALUE_UNQUOTED;
            parser.attribValue = c;
          }
          continue;

        case S.ATTRIB_VALUE_QUOTED:
          if (c !== parser.q) {
            if (c === "&") {
              parser.state = S.ATTRIB_VALUE_ENTITY_Q;
            } else {
              parser.attribValue += c;
            }
            continue;
          }
          attrib(parser);
          parser.q = "";
          parser.state = S.ATTRIB_VALUE_CLOSED;
          continue;

        case S.ATTRIB_VALUE_CLOSED:
          if (isWhitespace(c)) {
            parser.state = S.ATTRIB;
          } else if (c === ">") {
            openTag(parser);
          } else if (c === "/") {
            parser.state = S.OPEN_TAG_SLASH;
          } else if (isMatch(nameStart, c)) {
            strictFail(parser, "No whitespace between attributes");
            parser.attribName = c;
            parser.attribValue = "";
            parser.state = S.ATTRIB_NAME;
          } else {
            strictFail(parser, "Invalid attribute name");
          }
          continue;

        case S.ATTRIB_VALUE_UNQUOTED:
          if (!isAttribEnd(c)) {
            if (c === "&") {
              parser.state = S.ATTRIB_VALUE_ENTITY_U;
            } else {
              parser.attribValue += c;
            }
            continue;
          }
          attrib(parser);
          if (c === ">") {
            openTag(parser);
          } else {
            parser.state = S.ATTRIB;
          }
          continue;

        case S.CLOSE_TAG:
          if (!parser.tagName) {
            if (isWhitespace(c)) {
              continue;
            } else if (notMatch(nameStart, c)) {
              if (parser.script) {
                parser.script += "</" + c;
                parser.state = S.SCRIPT;
              } else {
                strictFail(parser, "Invalid tagname in closing tag.");
              }
            } else {
              parser.tagName = c;
            }
          } else if (c === ">") {
            closeTag(parser);
          } else if (isMatch(nameBody, c)) {
            parser.tagName += c;
          } else if (parser.script) {
            parser.script += "</" + parser.tagName + c;
            parser.tagName = "";
            parser.state = S.SCRIPT;
          } else {
            if (!isWhitespace(c)) {
              strictFail(parser, "Invalid tagname in closing tag");
            }
            parser.state = S.CLOSE_TAG_SAW_WHITE;
          }
          continue;

        case S.CLOSE_TAG_SAW_WHITE:
          if (isWhitespace(c)) {
            continue;
          }
          if (c === ">") {
            closeTag(parser);
          } else {
            strictFail(parser, "Invalid characters in closing tag");
          }
          continue;

        case S.TEXT_ENTITY:
        case S.ATTRIB_VALUE_ENTITY_Q:
        case S.ATTRIB_VALUE_ENTITY_U:
          let returnState;
          let buffer;
          switch (parser.state) {
            case S.TEXT_ENTITY:
              returnState = S.TEXT;
              buffer = "textNode";
              break;

            case S.ATTRIB_VALUE_ENTITY_Q:
              returnState = S.ATTRIB_VALUE_QUOTED;
              buffer = "attribValue";
              break;

            case S.ATTRIB_VALUE_ENTITY_U:
              returnState = S.ATTRIB_VALUE_UNQUOTED;
              buffer = "attribValue";
              break;
          }

          if (c === ";") {
            const parsedEntity = parseEntity(parser);
            if (
              parser.opt.unparsedEntities &&
              !Object.values(sax.XML_ENTITIES).includes(parsedEntity)
            ) {
              if ((parser.entityCount += 1) > parser.opt.maxEntityCount) {
                error(parser, "Parsed entity count exceeds max entity count");
              }

              if ((parser.entityDepth += 1) > parser.opt.maxEntityDepth) {
                error(parser, "Parsed entity depth exceeds max entity depth");
              }

              parser.entity = "";
              parser.state = returnState;
              parser.write(parsedEntity);
              parser.entityDepth -= 1;
            } else {
              parser[buffer] += parsedEntity;
              parser.entity = "";
              parser.state = returnState;
            }
          } else if (
            isMatch(parser.entity.length ? entityBody : entityStart, c)
          ) {
            parser.entity += c;
          } else {
            strictFail(parser, "Invalid character in entity name");
            parser[buffer] += "&" + parser.entity + c;
            parser.entity = "";
            parser.state = returnState;
          }

          continue;

        default: /* istanbul ignore next */ {
          throw new Error(parser, "Unknown state: " + parser.state);
        }
      }
    } // while

    if (parser.position >= parser.bufferCheckPosition) {
      checkBufferLength(parser, sax.MAX_BUFFER_LENGTH);
    }
    return parser;
  }
})(sax);

export default sax;
