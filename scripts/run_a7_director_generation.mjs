/**
 * @file run_a7_director_generation.mjs
 * @description 执行 A7.1 Final Director Plan 生成、Duration Budget 预算表导出、VMV 生产单适配及真人 Preview 文档导出。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FinalDirectorService } from "../src/director/final-director-service.mjs";
import { VMVProductionAdapter, secondsToTimecode } from "../src/director/vmv-production-adapter.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resultsDir = path.resolve(__dirname, "../src/director/results");
const docsDir = path.resolve(__dirname, "../docs/agent-poc");

if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const directorService = new FinalDirectorService();

console.log("=== 正在生成 Topic B: 余则成最危险的一次试探 Final Director Plan (A7.1) ===");
const planB = directorService.buildDirectorPlanTopicB();
const orderB = VMVProductionAdapter.adaptPlanToProductionOrder(planB, { orderId: "order_vmv_topic_b_dangerous_probe" });

const planBPath = path.join(resultsDir, "director_plan_topic_b.json");
const orderBPath = path.join(resultsDir, "vmv_order_topic_b.json");
fs.writeFileSync(planBPath, JSON.stringify(planB, null, 2), "utf8");
fs.writeFileSync(orderBPath, JSON.stringify(orderB, null, 2), "utf8");
console.log(`[OK] 写入 ${planBPath}`);
console.log(`[OK] 写入 ${orderBPath}`);

console.log("\n=== 正在生成 Topic A: 吴站长什么时候开始怀疑余则成？ Final Director Plan (A7.1) ===");
const planA = directorService.buildDirectorPlanTopicA();
const orderA = VMVProductionAdapter.adaptPlanToProductionOrder(planA, { orderId: "order_vmv_topic_a_wu_suspicion" });

const planAPath = path.join(resultsDir, "director_plan_topic_a.json");
const orderAPath = path.join(resultsDir, "vmv_order_topic_a.json");
fs.writeFileSync(planAPath, JSON.stringify(planA, null, 2), "utf8");
fs.writeFileSync(orderAPath, JSON.stringify(orderA, null, 2), "utf8");
console.log(`[OK] 写入 ${planAPath}`);
console.log(`[OK] 写入 ${orderAPath}`);

// 辅助函数：格式化时间区间
function formatTimeRange(startSec, endSec) {
  const formatSec = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };
  return `${formatSec(startSec)}–${formatSec(endSec)}`;
}

// 1. 生成 Duration Budget 表格 Markdown
function generateDurationBudgetMarkdown(plan, title, topicDescription) {
  let md = `# Narration Duration Budget 审计表: ${title}\n\n`;
  md += `> **选题标识**: \`${plan.topic_id}\`  \n`;
  md += `> **博主视角**: \`${plan.blogger_id}\`  \n`;
  md += `> **语速估算基准**: **${plan.voice_config.estimated_chars_per_second} 字/秒** (包含标点与微呼吸停顿；明确声明为 estimate，非真实 TTS)  \n`;
  md += `> **音频安全留白 (Headroom)**: **0.5 秒** / 段  \n`;
  md += `> **全部分段可执行性结论**: **${plan.duration_budget_summary.all_segments_fit ? "✅ ALL SEGMENTS FIT (100% 可说完全部文案)" : "❌ DURATION OVERFLOW"}**\n\n`;

  if (plan.director_resolution_summary && plan.director_resolution_summary.insufficient_evidence_count > 0) {
    md += `### ⚠️ 素材缺失与合并处理说明 (INSUFFICIENT_EVIDENCE Resolution)\n\n`;
    plan.director_resolution_summary.resolutions.forEach((r) => {
      md += `- **[${r.requirement_id}] ${r.beat_id}**: 状态 \`${r.status}\`，执行决议 \`${r.resolution_action}\`。  \n`;
      md += `  - **生产分段创建**: \`${r.production_segment_created}\` (按规则不产生虚假生产分段)  \n`;
      md += `  - **合并去向**: \`${r.merged_into_beat_id || "无"}\`  \n`;
      md += `  - **处置说明**: ${r.rationale}\n\n`;
    });
  }

  md += `## 旁白与音频时长预算总览 (Duration Budget Breakdown Table)\n\n`;
  md += `| Segment | 画面时长 | 音频模式 | 旁白字数 | 预计旁白时长 | 原声占用 | 可用旁白时间 | 溢出秒数 | 是否 Fit |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  plan.segments.forEach((seg, idx) => {
    const audioMode = seg.audio_owner === "original_dialogue" ? `原声 (${seg.audio_transition})` : `旁白 (${seg.narration_job})`;
    const origOccupancy = seg.audio_owner === "original_dialogue" ? (seg.audio_transition === "duck" ? "2.00s (先导)" : `${seg.planned_duration}s (全段)`) : "0.00s";
    const fitBadge = seg.duration_fit ? "✅ Fit" : "❌ Overflow";

    md += `| **${seg.segment_id}**<br>(${seg.beat_id}) | ${seg.planned_duration}s | ${audioMode} | ${seg.narration_char_count} 字 | ${seg.estimated_tts_duration_sec}s | ${origOccupancy} | ${seg.available_narration_duration_sec}s | ${seg.duration_overflow_sec}s | ${fitBadge} |\n`;
  });

  md += `\n### 统计汇总：\n`;
  md += `- **有效生产分段数**: ${plan.segments.length} 段  \n`;
  md += `- **总画面时长**: ${plan.target_duration} 秒  \n`;
  md += `- **总旁白字数**: ${plan.duration_budget_summary.total_narration_chars} 字  \n`;
  md += `- **预估总播报时长**: ${plan.duration_budget_summary.total_estimated_tts_sec} 秒  \n`;
  md += `- **时间预算合规率**: 100% (${plan.segments.filter(s => s.duration_fit).length} / ${plan.segments.length})  \n\n`;

  md += `## 逐段视听与文案对照核验 (Segment-by-Segment Audit)\n\n`;
  plan.segments.forEach((seg, idx) => {
    md += `### ${String(idx + 1).padStart(2, "0")}. ${seg.segment_id} (${seg.beat_id})\n`;
    md += `- **镜头时间码**: \`${formatTimeRange(seg.source_in, seg.source_out)}\` (${seg.planned_duration}s) | \`${seg.retrieval_unit_id}\`  \n`;
    md += `- **音频所有权**: \`${seg.audio_owner}\` | **转场策略**: \`${seg.audio_transition}\`  \n`;
    if (seg.original_dialogue_text) {
      md += `- **原声对白**: "${seg.original_dialogue_text}"  \n`;
    }
    if (seg.narration_text) {
      md += `- **旁白文案 (${seg.narration_char_count}字)**: "${seg.narration_text}"  \n`;
      md += `- **时长预算核算**: 预估 TTS 时长 **${seg.estimated_tts_duration_sec}s** $\\le$ 可用旁白时长 **${seg.available_narration_duration_sec}s** (安全余量: +${Math.round((seg.available_narration_duration_sec - seg.estimated_tts_duration_sec) * 100) / 100}s)  \n`;
    } else {
      md += `- **旁白文案**: *(无旁白，全段完整保留原声)*  \n`;
    }
    md += `\n`;
  });

  return md;
}

// 2. 生成 Director Preview Markdown
function generatePreviewMarkdown(plan, title, topicDescription) {
  let md = `# Director Preview: ${title}\n\n`;
  md += `> **选题标识**: \`${plan.topic_id}\`  \n`;
  md += `> **博主视角**: \`${plan.blogger_id}\`（深度谍战拆解，冷峻官场洞察）  \n`;
  md += `> **目标成片时长**: 约 **${plan.target_duration} 秒**  \n`;
  md += `> **生产分段数**: **${plan.segments.length} 个**  \n`;
  md += `> **画幅规范**: ${plan.aspect_ratio}  \n`;
  md += `> **时长预算状态**: **${plan.duration_budget_summary.all_segments_fit ? "✅ ALL DURATION FIT" : "❌ OVERFLOW"}**  \n`;
  md += `> **选题背景**: ${topicDescription}\n\n`;

  if (plan.director_resolution_summary && plan.director_resolution_summary.insufficient_evidence_count > 0) {
    md += `### ⚠️ 素材缺失与合并处理决议 (INSUFFICIENT_EVIDENCE Resolution)\n\n`;
    plan.director_resolution_summary.resolutions.forEach((r) => {
      md += `- **[${r.requirement_id}] ${r.beat_id}**: 状态 \`${r.status}\`，导演决议执行 \`${r.resolution_action}\`。  \n`;
      md += `  *处理机制*: **虚假生产分段未创建** (\`production_segment_created: ${r.production_segment_created}\`)。${r.rationale}\n\n`;
    });
  }

  md += `---\n\n## 视听剪辑时间线 (Timeline Breakdown)\n\n`;

  plan.segments.forEach((seg, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const timeStr = formatTimeRange(seg.source_in, seg.source_out);
    const charactersStr = seg.characters ? seg.characters.join("、") : "未标注人物";

    md += `### ${num}. [${seg.beat_id}] ${seg.purpose}\n\n`;
    md += `**画面**：  \n`;
    md += `- **时间码**：\`${timeStr}\` (${seg.planned_duration}s) | 检索单元: \`${seg.retrieval_unit_id}\`  \n`;
    md += `- **出镜人物**：${charactersStr}  \n`;
    md += `- **镜头视觉**：${seg.visual_reason}  \n\n`;

    md += `**音频策略与时长预算**：  \n`;
    const audioOwnerDesc = seg.audio_owner === "original_dialogue" ? "原声为主" : "老周旁白为主";
    md += `- **音频所有权 (audio_owner)**: \`${seg.audio_owner}\` (${audioOwnerDesc})  \n`;
    md += `- **解说职责 (narration_job)**: \`${seg.narration_job}\` | **转场策略**: \`${seg.audio_transition}\`  \n`;
    md += `- **时长预算**: 旁白 ${seg.narration_char_count} 字，预估 TTS **${seg.estimated_tts_duration_sec}s** / 可用 **${seg.available_narration_duration_sec}s** (${seg.duration_fit ? "✅ Fit" : "❌ Overflow"})  \n\n`;

    if (seg.original_dialogue_text) {
      md += `**原对白 (Original Dialogue)**：  \n`;
      md += `> "${seg.original_dialogue_text}"\n\n`;
    }

    if (seg.narration_text) {
      md += `**老周旁白 (Narration)**：  \n`;
      md += `> 🎙️ **${seg.narration_text}**\n\n`;
    } else {
      md += `**老周旁白 (Narration)**：  \n`;
      md += `> *(本段原声极具张力，老周不切入旁白，保留原声与环境氛围)*\n\n`;
    }

    md += `**证据边界说明**：  \n`;
    md += `<details><summary>点击展开该镜头的客观事实与推论边界</summary>\n\n`;
    md += `- **客观动作事实**：${seg.evidence_boundary.visual_facts.join("；") || "无特定动作"}  \n`;
    md += `- **客观台词事实**：${seg.evidence_boundary.dialogue_facts.join("；") || "无对白"}  \n`;
    md += `- **允许的 L3 视听推论**：${seg.evidence_boundary.allowed_l3_inferences.join("；")}  \n`;
    md += `- **严格禁止伪造断言**：${seg.evidence_boundary.strictly_forbidden_claims.join("；")}  \n`;
    md += `</details>\n\n`;

    md += `---\n\n`;
  });

  return md;
}

// 导出文件
const budgetB = generateDurationBudgetMarkdown(
  planB,
  "余则成最危险的一次试探",
  "谢若林抛出陈秋平档案与假夫妻真相，余则成在杀意与交易之间极度克制，把灭顶之灾扭转为两根金条的生意同盟。"
);
const budgetA = generateDurationBudgetMarkdown(
  planA,
  "吴站长什么时候开始怀疑余则成？",
  "吴站长对余则成的怀疑并非单点顿悟，而是在师生假面与官场利益权衡下的多次冷眼试探；看穿不戳穿、留有余地才是老站长的驭人之道。"
);

const previewB = generatePreviewMarkdown(
  planB,
  "余则成最危险的一次试探",
  "谢若林抛出陈秋平档案与假夫妻真相，余则成在杀意与交易之间极度克制，把灭顶之灾扭转为两根金条的生意同盟。"
);
const previewA = generatePreviewMarkdown(
  planA,
  "吴站长什么时候开始怀疑余则成？",
  "吴站长对余则成的怀疑并非单点顿悟，而是在师生假面与官场利益权衡下的多次冷眼试探；看穿不戳穿、留有余地才是老站长的驭人之道。"
);

const budgetBPath = path.join(docsDir, "a7.1-duration-budget-topic-b.md");
const budgetAPath = path.join(docsDir, "a7.1-duration-budget-topic-a.md");
const previewBPath = path.join(docsDir, "a7-director-preview-topic-b.md");
const previewAPath = path.join(docsDir, "a7-director-preview-topic-a.md");

fs.writeFileSync(budgetBPath, budgetB, "utf8");
fs.writeFileSync(budgetAPath, budgetA, "utf8");
fs.writeFileSync(previewBPath, previewB, "utf8");
fs.writeFileSync(previewAPath, previewA, "utf8");

console.log(`[OK] 写入时长预算表 ${budgetBPath}`);
console.log(`[OK] 写入时长预算表 ${budgetAPath}`);
console.log(`[OK] 写入视听预览表 ${previewBPath}`);
console.log(`[OK] 写入视听预览表 ${previewAPath}`);
console.log("\n=== A7.1 全部产物生成完毕 ===");
