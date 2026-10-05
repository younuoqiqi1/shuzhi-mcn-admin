/**
 * @file human-gate-evaluator.mjs
 * @description POC-AGENT A6.1/A6.2: 独立 Gate Evaluation 层与人工验收包生成器。
 * 
 * 核心原则：
 * 1. 自动 Perspective 结果与最终 Gate 判定必须严格分离；
 * 2. 自动系统只能输出 candidate Top3 + interpretation + evidence boundary + system recommendation；
 * 3. 严禁系统自评冒充人工审核；在真人确认前，human_verdict 必须为 pending；
 * 4. 只有 Top3 中至少存在 1 个 candidate 的 human_verdict == 'usable'，该 Requirement 才算 human PASS；
 * 5. 只有真人完成全部 8 个 Requirement 审核后，才能正式判定 Retrieval Top3 Gate PASS/FAIL；未审核前为 awaiting_human_review。
 * 6. 支持细颗粒度 Retrieval Unit 显示与 Consistency Validator 状态透出。
 */

export class HumanGateEvaluator {
  /**
   * 将 2 个选题（8 个 MaterialRequirements）的 A6 视角重读结果封装为独立人工验收包
   * @param {Array<{ topicTask: Object, a6Result: Object }>} taskPairs
   * @returns {Object} 机器可读的待审核数据包 (human_verdict 全部初始为 pending)
   */
  buildReviewPackage(taskPairs) {
    const requirements = [];
    let systemPassCount = 0;
    let totalCount = 0;

    for (const { topicTask, a6Result } of taskPairs) {
      const { topic, viewpoint, story_beats, material_requirements } = topicTask;
      const beatsMap = new Map();
      if (Array.isArray(story_beats)) {
        story_beats.forEach((b) => beatsMap.set(b.beat_id, b));
      }

      for (const req of material_requirements) {
        totalCount++;
        const beat = beatsMap.get(req.beat_id) || {};
        const reqRes = a6Result.requirements_reread[req.requirement_id] || {};
        const top3List = reqRes.top3 || [];

        // 系统自评分判定
        if (reqRes.usable_candidate_count_in_top3 >= 1) {
          systemPassCount++;
        }

        const formattedTop3 = top3List.map((cand) => {
          const raw = cand.candidate_raw || {};
          const timecode = raw.timecode || cand.timecode || {};
          const prov = raw.provenance || cand.provenance || {};

          return {
            candidate_id: cand.candidate_id,
            scene_id: raw.scene_id || cand.scene_id,
            parent_scene_id: raw.parent_scene_id || raw.scene_id || cand.scene_id,
            retrieval_unit_id: raw.retrieval_unit_id || raw.unit_id || cand.candidate_id,
            evidence_id: cand.evidence_id || raw.evidence_id,
            timecode: {
              in: timecode.in || "00:00:00.000",
              out: timecode.out || "00:00:00.000",
              duration_sec: timecode.duration_sec || 0,
            },
            dialogue: raw.dialogue || cand.dialogue || "",
            characters: raw.characters || cand.characters || [],
            physical_actions: raw.physical_actions || cand.physical_actions || [],
            scene_env: raw.scene_env || cand.scene_env || "",
            a5_rank: cand.a5_rank || 1,
            a6_rank: cand.a6_rank || 1,
            rank_delta: cand.rank_delta !== undefined ? cand.rank_delta : 0,
            retrieval_score: cand.a5_retrieval_score !== undefined ? cand.a5_retrieval_score : cand.total_score,
            perspective_score: cand.a6_perspective_score || 0,
            final_ranking_score: cand.final_ranking_score || 0,
            interpretation: cand.subjective_interpretation || "",
            evidence_boundary: cand.evidence_boundary || "",
            sample_frame_refs: prov.sample_frame_refs || [],
            analysis_granularity: prov.analysis_granularity || "independent_keyframe",
            // 一致性校验与风险
            consistency_check: cand.consistency_check || { is_consistent: true, details: "校验通过" },
            risk_flags: cand.risk_flags || [],
            // 系统推荐
            system_recommendation: cand.recommended_use || "supporting",
            system_supports_claim: cand.supports_claim || "true",
            // 人工审核字段（初始必须为 pending，严禁冒充人工审核）
            human_verdict: "pending", // "pending" | "usable" | "unusable"
            human_reason: "",
            reviewer: null,
            reviewed_at: null,
          };
        });

        requirements.push({
          topic: {
            topic_id: topic.topic_id || topic.id,
            title: topic.title,
            angle: topic.angle,
            core_thesis: topic.core_thesis,
          },
          viewpoint: {
            viewpoint_id: viewpoint.viewpoint_id,
            thesis: viewpoint.thesis,
            hook: viewpoint.hook,
            takeaway: viewpoint.takeaway,
          },
          beat: {
            beat_id: beat.beat_id,
            order: beat.order,
            beat_title: beat.beat_title,
            narrative_function: beat.narrative_function,
          },
          material_requirement: {
            requirement_id: req.requirement_id,
            description: req.description,
            desired_characters: req.desired_characters || [],
            desired_action: req.desired_action || "",
            desired_emotion: req.desired_emotion || "",
            desired_scene_env: req.desired_scene_env || "",
            target_affordances: req.target_affordances || [],
            evidence_grounding_criteria: req.evidence_grounding_criteria || "",
          },
          top3: formattedTop3,
          human_requirement_verdict: "pending", // 当且仅当 top3 中至少 1 个 human_verdict == 'usable' 时置 'PASS'
          human_review_notes: "",
        });
      }
    }

    const systemCoverage = totalCount > 0 ? Number((systemPassCount / totalCount).toFixed(3)) : 0;

    return {
      package_version: "1.2.0",
      generated_at: new Date().toISOString(),
      gate_status: "awaiting_human_review",
      gate_passed: false, // 真人未完成审核前，严禁为 true
      all_reviewed: false,
      total_requirements: totalCount,
      reviewed_requirements: 0,
      human_passed_requirements: 0,
      human_usable_coverage: 0.0,
      // 显式区分：这只是系统自评指标，非正式 Gate
      system_candidate_coverage: systemCoverage,
      requirements,
    };
  }

