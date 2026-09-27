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
  assert.ok(app.includes("const avatarWorkspaces = workspaces;"), "creator order is independent of the active selection");
  assert.ok(app.includes("const operationalAvatarWorkspaces = state.screen === \"library\" ? [] : productionTargets.slice(0, 5);"), "only the active maximum-five roster appears in content operations");
  assert.ok(app.includes("monitorBlogger(w.blogger.id)"), "avatar click monitors that creator's workflow");
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
  const styles = readFileSync(`${root}/styles.css`, "utf8");
  assert.ok(styles.includes(".content-library-main .poster{height:auto;aspect-ratio:16/9;min-height:0}"));
});

test("review is approved one item at a time without a batch approve footer", () => {
  const app = readFileSync(`${root}/app.js`, "utf8");
  assert.doesNotMatch(app, /onBulk\(validSelected\)/);
});

test("production monitor reports waiting scripts and per-item video progress", () => {
  const summary = logic.buildProductionMonitorSummary({
    workspace: {
      topicDrafts: [
        { id: "TD1", title: "待审核脚本", approved: false },
        { id: "TD2", title: "已通过脚本", approved: true },
      ],
      job: { kind: "video", startedAt: 1000, drafts: [{ id: "TD2", title: "制作中内容" }] },
    },
    now: 4750,
    durationMs: 7500,
  });
  assert.equal(summary.waiting.length, 1);
  assert.equal(summary.waiting[0].title, "待审核脚本");
  assert.equal(summary.producing.length, 1);
  assert.equal(summary.producing[0].progress, 50);
  const app = readFileSync(`${root}/app.js`, "utf8");
  assert.ok(app.includes("待生产内容列表"));
  assert.ok(app.includes("生产中内容列表"));
  assert.ok(app.includes("entry.progress, \"%\""));
});

test("fallback creator avatars use bundled atlas art when portrait files are unavailable", () => {
  const app = readFileSync(`${root}/app.js`, "utf8");
  assert.match(app, /person\.avatar \|\| \{\s*style: AVATAR_STYLES\[0\]/);
  assert.doesNotMatch(app, /!\(\!a \|\| failed\) &&/);
});

test("script generation creates narration drafts and moves directly to script review", () => {
  const app = readFileSync(`${root}/app.js`, "utf8");
  const generation = app.slice(app.indexOf("function generateDrafts"), app.indexOf("function updateDraft"));
  assert.ok(generation.includes("script: `${item.script}"), "complete narration copy is stored on each generated topic draft");
  assert.ok(generation.includes('screen: "script-review"'), "generation goes straight to individual script review");
  assert.ok(app.includes("生成脚本与口播台词"), "the action describes automatic script and narration generation");
});
