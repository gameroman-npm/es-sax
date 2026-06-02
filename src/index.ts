import sax from "./sax";
export type {
  SAXOptions,
  BaseTag,
  QualifiedAttribute,
  QualifiedName,
  QualifiedTag,
  Tag,
} from "./types";

export default sax;
export { SAXStream } from "./stream";
export { SAXParser } from "./parser";
export { createStream } from "./sax";