  /**
   * 应用单个候选的人工审核结论
   * @param {Object} reviewPackage
   * @param {Object} update
   * @param {string} update.requirement_id
   * @param {string} update.candidate_id
   * @param {"pending"|"usable"|"unusable"} update.verdict
   * @param {string} update.reason
   * @param {string} update.reviewer
   */
  applyHumanVerdict(reviewPackage, { requirement_id, candidate_id, verdict, reason, reviewer }) {
    if (!["pending", "usable", "unusable"].includes(verdict)) {
      throw new Error(`非法的 human_verdict: '${verdict}'，只能为 pending | usable | unusable`);
    }

    const reqItem = reviewPackage.requirements.find(
      (r) => r.material_requirement.requirement_id === requirement_id
    );
    if (!reqItem) {
      throw new Error(`未找到 requirement_id: '${requirement_id}'`);
    }

    const candItem = reqItem.top3.find((c) => c.candidate_id === candidate_id);
    if (!candItem) {
      throw new Error(`未找到 candidate_id: '${candidate_id}'`);
    }

    candItem.human_verdict = verdict;
    candItem.human_reason = reason || "";
    candItem.reviewer = reviewer || "human_reviewer";
    candItem.reviewed_at = new Date().toISOString();

    // 重新计算该 requirement 的结论
    const hasUsableInTop3 = reqItem.top3.some((c) => c.human_verdict === "usable");
    const allTop3Reviewed = reqItem.top3.every((c) => c.human_verdict !== "pending");

    if (hasUsableInTop3) {
      reqItem.human_requirement_verdict = "PASS";
    } else if (allTop3Reviewed) {
      reqItem.human_requirement_verdict = "FAIL";
    } else {
      reqItem.human_requirement_verdict = "pending";
    }

    // 重新刷新全局 Gate 统计
    return this.evaluateHumanGate(reviewPackage);
  }

