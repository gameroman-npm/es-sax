import { buffers, XML_NAMESPACE, XMLNS_NAMESPACE } from "./constants";
import { STATE } from "./state";
import {
  encodingsMatch,
  getDeclaredEncoding,
  isWhitespace,
  qname,
  textopts,
} from "./util";

function emit(parser, event, data?): void {
  parser[event]?.(data);
}

function closeText(parser): void {
  parser.textNode = textopts(parser.opt, parser.textNode);
  if (parser.textNode) emit(parser, "ontext", parser.textNode);
  parser.textNode = "";
}

function emitNode(parser, nodeType, data?): void {
  if (parser.textNode) closeText(parser);
  emit(parser, nodeType, data);
}

function newTag(parser): void {
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

function error(parser, er) {
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

function clearBuffers(parser): void {
  for (const buf of buffers) {
    parser[buf] = "";
  }
}

function flushBuffers(parser): void {
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

function checkBufferLength(parser, MAX_BUFFER_LENGTH: number): void {
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

function strictFail(parser, message): void {
  if (parser.strict) {
    error(parser, message);
  }
}

function validateXmlDeclarationEncoding(parser, data): void {
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

function beginWhiteSpace(parser, c): void {
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

function attrib(parser): void {
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

function closeTag(parser): void {
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

export {
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
};
