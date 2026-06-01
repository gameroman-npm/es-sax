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

export { clearBuffers, closeText, emit, emitNode, error, newTag, flushBuffers };