  /**
   * 评估人工 Gate 状态
   * @param {Object} reviewPackage
   * @returns {Object} 审核评估统计
   */
  evaluateHumanGate(reviewPackage) {
    const totalCount = reviewPackage.requirements.length;
    let reviewedCount = 0;
    let passedCount = 0;

    for (const r of reviewPackage.requirements) {
      const isReviewed = r.human_requirement_verdict !== "pending";
      if (isReviewed) reviewedCount++;
      if (r.human_requirement_verdict === "PASS") passedCount++;
    }

    const allReviewed = totalCount > 0 && reviewedCount === totalCount;
    const humanCoverage = totalCount > 0 ? Number((passedCount / totalCount).toFixed(3)) : 0;
    const gatePassed = allReviewed && humanCoverage >= 0.8;

    reviewPackage.total_requirements = totalCount;
    reviewPackage.reviewed_requirements = reviewedCount;
    reviewPackage.human_passed_requirements = passedCount;
    reviewPackage.human_usable_coverage = humanCoverage;
    reviewPackage.all_reviewed = allReviewed;
    reviewPackage.gate_passed = gatePassed;

    if (!allReviewed) {
      reviewPackage.gate_status = "awaiting_human_review";
    } else {
      reviewPackage.gate_status = gatePassed ? "gate_human_pass" : "gate_failed";
    }

    return {
      gate_status: reviewPackage.gate_status,
      gate_passed: reviewPackage.gate_passed,
      all_reviewed: reviewPackage.all_reviewed,
      total_requirements: totalCount,
      reviewed_requirements: reviewedCount,
      passed_requirements: passedCount,
      human_usable_coverage: humanCoverage,
      system_candidate_coverage: reviewPackage.system_candidate_coverage,
    };
  }

