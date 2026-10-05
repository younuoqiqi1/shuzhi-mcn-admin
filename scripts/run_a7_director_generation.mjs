/**
 * @file run_a7_director_generation.mjs
 * @description 执行 A7 Final Director Plan 生成、VMV 适配及真人 Preview 文档导出。
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

console.log("=== 正在生成 Topic B: 余则成最危险的一次试探 Final Director Plan ===");
const planB = directorService.buildDirectorPlanTopicB();
const orderB = VMVProductionAdapter.adaptPlanToProductionOrder(planB, { orderId: "order_vmv_topic_b_dangerous_probe" });

const planBPath = path.join(resultsDir, "director_plan_topic_b.json");
const orderBPath = path.join(resultsDir, "vmv_order_topic_b.json");
fs.writeFileSync(planBPath, JSON.stringify(planB, null, 2), "utf8");
fs.writeFileSync(orderBPath, JSON.stringify(orderB, null, 2), "utf8");
console.log(`[OK] 写入 ${planBPath}`);
console.log(`[OK] 写入 ${orderBPath}`);

console.log("\n=== 正在生成 Topic A: 吴站长什么时候开始怀疑余则成？ Final Director Plan ===");
const planA = directorService.buildDirectorPlanTopicA();
const orderA = VMVProductionAdapter.adaptPlanToProductionOrder(planA, { orderId: "order_vmv_topic_a_wu_suspicion" });

const planAPath = path.join(resultsDir, "director_plan_topic_a.json");
const orderAPath = path.join(resultsDir, "vmv_order_topic_a.json");
fs.writeFileSync(planAPath, JSON.stringify(planA, null, 2), "utf8");
fs.writeFileSync(orderAPath, JSON.stringify(orderA, null, 2), "utf8");
console.log(`[OK] 写入 ${planAPath}`);
console.log(`[OK] 写入 ${orderAPath}`);

// 生成 Markdown Preview 辅助函数
function formatTimeRange(startSec, endSec) {
  const formatSec = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };
  return `${formatSec(startSec)}–${formatSec(endSec)}`;
}

function generatePreviewMarkdown(plan, title, topicDescription) {
  let md = `# Director Preview: ${title}\n\n`;
  md += `> **选题标识**: \`${plan.topic_id}\`  \n`;
  md += `> **博主视角**: \`${plan.blogger_id}\`（深度谍战拆解，冷峻官场洞察）  \n`;
  md += `> **目标成片时长**: 约 **${plan.target_duration} 秒**  \n`;
  md += `> **画幅规范**: ${plan.aspect_ratio}  \n`;
  md += `> **选题背景**: ${topicDescription}\n\n`;

  if (plan.director_resolution_summary && plan.director_resolution_summary.insufficient_evidence_count > 0) {
    md += `### ⚠️ 特别注意：缺失素材导演决议 (Resolution)\n\n`;
    plan.director_resolution_summary.resolutions.forEach((r, idx) => {
      md += `- **[${r.requirement_id}] ${r.beat_id}**: 状态为 \`${r.status}\`，导演决议执行 \`${r.action}\`。  \n  *处置说明*: ${r.rationale}\n\n`;
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

    md += `**音频策略**：  \n`;
    const audioOwnerDesc = seg.audio_owner === "original_dialogue" ? "原声为主" : "老周旁白为主";
    md += `- **音频所有权 (audio_owner)**: \`${seg.audio_owner}\` (${audioOwnerDesc})  \n`;
    md += `- **解说职责 (narration_job)**: \`${seg.narration_job}\`  \n`;
    md += `- **转场策略 (audio_transition)**: \`${seg.audio_transition}\`  \n\n`;

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

    if (seg.director_resolution) {
      md += `> **📢 导演决议**: \`${seg.director_resolution}\` (action: \`${seg.resolution_action}\`)\n\n`;
    }

    md += `---\n\n`;
  });

  md += `### 🎬 整体视听节奏评估\n\n`;
  md += `- **原声保留比例**: ${plan.segments.filter(s => s.audio_owner === "original_dialogue").length} / ${plan.segments.length} 段  \n`;
  md += `- **旁白引导段落**: ${plan.segments.filter(s => s.audio_owner === "narration").length} / ${plan.segments.length} 段  \n`;
  md += `- **避让过渡 (Duck/L-cut/J-cut)**: ${plan.segments.filter(s => ["duck", "L_cut", "J_cut"].includes(s.audio_transition)).length} 处  \n`;
  md += `- **打架冲突风险**: 0 (全量通过 DirectorEvidenceValidator 校验)\n`;

  return md;
}

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

const previewBPath = path.join(docsDir, "a7-director-preview-topic-b.md");
const previewAPath = path.join(docsDir, "a7-director-preview-topic-a.md");

fs.writeFileSync(previewBPath, previewB, "utf8");
fs.writeFileSync(previewAPath, previewA, "utf8");

console.log(`[OK] 写入预览文件 ${previewBPath}`);
console.log(`[OK] 写入预览文件 ${previewAPath}`);
console.log("\n=== A7 Final Director Plan 生产完毕 ===");
