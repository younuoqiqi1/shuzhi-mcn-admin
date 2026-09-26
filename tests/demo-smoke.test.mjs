import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("demo exposes the 1-3 topic selection path", () => {
  assert.match(app, /const countChoices = \[1, 2, 3\]/);
  assert.match(app, /topic-suggestion-grid/);
  assert.ok(app.includes(String.raw`\u4ECA\u65E5\u9009\u9898`));
});

test("script review is read-only and shows multi-program context", () => {
  assert.match(app, /readOnly: true/);
  assert.match(app, /related-programs/);
  assert.match(app, /script-cover-preview/);
  assert.ok(app.includes(String.raw`\u751F\u6210\u9010\u955C\u811A\u672C`));
});

test("blogger cards expose static operating metrics", () => {
  assert.match(app, /followers: seed \* 12860/);
  assert.match(app, /blogger-effect-stats/);
  assert.match(css, /\.blogger-effect-stats/);
});
