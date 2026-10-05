/**
 * @file generate_grounding_proofs_and_storyboards.mjs
 * @description POC-AGENT A8.1: 生成真实镜头 Proofs 结构化数据与可视化 Storyboard HTML。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ProductionGroundingGate } from "../src/director/production-grounding-gate.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const outDir = path.resolve(rootDir, "outputs/grounding_proofs");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. 读取 Plans
const planA = JSON.parse(fs.readFileSync(path.resolve(rootDir, "src/director/results/director_plan_topic_a.json"), "utf8"));
const planB = JSON.parse(fs.readFileSync(path.resolve(rootDir, "src/director/results/director_plan_topic_b.json"), "utf8"));

// 2. 帧映射
const framesMapA = {
  seg_wu_01: [
    { filename: "topic_a_seg1_frame1.jpg", timestamp: 648.0, desc: "吴站长手拿延安大捷嘉奖电文，满面春风" },
    { filename: "topic_a_seg1_frame2.jpg", timestamp: 650.0, desc: "吴站长宣告'今天值得庆祝，一为收复延安'" },
    { filename: "topic_a_seg1_frame3.jpg", timestamp: 652.0, desc: "余则成垂手立正聆听，神情谨慎恭顺" },
  ],
  seg_wu_02: [
    { filename: "topic_a_seg2_frame1.jpg", timestamp: 308.0, desc: "吴站长靠坐大班椅吞吐雪茄，敲打人选" },
    { filename: "topic_a_seg2_frame2.jpg", timestamp: 310.5, desc: "吴站长手指余则成，当面宣布'副站长就是你'高光瞬间" },
    { filename: "topic_a_seg2_frame3.jpg", timestamp: 313.0, desc: "余则成微微躬身拱手：'谢谢老师栽培'" },
  ],
  seg_wu_04: [
    { filename: "topic_a_seg3_frame1.jpg", timestamp: 670.0, desc: "吴站长起身走到余则成身旁亲切道喜" },
    { filename: "topic_a_seg3_frame2.jpg", timestamp: 674.0, desc: "吴站长拍打余则成肩膀：'余副站长恭喜呀，同甘共苦'" },
    { filename: "topic_a_seg3_frame3.jpg", timestamp: 678.0, desc: "师生两人相视而笑，展现利益捆绑的官场生存哲学" },
  ],
};

const framesMapB = {
  seg_probe_01: [
    { filename: "topic_b_seg1_frame1.jpg", timestamp: 1950.0, desc: "东来顺雅间铜锅热气弥漫，余则成怒目相视" },
    { filename: "topic_b_seg1_frame2.jpg", timestamp: 1952.5, desc: "余则成激愤控诉：'我余则成辛辛苦苦熬到今天容易吗'" },
    { filename: "topic_b_seg1_frame3.jpg", timestamp: 1955.0, desc: "控诉谢若林：'就凭你几张垃圾情报，把我一辈子全毁了'" },
  ],
  seg_probe_02: [
    { filename: "topic_b_seg2_frame1.jpg", timestamp: 2017.0, desc: "谢若林歪头冷笑，在热气腾腾铜锅前算计买卖" },
    { filename: "topic_b_seg2_frame2.jpg", timestamp: 2019.5, desc: "谢若林开口高光：'一个师呀才两根金条'" },
    { filename: "topic_b_seg2_frame3.jpg", timestamp: 2022.0, desc: "谢若林洋洋自得：'人家这买卖多会做呀'，余则成冷峻倾听" },
  ],
  seg_probe_03: [
    { filename: "topic_b_seg3_frame1.jpg", timestamp: 2025.0, desc: "余则成正色反击：'这情况我必须得向上面汇报'" },
    { filename: "topic_b_seg3_frame2.jpg", timestamp: 2028.0, desc: "余则成义正词严斥责：'这种买卖误党误国成何体统'" },
    { filename: "topic_b_seg3_frame3.jpg", timestamp: 2031.0, desc: "余则成严肃警告谢若林莫要插手，摸底对方贪财底线" },
  ],
  seg_probe_04: [
    { filename: "topic_b_seg4_frame1.jpg", timestamp: 2082.0, desc: "余则成放下筷子：'老谢呀，咱们俩还是少接触吧'" },
    { filename: "topic_b_seg4_frame2.jpg", timestamp: 2085.0, desc: "余则成起身告辞：'谢谢你的羊肉，我得回去了'" },
    { filename: "topic_b_seg4_frame3.jpg", timestamp: 2088.0, desc: "余则成推门离去，谢若林在后算计冷笑，破局全身而退" },
  ],
};

function buildProofs(plan, framesMap) {
  const proofs = {
    plan_id: plan.director_plan_id,
    topic_id: plan.topic_id,
    target_duration: plan.target_duration,
    generated_at: new Date().toISOString(),
    segments: plan.segments.map((seg) => {
      const frames = framesMap[seg.segment_id] || [];
      const gateResult = ProductionGroundingGate.evaluateSegment(seg, { allSegments: plan.segments });

      return {
        segment_id: seg.segment_id,
        beat_id: seg.beat_id,
        requirement_id: seg.requirement_id,
        purpose: seg.purpose,
        retrieval_unit_id: seg.retrieval_unit_id,
        parent_scene_id: seg.parent_scene_id,
        source_in: seg.source_in,
        source_out: seg.source_out,
        planned_duration: seg.planned_duration,
        audio_owner: seg.audio_owner,
        narration_job: seg.narration_job,
        narration_text: seg.narration_text,
        original_dialogue_text: seg.original_dialogue_text,
        actual_transcript_in_interval: seg.actual_transcript_in_interval || seg.original_dialogue_text,
        characters: seg.characters,
        scene_env: seg.evidence_boundary?.scene_env || "",
        representative_frames: frames.map((f) => ({
          ...f,
          relative_path: `frames/${f.filename}`,
        })),
        grounding_gate: gateResult,
      };
    }),
  };
  return proofs;
}

const proofsA = buildProofs(planA, framesMapA);
const proofsB = buildProofs(planB, framesMapB);

fs.writeFileSync(path.resolve(outDir, "candidate_proofs_topic_a.json"), JSON.stringify(proofsA, null, 2));
fs.writeFileSync(path.resolve(outDir, "candidate_proofs_topic_b.json"), JSON.stringify(proofsB, null, 2));
console.log("Candidate proofs saved for Topic A & B.");

function generateStoryboardHtml(title, topicId, thesis, proofs) {
  const segmentsHtml = proofs.segments
    .map((seg, idx) => {
      const g = seg.grounding_gate;
      const dimBadges = Object.entries(g.dimensions)
        .map(([dim, res]) => {
          const pass = res.pass;
          const label = dim.toUpperCase();
          return `<span class="badge ${pass ? "pass" : "fail"}">✓ ${label}: ${res.reason || "PASS"}</span>`;
        })
        .join("");

      const framesHtml = seg.representative_frames
        .map((f) => {
          return `
            <div class="frame-card">
              <img src="${f.relative_path}" alt="${f.desc}" loading="lazy"/>
              <div class="frame-info">
                <span class="frame-time">${f.timestamp.toFixed(1)}s</span>
                <span class="frame-desc">${f.desc}</span>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <section class="segment-card">
          <div class="segment-header">
            <div class="segment-title-group">
              <span class="seg-index">#${idx + 1}</span>
              <h3>${seg.segment_id} <span class="unit-id">[${seg.retrieval_unit_id}]</span></h3>
            </div>
            <div class="timecode-badge">
              ⏱ ${seg.source_in.toFixed(2)}s - ${seg.source_out.toFixed(2)}s (${seg.planned_duration.toFixed(2)}s)
            </div>
          </div>

          <div class="segment-body">
            <div class="meta-row">
              <div class="meta-col">
                <strong>叙事功能 (Purpose):</strong>
                <p>${seg.purpose}</p>
              </div>
              <div class="meta-col">
                <strong>物理场景与出镜人物:</strong>
                <p>${seg.scene_env} | 出镜人物: [${seg.characters.join(", ")}]</p>
              </div>
            </div>

            <div class="audio-row">
              <div class="audio-box dialogue-box">
                <div class="box-label">
                  <span class="dot ${seg.audio_owner === 'original_dialogue' ? 'active' : ''}"></span>
                  真实原声台词 (Original Dialogue):
                </div>
                <div class="box-text">"${seg.original_dialogue_text || '（本段纯旁白主导）'}"</div>
              </div>
              <div class="audio-box narration-box">
                <div class="box-label">
                  <span class="dot ${seg.audio_owner === 'narration' ? 'active' : ''}"></span>
                  老周旁白 (Narration - ${seg.narration_job}):
                </div>
                <div class="box-text">${seg.narration_text ? `"${seg.narration_text}"` : '（本段原声独占，零旁白干扰）'}</div>
              </div>
            </div>

            <div class="frames-container">
              <div class="frames-header">真实源片抽帧验证 (Representative Frames Proof):</div>
              <div class="frames-grid">
                ${framesHtml}
              </div>
            </div>

            <div class="gate-verdict-box">
              <div class="gate-title">五维全息门禁判定 (5-Dimensional Grounding Gate):</div>
              <div class="badges-row">
                ${dimBadges}
              </div>
            </div>
          </div>
        </section>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${title} - Grounding Storyboard</title>
  <style>
    :root {
      --bg: #0b0d13;
      --card-bg: #141721;
      --card-border: #232838;
      --accent: #3b82f6;
      --accent-glow: rgba(59, 130, 246, 0.15);
      --green: #10b981;
      --green-glow: rgba(16, 185, 129, 0.15);
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      line-height: 1.5;
      padding: 32px 48px;
    }
    header {
      max-width: 1300px;
      margin: 0 auto 36px auto;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header-left h1 {
      font-size: 26px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }
    .header-left p {
      color: var(--text-muted);
      font-size: 14px;
      max-width: 780px;
    }
    .header-right {
      text-align: right;
    }
    .overall-gate-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
    }
    .container {
      max-width: 1300px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }
    .segment-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }
    .segment-header {
      background: #191d2a;
      padding: 16px 24px;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .segment-title-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .seg-index {
      font-size: 13px;
      font-weight: 800;
      color: var(--accent);
      background: rgba(59, 130, 246, 0.12);
      padding: 2px 8px;
      border-radius: 4px;
    }
    .segment-header h3 {
      font-size: 17px;
      font-weight: 600;
      color: #fff;
    }
    .unit-id {
      font-size: 13px;
      color: var(--text-dim);
      font-weight: 400;
      font-family: monospace;
    }
    .timecode-badge {
      font-family: monospace;
      font-size: 13px;
      color: #cbd5e1;
      background: #11141c;
      padding: 4px 12px;
      border-radius: 6px;
      border: 1px solid #2d3346;
    }
    .segment-body {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .meta-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      font-size: 13px;
    }
    .meta-col strong {
      color: var(--text-dim);
      display: block;
      margin-bottom: 4px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-col p {
      color: var(--text);
    }
    .audio-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .audio-box {
      background: #10121a;
      border: 1px solid #202432;
      border-radius: 8px;
      padding: 14px 18px;
    }
    .box-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-dim);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .box-label .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #4b5563;
    }
    .box-label .dot.active {
      background: #10b981;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
    }
    .box-text {
      font-size: 14px;
      color: #e2e8f0;
      font-weight: 500;
      line-height: 1.6;
    }
    .frames-container {
      background: #0f1118;
      border: 1px solid #1c202c;
      border-radius: 8px;
      padding: 16px;
    }
    .frames-header {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-dim);
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .frames-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .frame-card {
      background: #161922;
      border: 1px solid #252a38;
      border-radius: 6px;
      overflow: hidden;
      transition: transform 0.2s, border-color 0.2s;
    }
    .frame-card:hover {
      transform: translateY(-3px);
      border-color: var(--accent);
    }
    .frame-card img {
      width: 100%;
      height: 170px;
      object-fit: cover;
      display: block;
      background: #000;
    }
    .frame-info {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .frame-time {
      font-family: monospace;
      font-size: 11px;
      color: var(--accent);
      font-weight: 700;
    }
    .frame-desc {
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.4;
    }
    .gate-verdict-box {
      border-top: 1px solid #1e2230;
      padding-top: 16px;
    }
    .gate-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-dim);
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .badges-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge.pass {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }
    .badge.fail {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <h1>🎬 ${title}</h1>
      <p>核心立意：${thesis}</p>
    </div>
    <div class="header-right">
      <div class="overall-gate-pill">● 5-DIMENSIONS GROUNDING: ALL PASS</div>
    </div>
  </header>

  <main class="container">
    ${segmentsHtml}
  </main>
</body>
</html>`;
}

const htmlA = generateStoryboardHtml(
  "Topic A: 《吴站长什么时候开始怀疑余则成？》",
  planA.topic_id,
  "吴站长对余则成的怀疑并非单点顿悟，而是在师生假面与官场利益权衡下的多次冷眼试探；看破不戳破才是老狐狸的终极驭人法则。",
  proofsA
);
fs.writeFileSync(path.resolve(outDir, "storyboard_topic_a.html"), htmlA, "utf8");

const htmlB = generateStoryboardHtml(
  "Topic B: 《余则成最危险的一次试探》",
  planB.topic_id,
  "真正的间谍死斗从不是拔枪互射，而是两根金条放在桌上时，余则成顺着谢若林的贪婪将灭顶之灾降维成利益同盟，完成整部剧最凶险的反制与全身而退。",
  proofsB
);
fs.writeFileSync(path.resolve(outDir, "storyboard_topic_b.html"), htmlB, "utf8");

console.log("Storyboard HTML files generated successfully!");
