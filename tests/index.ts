import assert from "node:assert";
import { test as nodeTest } from "node:test";

import sax from "es-sax";

interface TestOptions {
  xml?: string;
  strict?: boolean;
  expect: unknown[];
  opt?: unknown;
}

function test(options: TestOptions) {
  var xml = options.xml;
  var parser = sax.parser(options.strict, options.opt);
  var expect = options.expect;
  var e = 0;

  nodeTest(() => {
    sax.EVENTS.forEach(function (ev) {
      parser["on" + ev] = function (n) {
        if (process.env.DEBUG) {
          console.error({ expect: expect[e], actual: [ev, n] });
        }

        if (e >= expect.length && (ev === "end" || ev === "ready")) {
          return;
        }
        assert.ok(e < expect.length, "no unexpected events");

        if (!expect[e]) {
          assert.fail(
            `did not expect this event. Event: ${ev}, Data: ${JSON.stringify(n)}`,
          );
        }

        assert.strictEqual(ev, expect[e][0]);

        if (ev === "error") {
          assert.strictEqual(n.message, expect[e][1]);
        } else {
          assert.deepStrictEqual(n, expect[e][1]);
        }

        e++;
        if (ev === "error") {
          parser.resume();
        }
      };
    });

    if (xml) {
      parser.write(xml).close();
    }
  });

  return parser;
}

export { test };
