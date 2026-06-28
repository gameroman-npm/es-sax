import { test } from "./index.ts";

const invalidEntities = ["1114112", "-1", "NaN"];

for (const invalidEntitiy of invalidEntities) {
  test({
    xml: `<r>&#${invalidEntitiy};</r>`,
    strict: false,
    expect: [
      ["opentagstart", { name: "R", attributes: {} }],
      ["opentag", { name: "R", attributes: {}, isSelfClosing: false }],
      ["text", `&#${invalidEntitiy};`],
      ["closetag", "R"],
    ],
  });
  test({
    xml: `<r>&#${invalidEntitiy};</r>`,
    strict: true,
    expect: [
      ["opentagstart", { name: "r", attributes: {} }],
      ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
      [
        "error",
        `Invalid character entity\nLine: 0\nColumn: ${
          6 + invalidEntitiy.length
        }\nChar: ;`,
      ],
      ["text", `&#${invalidEntitiy};`],
      ["closetag", "r"],
    ],
  });
}
