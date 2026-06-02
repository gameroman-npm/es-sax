interface SAXOptions {
  trim?: boolean | undefined;
  normalize?: boolean | undefined;
  lowercase?: boolean | undefined;
  xmlns?: boolean | undefined;
  noscript?: boolean | undefined;
  position?: boolean | undefined;
}

interface QualifiedName {
  name: string;
  prefix: string;
  local: string;
  uri: string;
}

interface QualifiedAttribute extends QualifiedName {
  value: string;
}

interface BaseTag {
  name: string;
  isSelfClosing: boolean;
}

interface QualifiedTag extends QualifiedName, BaseTag {
  ns: { [key: string]: string };
  attributes: { [key: string]: QualifiedAttribute };
}

interface Tag extends BaseTag {
  attributes: { [key: string]: string };
}

export type {
  SAXOptions,
  BaseTag,
  QualifiedAttribute,
  QualifiedName,
  QualifiedTag,
  Tag,
};
