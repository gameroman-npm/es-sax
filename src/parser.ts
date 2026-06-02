import { buffers, XML_NAMESPACE, XMLNS_NAMESPACE } from "./constants";
import {
  CDATA,
  DOCTYPE,
  entityBody,
  entityStart,
  nameBody,
  nameStart,
  rootNS,
} from "./constants";
import sax from "./sax";
import { STATE } from "./state";
import type { SAXOptions } from "./types";
import { encodingsMatch, getDeclaredEncoding, qname } from "./util";
import {
  charAt,
  isAttribEnd,
  isMatch,
  isQuote,
  isWhitespace,
  notMatch,
  textopts,
} from "./util";

function emit(parser: SAXParser, event, data?): void {
  parser[event]?.(data);
}

function closeText(parser: SAXParser): void {
  parser.textNode = textopts(parser.opt, parser.textNode);
  if (parser.textNode) emit(parser, "ontext", parser.textNode);
  parser.textNode = "";
}

function emitNode(parser: SAXParser, nodeType, data?): void {
  if (parser.textNode) closeText(parser);
  emit(parser, nodeType, data);
}

function newTag(parser: SAXParser): void {
  if (!parser.strict) parser.tagName = parser.tagName[parser.looseCase]();
  const parent = parser.tags[parser.tags.length - 1] || parser;
  const tag = (parser.tag = { name: parser.tagName, attributes: {} });

  // will be overridden if tag contails an xmlns="foo" or xmlns:foo="bar"
  if (parser.opt.xmlns) {
    tag.ns = parent.ns;
  }
  parser.attribList.length = 0;
  emitNode(parser, "onopentagstart", tag);
}

function error<T extends SAXParser>(parser: T, er): T {
  closeText(parser);
  if (parser.trackPosition) {
    er +=
      "\nLine: " +
      parser.line +
      "\nColumn: " +
      parser.column +
      "\nChar: " +
      parser.c;
  }
  er = new Error(er);
  parser.error = er;
  emit(parser, "onerror", er);
  return parser;
}

function clearBuffers(parser: SAXParser): void {
  for (const buf of buffers) {
    parser[buf] = "";
  }
}

function flushBuffers(parser: SAXParser): void {
  closeText(parser);
  if (parser.cdata !== "") {
    emitNode(parser, "oncdata", parser.cdata);
    parser.cdata = "";
  }
  if (parser.script !== "") {
    emitNode(parser, "onscript", parser.script);
    parser.script = "";
  }
}

function checkBufferLength(parser: SAXParser, MAX_BUFFER_LENGTH: number): void {
  const maxAllowed = Math.max(MAX_BUFFER_LENGTH, 10);
  let maxActual = 0;
  for (let i = 0, l = buffers.length; i < l; i++) {
    const len = parser[buffers[i]].length;
    if (len > maxAllowed) {
      // Text/cdata nodes can get big, and since they're buffered,
      // we can get here under normal conditions.
      // Avoid issues by emitting the text node now,
      // so at least it won't get any bigger.
      switch (buffers[i]) {
        case "textNode":
          closeText(parser);
          break;

        case "cdata":
          emitNode(parser, "oncdata", parser.cdata);
          parser.cdata = "";
          break;

        case "script":
          emitNode(parser, "onscript", parser.script);
          parser.script = "";
          break;

        default:
          error(parser, "Max buffer length exceeded: " + buffers[i]);
      }
    }
    maxActual = Math.max(maxActual, len);
  }

  // schedule the next check for the earliest possible buffer overrun.
  const m = MAX_BUFFER_LENGTH - maxActual;
  parser.bufferCheckPosition = m + parser.position;
}

function strictFail(parser: SAXParser, message): void {
  if (parser.strict) {
    error(parser, message);
  }
}

