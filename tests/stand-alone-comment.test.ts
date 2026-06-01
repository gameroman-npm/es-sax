import { test } from "./index.ts";

// https://github.com/isaacs/sax-js/issues/124
test({
  xml: "<!-- stand alone comment -->",
  expect: [["comment", " stand alone comment "]],
  strict: true,
  opt: {},
});
