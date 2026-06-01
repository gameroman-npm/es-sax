import assert from "node:assert";
import { test } from "node:test";

import sax from "es-sax";

/**
 * @fileoverview
 * See: https://en.wikipedia.org/wiki/Billion_laughs_attack
 */

var ENTITIES = {
  lol: "lolz",
  lol1: "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;",
  lol2: "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;",
  lol3: "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;",
  lol4: "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;",
  lol5: "&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;",
  lol6: "&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;",
  lol7: "&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;",
  lol8: "&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;",
  lol9: "&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;",
};

var BODY =
  '<?xml version="1.0"?><!DOCTYPE lolz [<!ELEMENT lolz (#PCDATA)>]><lolz>&lol9;</lolz>';

for (var strictMode of [true, false]) {
  const modeLabel = strictMode ? "[Strict]" : "[Loose]";

  test(`${modeLabel} should not throw on billion laughs with unparsed entities disabled`, () => {
    var parser = sax.parser(strictMode);
    parser.ENTITIES = { ...parser.ENTITIES, ...ENTITIES };

    assert.doesNotThrow(() => {
      parser.write(BODY).close();
    });
  });

  test(`${modeLabel} should count number of entities including nested entities`, () => {
    var parser = sax.parser(strictMode, {
      unparsedEntities: true,
    });
    parser.ENTITIES = { ...parser.ENTITIES, ...ENTITIES };

    parser.write(
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ELEMENT lolz (#PCDATA)>]><lolz>&lol2;</lolz>',
    );

    assert.strictEqual(parser.entityCount, 111);
    parser.close();
  });

  test(`${modeLabel} should count depth of entities correctly`, () => {
    var parser = sax.parser(strictMode, {
      unparsedEntities: true,
      maxEntityDepth: 3,
    });

    assert.doesNotThrow(() => {
      parser.ENTITIES = { ...parser.ENTITIES, ...ENTITIES };
      parser
        .write(
          '<?xml version="1.0"?><!DOCTYPE lolz [<!ELEMENT lolz (#PCDATA)>]><lolz>&lol2;</lolz>',
        )
        .close();
    });

    assert.throws(
      () => {
        parser.ENTITIES = { ...parser.ENTITIES, ...ENTITIES };
        parser.write(
          '<?xml version="1.0"?><!DOCTYPE lolz [<!ELEMENT lolz (#PCDATA)>]><lolz>&lol3;</lolz>',
        );
      },
      {
        message: /^Parsed entity depth exceeds max entity depth/,
      },
    );
  });

  test(`${modeLabel} should throw on billion laughs with only entity count check`, () => {
    var parser = sax.parser(strictMode, {
      unparsedEntities: true,
      maxEntityDepth: Number.MAX_SAFE_INTEGER,
    });
    parser.ENTITIES = { ...parser.ENTITIES, ...ENTITIES };

    assert.throws(
      () => {
        parser.write(BODY);
      },
      {
        message: /^Parsed entity count exceeds max entity count/,
      },
    );
  });

  test(`${modeLabel} should throw on billion laughs with only entity depth check`, () => {
    var parser = sax.parser(strictMode, {
      unparsedEntities: true,
      maxEntityCount: Number.MAX_SAFE_INTEGER,
    });
    parser.ENTITIES = { ...parser.ENTITIES, ...ENTITIES };

    assert.throws(
      () => {
        parser.write(BODY);
      },
      {
        message: /^Parsed entity depth exceeds max entity depth/,
      },
    );
  });
}