function validateXmlDeclarationEncoding(parser: SAXParser, data): void {
  if (!parser.strict || !parser.encoding || !data || data.name !== "xml") {
    return;
  }

  const declaredEncoding = getDeclaredEncoding(data.body);
  if (declaredEncoding && !encodingsMatch(parser.encoding, declaredEncoding)) {
    strictFail(
      parser,
      "XML declaration encoding " +
        declaredEncoding +
        " does not match detected stream encoding " +
        parser.encoding.toUpperCase(),
    );
  }
}

function beginWhiteSpace(parser: SAXParser, c): void {
  if (c === "<") {
    parser.state = STATE.OPEN_WAKA;
    parser.startTagPosition = parser.position;
  } else if (!isWhitespace(c)) {
    // have to process this as a text node.
    // weird, but happens.
    strictFail(parser, "Non-whitespace before first tag.");
    parser.textNode = c;
    parser.state = STATE.TEXT;
  }
}

function attrib(parser: SAXParser): void {
  if (!parser.strict) {
    parser.attribName = parser.attribName[parser.looseCase]();
  }

  if (
    parser.attribList.indexOf(parser.attribName) !== -1 ||
    parser.tag.attributes.hasOwnProperty(parser.attribName)
  ) {
    parser.attribName = parser.attribValue = "";
    return;
  }

  if (parser.opt.xmlns) {
    const qn = qname(parser.attribName, true);
    const prefix = qn.prefix;
    const local = qn.local;

    if (prefix === "xmlns") {
      // namespace binding attribute. push the binding into scope
      if (local === "xml" && parser.attribValue !== XML_NAMESPACE) {
        strictFail(
          parser,
          "xml: prefix must be bound to " +
            XML_NAMESPACE +
            "\n" +
            "Actual: " +
            parser.attribValue,
        );
      } else if (local === "xmlns" && parser.attribValue !== XMLNS_NAMESPACE) {
        strictFail(
          parser,
          "xmlns: prefix must be bound to " +
            XMLNS_NAMESPACE +
            "\n" +
            "Actual: " +
            parser.attribValue,
        );
      } else {
        const tag = parser.tag;
        const parent = parser.tags[parser.tags.length - 1] || parser;
        if (tag.ns === parent.ns) {
          tag.ns = Object.create(parent.ns);
        }
        tag.ns[local] = parser.attribValue;
      }
    }

    // defer onattribute events until all attributes have been seen
    // so any new bindings can take effect. preserve attribute order
    // so deferred events can be emitted in document order
    parser.attribList.push([parser.attribName, parser.attribValue]);
  } else {
    // in non-xmlns mode, we can emit the event right away
    parser.tag.attributes[parser.attribName] = parser.attribValue;
    emitNode(parser, "onattribute", {
      name: parser.attribName,
      value: parser.attribValue,
    });
  }

  parser.attribName = parser.attribValue = "";
}

function closeTag(parser: SAXParser): void {
  if (!parser.tagName) {
    strictFail(parser, "Weird empty close tag.");
    parser.textNode += "</>";
    parser.state = STATE.TEXT;
    return;
  }

  if (parser.script) {
    if (parser.tagName !== "script") {
      parser.script += "</" + parser.tagName + ">";
      parser.tagName = "";
      parser.state = STATE.SCRIPT;
      return;
    }
    emitNode(parser, "onscript", parser.script);
    parser.script = "";
  }

  // first make sure that the closing tag actually exists.
  // <a><b></c></b></a> will close everything, otherwise.
  let t = parser.tags.length;
  let tagName = parser.tagName;
  if (!parser.strict) {
    tagName = tagName[parser.looseCase]();
  }
  const closeTo = tagName;
  while (t--) {
    const close = parser.tags[t];
    if (close.name !== closeTo) {
      // fail the first time in strict mode
      strictFail(parser, "Unexpected close tag");
    } else {
      break;
    }
  }

  // didn't find it.  we already failed for strict, so just abort.
  if (t < 0) {
    strictFail(parser, "Unmatched closing tag: " + parser.tagName);
    parser.textNode += "</" + parser.tagName + ">";
    parser.state = STATE.TEXT;
    return;
  }
  parser.tagName = tagName;
  let s = parser.tags.length;
  while (s-- > t) {
    const tag = (parser.tag = parser.tags.pop());
    parser.tagName = parser.tag.name;
    emitNode(parser, "onclosetag", parser.tagName);

    const x = {};
    for (const i in tag.ns) {
      x[i] = tag.ns[i];
    }

    const parent = parser.tags[parser.tags.length - 1] || parser;
    if (parser.opt.xmlns && tag.ns !== parent.ns) {
      // remove namespace bindings introduced by tag
      Object.keys(tag.ns).forEach(function (p) {
        const n = tag.ns[p];
        emitNode(parser, "onclosenamespace", { prefix: p, uri: n });
      });
    }
  }
  if (t === 0) parser.closedRoot = true;
  parser.tagName = parser.attribValue = parser.attribName = "";
  parser.attribList.length = 0;
  parser.state = STATE.TEXT;
}