  /**
   * 将人工审核包渲染为标准 Markdown 文档 (docs/agent-poc/a6-human-gate-review.md)
   * @param {Object} reviewPackage
   * @returns {string} Markdown 文本
   */
  generateMarkdownReport(reviewPackage) {
    const lines = [];

    lines.push("# POC-AGENT A6.2: Retrieval Top3 真实人工验收包 (Human Gate Review)");
    lines.push("");
    lines.push(`> **生成时间**: ${reviewPackage.generated_at}  `);
    lines.push(`> **当前 Gate 状态**: \`${reviewPackage.gate_status}\`  `);
    lines.push(`> **系统自评覆盖率 (System Candidate Coverage)**: ${(reviewPackage.system_candidate_coverage * 100).toFixed(1)}% (仅代表算法自评，不等于人工验收)  `);
    lines.push(`> **真实人工可用率 (Human Usable Coverage)**: ${(reviewPackage.human_usable_coverage * 100).toFixed(1)}% (${reviewPackage.human_passed_requirements}/${reviewPackage.total_requirements})  `);
    lines.push(`> **审核进度**: ${reviewPackage.reviewed_requirements}/${reviewPackage.total_requirements} 个 MaterialRequirements 已审  `);
    lines.push(`> **门禁准入标准**: 必须由真人审核完全部 8 个需求，且每个需求 Top3 中至少有 1 个镜头被标记为 \`usable\`，总通过率 $\\ge 80.0\\%$ 方可声明正式 Gate 通过。`);
    lines.push("");
    lines.push("---");
    lines.push("");

    lines.push("## 一、 审核规则与操作指引");
    lines.push("");
    lines.push("1. **严禁自动冒充**：所有镜头初始 \`human_verdict\` 必须为 \`pending\`；在真人审核前，门禁状态必须保持为 \`awaiting_human_review\`；");
    lines.push("2. **判定标准**：");
    lines.push("   - `usable`：镜头真实画面与对白客观存在，能有效支撑当前节拍的叙事功能或博主解说，剪辑可用；");
    lines.push("   - `unusable`：镜头虽然被召回，但台词缺失、人物偏离或画面无法服务该节拍，不可使用；");
    lines.push("3. **通过判据**：一个 MaterialRequirement 对应的 Top3 候选中，**只要有 $\\ge 1$ 个镜头被人工核定为 `usable`**，该 Requirement 即判定为 `PASS`；");
    lines.push("4. **Gate 结论**：8 个需求全部审核完毕，且通过率 $\\ge 80.0\\%$ 时，正式进入 `gate_human_pass`。");
    lines.push("");
    lines.push("---");
    lines.push("");

    lines.push("## 二、 8 个真实需求人工审核明细表");
    lines.push("");

    reviewPackage.requirements.forEach((reqItem, reqIdx) => {
      const { topic, viewpoint, beat, material_requirement, top3, human_requirement_verdict } = reqItem;
      lines.push(`### [需求 ${reqIdx + 1}/8] ${topic.title} —— ${beat.beat_title}`);
      lines.push("");
      lines.push(`* **选题 ID / 名称**: \`${topic.topic_id}\` (${topic.title})`);
      lines.push(`* **核心论点**: ${viewpoint.thesis}`);
      lines.push(`* **节拍叙事功能**: \`${beat.beat_id}\` - ${beat.narrative_function}`);
      lines.push(`* **素材诉求**: \`${material_requirement.requirement_id}\` - ${material_requirement.description}`);
      lines.push(`* **期望人物**: [${material_requirement.desired_characters.join(", ")}]`);
      lines.push(`* **期望动作/环境**: ${material_requirement.desired_action} | ${material_requirement.desired_scene_env}`);
      lines.push(`* **人工需求结论**: \`${human_requirement_verdict}\``);
      lines.push("");

      top3.forEach((cand, candIdx) => {
        lines.push(`#### 镜头 Top ${candIdx + 1}: \`${cand.scene_id}\` (单元: \`${cand.retrieval_unit_id}\`)`);
        lines.push("");
        lines.push(`* **检索单元 ID**: \`${cand.retrieval_unit_id}\` (父场景: \`${cand.parent_scene_id}\`)`);
        lines.push(`* **时间码**: \`${cand.timecode.in}\` $\\rightarrow$ \`${cand.timecode.out}\` (时长: ${cand.timecode.duration_sec}s)`);
        lines.push(`* **客观出镜人物**: [${cand.characters.join(", ")}]`);
        lines.push(`* **物理空间**: ${cand.scene_env}`);
        lines.push(`* **物理动作**: ${cand.physical_actions.join("；") || "无显式动作描述"}`);
        lines.push(`* **真实台词**: ${cand.dialogue ? `"${cand.dialogue}"` : "(无台词 / 纯画面)"}`);
        lines.push(`* **排名轨迹**: A5 rank **#${cand.a5_rank}** $\\rightarrow$ A6 rank **#${cand.a6_rank}** (Delta: ${cand.rank_delta > 0 ? `+${cand.rank_delta}` : cand.rank_delta})`);
        lines.push(`* **得分详情**: A5 检索分: \`${cand.retrieval_score}\` | A6 视角分: \`${cand.perspective_score}\` | 最终重排分: \`${cand.final_ranking_score}\``);
        lines.push(`* **老周追剧主观解读 (L3)**: ${cand.interpretation}`);
        lines.push(`* **事实边界 (Evidence Boundary)**: ${cand.evidence_boundary}`);
        if (cand.consistency_check && !cand.consistency_check.is_consistent) {
          lines.push(`* **⚠️ 人物一致性警告**: ${cand.consistency_check.details}`);
        }
        if (cand.sample_frame_refs && cand.sample_frame_refs.length > 0) {
          lines.push(`* **采样代表帧引用 (Frame Refs)**: [${cand.sample_frame_refs.join(", ")}]`);
        }
        lines.push(`* **系统推荐类型**: \`${cand.system_recommendation}\` (支持判定: \`${cand.system_supports_claim}\`)`);
        lines.push("");
        lines.push("| 审核项 | 当前值 | 审核填写指引 |");
        lines.push("|:---|:---|:---|");
        lines.push(`| **human_verdict** | **\`${cand.human_verdict}\`** | 填写: \`usable\` 或 \`unusable\` |`);
        lines.push(`| **human_reason** | \`${cand.human_reason || "待审核填写"}\` | 记录人工判定理由 |`);
        lines.push(`| **reviewer** | \`${cand.reviewer || "待指派"}\` | 审核人姓名/工号 |`);
        lines.push(`| **reviewed_at** | \`${cand.reviewed_at || "未审核"}\` | 审核确认时间戳 |`);
        lines.push("");
      });

      lines.push("---");
      lines.push("");
    });

    lines.push("## 三、 门禁状态汇总与后续阻断规则");
    lines.push("");
    lines.push(`* **当前门禁状态**: \`${reviewPackage.gate_status}\``);
    lines.push(`* **正式 Gate 判定**: ${reviewPackage.gate_passed ? "✅ PASS" : "❌ 未通过 (等待人工审核)"}`);
    lines.push(`* **阻断铁律**: 只要 \`all_reviewed == false\` 或 \`gate_passed == false\`，**一律绝对严禁进入 A7 Director Final 阶段**，禁止任何视频剪辑、配音合成与生产流水线启动。`);

    return lines.join("\n");
  }
}
