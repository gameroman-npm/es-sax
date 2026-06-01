import { buffers } from "./constants";
import { textopts } from "./util";

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

export {
  checkBufferLength,
  clearBuffers,
  closeText,
  emit,
  emitNode,
  error,
  newTag,
  flushBuffers,
};