function parseEntity(parser: SAXParser): string {
  let entity = parser.entity;
  const entityLC = entity.toLowerCase();
  let num!: number;
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

function openTag(parser: SAXParser, selfClosing?: true): void {
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
      parser.state = STATE.SCRIPT;
    } else {
      parser.state = STATE.TEXT;
    }
    parser.tag = null;
    parser.tagName = "";
  }
  parser.attribName = parser.attribValue = "";
  parser.attribList.length = 0;
}

const S = STATE;

class SAXParser {
  declare strict: boolean;
  declare opt: SAXOptions;
  declare error: Error | null;

  constructor(strict?: boolean, opt?: SAXOptions) {
    this.#init(strict, opt);
  }

  #init(strict?: boolean, opt?: SAXOptions): void {
    clearBuffers(this);

    this.q = this.c = "";
    this.bufferCheckPosition = sax.MAX_BUFFER_LENGTH;
    this.encoding = null;
    this.opt = opt || {};
    this.opt.lowercase = this.opt.lowercase || this.opt.lowercasetags;
    this.looseCase = this.opt.lowercase ? "toLowerCase" : "toUpperCase";
    this.opt.maxEntityCount = this.opt.maxEntityCount || 512;
    this.opt.maxEntityDepth = this.opt.maxEntityDepth || 4;
    this.entityCount = this.entityDepth = 0;
    this.tags = [];
    this.closed = this.closedRoot = this.sawRoot = false;
    this.tag = this.error = null;
    this.strict = !!strict;
    this.noscript = !!(strict || this.opt.noscript);
    this.state = S.BEGIN;
    this.strictEntities = this.opt.strictEntities;
    this.ENTITIES = this.strictEntities
      ? Object.create(sax.XML_ENTITIES)
      : Object.create(sax.ENTITIES);
    this.attribList = [];

    if (this.opt.xmlns) {
      this.ns = Object.create(rootNS);
    }

    if (this.opt.unquotedAttributeValues === undefined) {
      this.opt.unquotedAttributeValues = !strict;
    }

