import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const logic = require("../demo-logic.js");
const root = fileURLToPath(new URL("..", import.meta.url));

test("new manual creator has zero content metrics and no engagement metrics", () => {
  const metrics = logic.buildBloggerMetrics({ assets: [{ id: "A1", highlights: [{ id: "H1" }] }], items: [], isManualNew: true });
  assert.equal(metrics.programs, 1);
  assert.deepEqual([metrics.generated, metrics.approved, metrics.pending], [0, 0, 0]);
  assert.deepEqual([metrics.followers, metrics.views, metrics.likes], [null, null, null]);
});

test("selected topics define output count and independent settings", () => {
  const settings = logic.prepareTopicBatch([{ title: "一", duration: 90, relatedIds: ["A1"] }, { title: "二", duration: 180, relatedIds: ["A2", "A3"] }]);
  assert.equal(settings.count, 2);
  assert.deepEqual(settings.selectedTopics.map((topic) => [topic.duration, topic.relatedIds]), [[90, ["A1"]], [180, ["A2", "A3"]]]);
});

test("drafts are approved independently and only the last approval completes review", () => {
  const first = logic.reviewDraft([{ id: "1", approved: false }, { id: "2", approved: false }], "1", true);
  assert.deepEqual(first.drafts.map((draft) => draft.approved), [true, false]);
  assert.equal(first.allApproved, false);
  assert.equal(logic.reviewDraft(first.drafts, "2", true).allApproved, true);
});

test("topic materials are remapped to each creator content pool", () => {
  const settings = logic.prepareTopicBatch([
    { title: "一", duration: 90, relatedIds: ["A1", "A2"] },
    { title: "二", duration: 180, relatedIds: ["A2"] },
  ]);
  const remapped = logic.remapTopicBatchForPool(settings, ["B7", "B8", "B9"]);
  assert.deepEqual(remapped.selectedTopics.map((topic) => topic.relatedIds), [["B7", "B8", "B9"], ["B7", "B8", "B9"]]);
});

test("unique highlights are allocated even when topic ranges overlap", () => {
  const topics = [
    { title: "宽范围", relatedIds: ["A1", "A2"] },
    { title: "窄范围", relatedIds: ["A1"] },
  ];
  const clips = [
    { asset: { id: "A1" }, highlight: { id: "H1" } },
    { asset: { id: "A2" }, highlight: { id: "H2" } },
  ];
  const assigned = logic.assignUniqueClips(topics, clips);
  assert.equal(assigned[0].asset.id, "A2");
  assert.equal(assigned[1].asset.id, "A1");
});

test("browser files are valid JavaScript", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", `${root}/app.js`], { stdio: "pipe" }));
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", `${root}/demo-logic.js`], { stdio: "pipe" }));
});

test("content operations keeps every blogger available in the monitor switcher", () => {
  const app = readFileSync(`${root}/app.js`, "utf8");
  assert.match(app, /const operationalAvatarWorkspaces = state\.screen === "library" \? \[\] : avatarWorkspaces;/);
});

test("content library is independent from the blogger monitor switcher", () => {
  const app = readFileSync(`${root}/app.js`, "utf8");
  assert.match(app, /!\["dashboard", "bloggers", "creator", "library"\]\.includes\(state\.screen\)/);
});

test("content library presents a time-ordered operational list", () => {
  const app = readFileSync(`${root}/app.js`, "utf8");
  assert.match(app, /content-library-list/);
  assert.match(app, /\u5BA1\u6838\u5B8C\u6210\u65F6\u95F4/);
  assert.match(app, /\u5173\u8054\u8282\u76EE\u6570/);
  assert.match(app, /\u4E0A\u7EBF/);
});

test("review is approved one item at a time without a batch approve footer", () => {
  const app = readFileSync(`${root}/app.js`, "utf8");
  assert.doesNotMatch(app, /onBulk\(validSelected\)/);
});
