function determineBufferEncoding(
  data: Buffer,
  isEnd: boolean,
): "utf-16le" | "utf-16be" | "utf8" | null {
  // BOM-based detection is the most reliable signal when present.
  if (data.length >= 2) {
    if (data[0] === 0xff && data[1] === 0xfe) {
      return "utf-16le";
    }

    if (data[0] === 0xfe && data[1] === 0xff) {
      return "utf-16be";
    }
  }

  if (
    data.length >= 3 &&
    data[0] === 0xef &&
    data[1] === 0xbb &&
    data[2] === 0xbf
  ) {
    return "utf8";
  }

  if (data.length >= 4) {
    // XML documents without a BOM still start with "<?xml", which is enough
    // to distinguish UTF-16LE/BE from UTF-8 by looking at the zero bytes.
    if (
      data[0] === 0x3c &&
      data[1] === 0x00 &&
      data[2] === 0x3f &&
      data[3] === 0x00
    ) {
      return "utf-16le";
    }

    if (
      data[0] === 0x00 &&
      data[1] === 0x3c &&
      data[2] === 0x00 &&
      data[3] === 0x3f
    ) {
      return "utf-16be";
    }

    return "utf8";
  }

  return isEnd ? "utf8" : null;
}

function normalizeEncodingName(encoding?: string): string | null {
  if (!encoding) {
    return null;
  }

  return encoding.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function textopts(
  opt: { trim: boolean; normalize: boolean },
  text: string,
): string {
  if (opt.trim) text = text.trim();
  if (opt.normalize) text = text.replace(/\s+/g, " ");
  return text;
}

function qname(
  name: string,
  attribute?: true,
): { prefix: string | undefined; local: string | undefined } {
  const i = name.indexOf(":");
  const qualName = i < 0 ? ["", name] : name.split(":");
  let prefix = qualName[0];
  let local = qualName[1];

  // <x "xmlns"="http://foo">
  if (attribute && name === "xmlns") {
    prefix = "xmlns";
    local = "";
  }

  return { prefix, local };
}

function isWhitespace(c: string): c is " " | "\n" | "\r" | "\t" {
  return c === " " || c === "\n" || c === "\r" || c === "\t";
}

function isQuote(c: string): c is '"' | "'" {
  return c === '"' || c === "'";
}

function isAttribEnd(c: string): c is ">" | "\n" | " " | "\r" | "\t" {
  return c === ">" || isWhitespace(c);
}

function isMatch(regex: RegExp, c: string): boolean {
  return regex.test(c);
}

function notMatch(regex: RegExp, c: string): boolean {
  return !isMatch(regex, c);
}

function getDeclaredEncoding(body: string): string | null | undefined {
  const match = body && body.match(/(?:^|\s)encoding\s*=\s*(['"])([^'"]+)\1/i);
  return match ? match[2] : null;
}

function charAt(chunk: string, i: number): string {
  let result = "";
  if (i < chunk.length) {
    result = chunk.charAt(i);
  }
  return result;
}

function encodingsMatch(
  detectedEncoding?: string,
  declaredEncoding?: string,
): boolean {
  const detected = normalizeEncodingName(detectedEncoding);
  const declared = normalizeEncodingName(declaredEncoding);

  if (!detected || !declared) {
    return true;
  }

  if (declared === "utf16") {
    return detected === "utf16le" || detected === "utf16be";
  }

  return detected === declared;
}

export {
  charAt,
  determineBufferEncoding,
  encodingsMatch,
  getDeclaredEncoding,
  isAttribEnd,
  isMatch,
  isQuote,
  isWhitespace,
  notMatch,
  qname,
  textopts,
};