    this.trackPosition = this.opt.position !== false;
    if (this.trackPosition) {
      this.position = this.line = this.column = 0;
    }
    emit(this, "onready");
  }

  end(): this {
    if (this.sawRoot && !this.closedRoot) {
      strictFail(this, "Unclosed root tag");
    }
    if (
      this.state !== S.BEGIN &&
      this.state !== S.BEGIN_WHITESPACE &&
      this.state !== S.TEXT
    ) {
      error(this, "Unexpected end");
    }
    closeText(this);
    this.c = "";
    this.closed = true;
    emit(this, "onend");

    this.#init(this.strict, this.opt);
    return this;
  }

  write(chunk: string | null): this {
    if (this.error) {
      throw this.error;
    }
    if (this.closed) {
      return error(
        this,
        "Cannot write after close. Assign an onready handler.",
      );
    }
    if (chunk === null) {
      return this.end();
    }
    if (typeof chunk === "object") {
      chunk = chunk.toString();
    }
    let i = 0;
    let c = "";
    while (true) {
      c = charAt(chunk, i++);
      this.c = c;

      if (!c) {
        break;
      }

      if (this.trackPosition) {
        this.position++;
        if (c === "\n") {
          this.line++;
          this.column = 0;
        } else {
          this.column++;
        }
      }

      switch (this.state) {
        case S.BEGIN:
          this.state = S.BEGIN_WHITESPACE;
          if (c === "\uFEFF") {
            continue;
          }
          beginWhiteSpace(this, c);
          continue;

        case S.BEGIN_WHITESPACE:
          beginWhiteSpace(this, c);
          continue;

        case S.TEXT:
          if (this.sawRoot && !this.closedRoot) {
            const starti = i - 1;
            while (c && c !== "<" && c !== "&") {
              c = charAt(chunk, i++);
              if (c && this.trackPosition) {
                this.position++;
                if (c === "\n") {
                  this.line++;
                  this.column = 0;
                } else {
                  this.column++;
                }
              }
            }
            this.textNode += chunk.substring(starti, i - 1);
          }
          if (c === "<" && !(this.sawRoot && this.closedRoot && !this.strict)) {
            this.state = S.OPEN_WAKA;
            this.startTagPosition = this.position;
          } else {
            if (!isWhitespace(c) && (!this.sawRoot || this.closedRoot)) {
              strictFail(this, "Text data outside of root node.");
            }
            if (c === "&") {
              this.state = S.TEXT_ENTITY;
            } else {
              this.textNode += c;
            }
          }
          continue;

        case S.SCRIPT:
          if (c === "<") {
            this.state = S.SCRIPT_ENDING;
          } else {
            this.script += c;
          }
          continue;

        case S.SCRIPT_ENDING:
          if (c === "/") {
            this.state = S.CLOSE_TAG;
          } else {
            this.script += "<" + c;
            this.state = S.SCRIPT;
          }
          continue;

        case S.OPEN_WAKA:
          if (c === "!") {
            this.state = S.SGML_DECL;
            this.sgmlDecl = "";
          } else if (isWhitespace(c)) {
            // wait for it...
          } else if (isMatch(nameStart, c)) {
            this.state = S.OPEN_TAG;
            this.tagName = c;
          } else if (c === "/") {
            this.state = S.CLOSE_TAG;
            this.tagName = "";
          } else if (c === "?") {
            this.state = S.PROC_INST;
            this.procInstName = this.procInstBody = "";
          } else {
            strictFail(this, "Unencoded <");
            if (this.startTagPosition + 1 < this.position) {
              const pad = this.position - this.startTagPosition;
              c = new Array(pad).join(" ") + c;
            }
            this.textNode += "<" + c;
            this.state = S.TEXT;
          }
          continue;

        case S.SGML_DECL:
          if (this.sgmlDecl + c === "--") {
            this.state = S.COMMENT;
            this.comment = "";
            this.sgmlDecl = "";
            continue;
          }

          if (this.doctype && this.doctype !== true && this.sgmlDecl) {
            this.state = S.DOCTYPE_DTD;
            this.doctype += "<!" + this.sgmlDecl + c;
            this.sgmlDecl = "";
          } else if ((this.sgmlDecl + c).toUpperCase() === CDATA) {
            emitNode(this, "onopencdata");
            this.state = S.CDATA;
            this.sgmlDecl = "";
            this.cdata = "";
          } else if ((this.sgmlDecl + c).toUpperCase() === DOCTYPE) {
            this.state = S.DOCTYPE;
            if (this.doctype || this.sawRoot) {
              strictFail(this, "Inappropriately located doctype declaration");
            }
            this.doctype = "";
            this.sgmlDecl = "";
          } else if (c === ">") {
            emitNode(this, "onsgmldeclaration", this.sgmlDecl);
            this.sgmlDecl = "";
            this.state = S.TEXT;
          } else if (isQuote(c)) {
            this.state = S.SGML_DECL_QUOTED;
            this.sgmlDecl += c;
          } else {
            this.sgmlDecl += c;
          }
          continue;

        case S.SGML_DECL_QUOTED:
          if (c === this.q) {
            this.state = S.SGML_DECL;
            this.q = "";
          }
          this.sgmlDecl += c;
          continue;

        case S.DOCTYPE:
          if (c === ">") {
            this.state = S.TEXT;
            emitNode(this, "ondoctype", this.doctype);
            this.doctype = true;
          } else {
            this.doctype += c;
            if (c === "[") {
              this.state = S.DOCTYPE_DTD;
            } else if (isQuote(c)) {
              this.state = S.DOCTYPE_QUOTED;
              this.q = c;
            }
          }
          continue;

        case S.DOCTYPE_QUOTED:
          this.doctype += c;
          if (c === this.q) {
            this.q = "";
            this.state = S.DOCTYPE;
          }
          continue;

        case S.DOCTYPE_DTD:
          if (c === "]") {
            this.doctype += c;
            this.state = S.DOCTYPE;
          } else if (c === "<") {
            this.state = S.OPEN_WAKA;
            this.startTagPosition = this.position;
          } else if (isQuote(c)) {
            this.doctype += c;
            this.state = S.DOCTYPE_DTD_QUOTED;
            this.q = c;
          } else {
            this.doctype += c;
          }
          continue;

        case S.DOCTYPE_DTD_QUOTED:
          this.doctype += c;
          if (c === this.q) {
            this.state = S.DOCTYPE_DTD;
            this.q = "";
          }
          continue;

        case S.COMMENT:
          if (c === "-") {
            this.state = S.COMMENT_ENDING;
          } else {
            this.comment += c;
          }
          continue;

        case S.COMMENT_ENDING:
          if (c === "-") {
            this.state = S.COMMENT_ENDED;
            this.comment = textopts(this.opt, this.comment);
            if (this.comment) {
              emitNode(this, "oncomment", this.comment);
            }
            this.comment = "";
          } else {
            this.comment += "-" + c;
            this.state = S.COMMENT;
          }
          continue;

        case S.COMMENT_ENDED:
          if (c !== ">") {
            strictFail(this, "Malformed comment");
            this.comment += "--" + c;
            this.state = S.COMMENT;
          } else if (this.doctype && this.doctype !== true) {
            this.state = S.DOCTYPE_DTD;
          } else {
            this.state = S.TEXT;
          }
          continue;

        case S.CDATA:
          const starti = i - 1;
          while (c && c !== "]") {
            c = charAt(chunk, i++);
            if (c && this.trackPosition) {
              this.position++;
              if (c === "\n") {
                this.line++;
                this.column = 0;
              } else {
                this.column++;
              }
            }
          }
          this.cdata += chunk.substring(starti, i - 1);
          if (c === "]") {
            this.state = S.CDATA_ENDING;
          }
          continue;

        case S.CDATA_ENDING:
          if (c === "]") {
            this.state = S.CDATA_ENDING_2;
          } else {
            this.cdata += "]" + c;
            this.state = S.CDATA;
          }
          continue;

        case S.CDATA_ENDING_2:
          if (c === ">") {
            if (this.cdata) {
              emitNode(this, "oncdata", this.cdata);
            }
            emitNode(this, "onclosecdata");
            this.cdata = "";
            this.state = S.TEXT;
          } else if (c === "]") {
            this.cdata += "]";
          } else {
            this.cdata += "]]" + c;
            this.state = S.CDATA;
          }
          continue;

        case S.PROC_INST:
          if (c === "?") {
            this.state = S.PROC_INST_ENDING;
          } else if (isWhitespace(c)) {
            this.state = S.PROC_INST_BODY;
          } else {
            this.procInstName += c;
          }
          continue;

        case S.PROC_INST_BODY:
          if (!this.procInstBody && isWhitespace(c)) {
            continue;
          } else if (c === "?") {
            this.state = S.PROC_INST_ENDING;
          } else {
            this.procInstBody += c;
          }
          continue;

        case S.PROC_INST_ENDING:
          if (c === ">") {
            const procInstEndData = {
              name: this.procInstName,
              body: this.procInstBody,
            };
            validateXmlDeclarationEncoding(this, procInstEndData);
            emitNode(this, "onprocessinginstruction", procInstEndData);
            this.procInstName = this.procInstBody = "";
            this.state = S.TEXT;
          } else {
            this.procInstBody += "?" + c;
            this.state = S.PROC_INST_BODY;
          }
          continue;

        case S.OPEN_TAG:
          if (isMatch(nameBody, c)) {
            this.tagName += c;
          } else {
            newTag(this);
            if (c === ">") {
              openTag(this);
            } else if (c === "/") {
              this.state = S.OPEN_TAG_SLASH;
            } else {
              if (!isWhitespace(c)) {
                strictFail(this, "Invalid character in tag name");
              }
              this.state = S.ATTRIB;
            }
          }
          continue;

        case S.OPEN_TAG_SLASH:
          if (c === ">") {
            openTag(this, true);
            closeTag(this);
          } else {
            strictFail(this, "Forward-slash in opening tag not followed by >");
            this.state = S.ATTRIB;
          }
          continue;

        case S.ATTRIB:
          if (isWhitespace(c)) {
            continue;
          } else if (c === ">") {
            openTag(this);
          } else if (c === "/") {
            this.state = S.OPEN_TAG_SLASH;
          } else if (isMatch(nameStart, c)) {
            this.attribName = c;
            this.attribValue = "";
            this.state = S.ATTRIB_NAME;
          } else {
            strictFail(this, "Invalid attribute name");
          }
          continue;

        case S.ATTRIB_NAME:
          if (c === "=") {
            this.state = S.ATTRIB_VALUE;
          } else if (c === ">") {
            strictFail(this, "Attribute without value");
            this.attribValue = this.attribName;
            attrib(this);
            openTag(this);
          } else if (isWhitespace(c)) {
            this.state = S.ATTRIB_NAME_SAW_WHITE;
          } else if (isMatch(nameBody, c)) {
            this.attribName += c;
          } else {
            strictFail(this, "Invalid attribute name");
          }
          continue;

        case S.ATTRIB_NAME_SAW_WHITE:
          if (c === "=") {
            this.state = S.ATTRIB_VALUE;
          } else if (isWhitespace(c)) {
            continue;
          } else {
            strictFail(this, "Attribute without value");
            this.tag.attributes[this.attribName] = "";
            this.attribValue = "";
            emitNode(this, "onattribute", {
              name: this.attribName,
              value: "",
            });
            this.attribName = "";
            if (c === ">") {
              openTag(this);
            } else if (isMatch(nameStart, c)) {
              this.attribName = c;
              this.state = S.ATTRIB_NAME;
            } else {
              strictFail(this, "Invalid attribute name");
              this.state = S.ATTRIB;
            }
          }
          this.continue;

        case S.ATTRIB_VALUE:
          if (isWhitespace(c)) {
            continue;
          } else if (isQuote(c)) {
            this.q = c;
            this.state = S.ATTRIB_VALUE_QUOTED;
          } else {
            if (!this.opt.unquotedAttributeValues) {
              error(this, "Unquoted attribute value");
            }
            this.state = S.ATTRIB_VALUE_UNQUOTED;
            this.attribValue = c;
          }
          continue;

        case S.ATTRIB_VALUE_QUOTED:
          if (c !== this.q) {
            if (c === "&") {
              this.state = S.ATTRIB_VALUE_ENTITY_Q;
            } else {
              this.attribValue += c;
            }
            continue;
          }
          attrib(this);
          this.q = "";
          this.state = S.ATTRIB_VALUE_CLOSED;
          continue;

        case S.ATTRIB_VALUE_CLOSED:
          if (isWhitespace(c)) {
            this.state = S.ATTRIB;
          } else if (c === ">") {
            openTag(this);
          } else if (c === "/") {
            this.state = S.OPEN_TAG_SLASH;
          } else if (isMatch(nameStart, c)) {
            strictFail(this, "No whitespace between attributes");
            this.attribName = c;
            this.attribValue = "";
            this.state = S.ATTRIB_NAME;
          } else {
            strictFail(this, "Invalid attribute name");
          }
          continue;

        case S.ATTRIB_VALUE_UNQUOTED:
          if (!isAttribEnd(c)) {
            if (c === "&") {
              this.state = S.ATTRIB_VALUE_ENTITY_U;
            } else {
              this.attribValue += c;
            }
            continue;
          }
          attrib(this);
          if (c === ">") {
            openTag(this);
          } else {
            this.state = S.ATTRIB;
          }
          continue;

        case S.CLOSE_TAG:
          if (!this.tagName) {
            if (isWhitespace(c)) {
              continue;
            } else if (notMatch(nameStart, c)) {
              if (this.script) {
                this.script += "</" + c;
                this.state = S.SCRIPT;
              } else {
                strictFail(this, "Invalid tagname in closing tag.");
              }
            } else {
              this.tagName = c;
            }
          } else if (c === ">") {
            closeTag(this);
          } else if (isMatch(nameBody, c)) {
            this.tagName += c;
          } else if (this.script) {
            this.script += "</" + this.tagName + c;
            this.tagName = "";
            this.state = S.SCRIPT;
          } else {
            if (!isWhitespace(c)) {
              strictFail(this, "Invalid tagname in closing tag");
            }
            this.state = S.CLOSE_TAG_SAW_WHITE;
          }
          continue;

        case S.CLOSE_TAG_SAW_WHITE:
          if (isWhitespace(c)) {
            continue;
          }
          if (c === ">") {
            closeTag(this);
          } else {
            strictFail(this, "Invalid characters in closing tag");
          }
          continue;

        case S.TEXT_ENTITY:
        case S.ATTRIB_VALUE_ENTITY_Q:
        case S.ATTRIB_VALUE_ENTITY_U:
          let returnState;
          let buffer;
          switch (this.state) {
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
            const parsedEntity = parseEntity(this);
            if (
              this.opt.unparsedEntities &&
              !Object.values(sax.XML_ENTITIES).includes(parsedEntity)
            ) {
              if ((this.entityCount += 1) > this.opt.maxEntityCount) {
                error(this, "Parsed entity count exceeds max entity count");
              }

              if ((this.entityDepth += 1) > this.opt.maxEntityDepth) {
                error(this, "Parsed entity depth exceeds max entity depth");
              }

              this.entity = "";
              this.state = returnState;
              this.write(parsedEntity);
              this.entityDepth -= 1;
            } else {
              this[buffer] += parsedEntity;
              this.entity = "";
              this.state = returnState;
            }
          } else if (
            isMatch(this.entity.length ? entityBody : entityStart, c)
          ) {
            this.entity += c;
          } else {
            strictFail(this, "Invalid character in entity name");
            this[buffer] += "&" + this.entity + c;
            this.entity = "";
            this.state = returnState;
          }

          continue;

        default: /* istanbul ignore next */ {
          throw new Error(this, "Unknown state: " + this.state);
        }
      }
    } // while

    if (this.position >= this.bufferCheckPosition) {
      checkBufferLength(this, sax.MAX_BUFFER_LENGTH);
    }
    return this;
  }

  resume(): this {
    this.error = null;
    return this;
  }

  close(): this {
    return this.write(null);
  }

  flush(): void {
    flushBuffers(this);
  }
}

export { SAXParser };
