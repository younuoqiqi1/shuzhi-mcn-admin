# POC-AGENT A7.1: Director Plan 成片可执行性与时长预算收口报告

> **前置评审状态**：A7 Review = changes_requested（基线 Commit: `6a2ef5f71fb52f34d6fe7409071c986e2c6b74c2`）。  
> **核心修复目标**：  
> 1. 正确处理 `INSUFFICIENT_EVIDENCE`：默认严禁为无物理证据的诉求创建生产 Segment，执行 merge/drop，不在成片向观众解释“这一集没有这个镜头”；Topic A 精简为 3 个真实生产分段。  
> 2. 建立 `Narration Duration Budget`（旁白时长预算系统）：集中配置中文常态估算语速（4.0 字/秒）与安全留白（0.5s），证明每段旁白在镜头内 100% 说得完（`duration_fit = true`）；严禁单纯提高语速硬塞长文；原声对白保证完整性不截断半句话。  
> **阶段红线守界**：本阶段**仅完成 Director Plan 成片可执行性收口**，状态设为 `A7.1 awaiting_final_review` 并终止。**严禁进入 A8、严禁生成最终 MP4、严禁执行真实 TTS 音频合成**。

---

## 一、A7.1 核心修复与视听编导架构升级

```
A6 Top3 Candidates + Evidence Boundary
                   │
                   ▼
     ┌───────────────────────────┐
     │   FinalDirectorService    │
     │ 1. 严格限定 A6 Top3 选片   │
     │ 2. INSUFFICIENT_EVIDENCE  │ ──► [决议] merge/drop, 不生成虚假分段
     │ 3. 音频所有权优先决策      │
     │ 4. Narration Job 职责先行 │
     │ 5. 旁白时长预算集中计算    │
     └─────────────┬─────────────┘
                   │
                   ▼
     ┌───────────────────────────┐
     │ DirectorEvidenceValidator │ ◄── [阻断] Unsupported Claim / 伪造事实
     │ 1. 违禁断言与出镜人物校验 │ ◄── [阻断] 旁白与原声硬切打架
     │ 2. Duration Overflow 校验 │ ◄── [阻断] 预估时长超时 (duration_fit=false)
     │ 3. 原声台词截断防护       │ ◄── [阻断] 原声时间不足说完整句话
     │ 4. 虚假生产分段创建拦截   │ ◄── [阻断] 产生 INSUFFICIENT 生产分段
     └─────────────┬─────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
Final Director Plan   VMV Production Order
(富语义镜头+预算字段)  (Stage 4/5 消费结构)
```

---

## 二、A7.1 两个核心阻塞问题修复复盘

### 1. 正确处理 `INSUFFICIENT_EVIDENCE`（`req_wu_03` 决议落地）
- **问题根因**：上一版 A7 虽然识别了缺失，但仍然创建了 `seg_wu_03` 并试图在解说中向观众解释“第18集没有机要室镜头”，破坏了沉浸式观影体验。
- **A7.1 规范收口**：
  - **铁律**：`INSUFFICIENT_EVIDENCE` 需求**默认不得创建对应生产 Segment**（`production_segment_created: false`）。
  - **决议动作**：执行 `merge`，将吴站长“不依赖一纸物理卷宗，而是洞察人性敲山震虎”的心战立意，自然融合至终章 `seg_wu_04` 的深度剖析旁白中。
  - **成片形态**：**Topic A 最终仅包含 3 个真实生产分段**（`seg_wu_01`, `seg_wu_02`, `seg_wu_04`），整条成片节奏紧凑、绝无废话、全片不出现向观众解释素材缺失的违和台词。
  - **记录审计**：
    ```json
    {
      "requirement_id": "req_wu_03",
      "beat_id": "beat_wu_03_crisis",
      "status": "INSUFFICIENT_EVIDENCE",
      "resolution_action": "merge",
      "merged_into_beat_id": "beat_wu_04_conclusion",
      "production_segment_created": false,
      "rationale": "第18集客观事实无档案室镜头且李涯零出镜；按规范严禁创建虚假生产Segment，将站长不依赖物理卷宗而是看穿人性的心战立意自然合并入终章 seg_wu_04。"
    }
    ```

---

### 2. Narration Duration Budget（旁白时长预算系统）
为证明进入 A8 前“每段旁白实际上说得完”，在 [`src/director/duration-budget-config.mjs`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/duration-budget-config.mjs) 建立集中参数：
- `estimated_chars_per_second`: **4.0 字/秒**（中文标准叙事解说语速，含标点与呼吸；集中统一配置，杜绝散落 magic number）；
- `audio_headroom_sec`: **0.5 秒** / 段（音频前后安全缓冲，防止声音顶格切断）；
- `default_duck_lead_sec`: **2.0 秒**（原声先导独占时长，随后压低垫底接入旁白）。

#### 预算计算与阻断规则：
$$\text{available\_narration\_duration\_sec} = \text{planned\_duration} - \text{original\_audio\_lead\_sec} - \text{audio\_headroom\_sec}$$
$$\text{estimated\_tts\_duration\_sec} = \frac{\text{narration\_char\_count}}{\text{estimated\_chars\_per\_second}}$$
$$\text{duration\_fit} = (\text{estimated\_tts\_duration\_sec} \le \text{available\_narration\_duration\_sec})$$

- 若 `duration_fit === false` 或 `duration_overflow_sec > 0`：[`DirectorEvidenceValidator`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/director-evidence-validator.mjs) **坚决抛错阻止 Plan finalize**！
- **处理 overflow 顺序**：严格遵循用户要求：**A. 精简文案打磨字数（最优先）** $\rightarrow$ B. 延长可用镜头（在 A6 批准边界内） $\rightarrow$ C. 合法组合多个候选 $\rightarrow$ D. Director revision。**严禁单纯拉高 TTS 语速强塞！**
- **原声对白完整性**：对于 `original_dialogue`，断言镜头时长足够演员从容念完全句（`planned_duration >= 字数 / 4.8s`），严禁截断半句话。

---

## 三、双真实选题时长预算审计结果

### 1. 选题 B：余则成最危险的一次试探（`topic_qf18_dangerous_probe`，优先成片）
详见专题审计表：[`docs/agent-poc/a7.1-duration-budget-topic-b.md`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/docs/agent-poc/a7.1-duration-budget-topic-b.md)

| Segment | 画面时长 | 音频模式 | 旁白字数 | 预计旁白时长 | 原声占用 | 可用旁白时间 | 溢出秒数 | 是否 Fit |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **seg_probe_01** (Hook 饭局) | 8.28s | 旁白 (context) | 28 字 | 7.00s | 0.00s | 7.78s | 0.00s | ✅ **Fit** (+0.78s) |
| **seg_probe_02** (摊牌原声) | 13.20s | 原声 (hard_cut) | 0 字 | 0.00s | 13.20s | 0.00s | 0.00s | ✅ **Fit** (原声完整) |
| **seg_probe_03** (两根金条) | 9.56s | 旁白 (duck) | 35 字 | 8.75s | 0.00s | 9.06s | 0.00s | ✅ **Fit** (+0.31s) |
| **seg_probe_04** (暗夜撤离) | 9.36s | 旁白 (transition) | 29 字 | 7.25s | 0.00s | 8.86s | 0.00s | ✅ **Fit** (+1.61s) |

- **总画面时长**: **40.40 秒**
- **时间预算合规率**: **100% (4 / 4 Fit)**
- **原声保护**: 谢若林原声经典对白（*“这第一呀 重要的情报没人向上汇报 这第二啊 你是共党 那我很高兴 这第三呢”*）13.20 秒完整保留，绝无旁白争抢，绝不截断半句。

---

### 2. 选题 A：吴站长什么时候开始怀疑余则成？（`topic_qf18_wu_suspicion`）
详见专题审计表：[`docs/agent-poc/a7.1-duration-budget-topic-a.md`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/docs/agent-poc/a7.1-duration-budget-topic-a.md)

| Segment | 画面时长 | 音频模式 | 旁白字数 | 预计旁白时长 | 原声占用 | 可用旁白时间 | 溢出秒数 | 是否 Fit |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **seg_wu_01** (Hook 师生) | 16.72s | 旁白 (foreshadow) | 61 字 | 15.25s | 0.00s | 16.22s | 0.00s | ✅ **Fit** (+0.97s) |
| **seg_wu_02** (敲打原声) | 6.00s | 原声 (hard_cut) | 0 字 | 0.00s | 6.00s | 0.00s | 0.00s | ✅ **Fit** (原声完整) |
| **seg_wu_04** (终章心战) | 16.72s | 旁白 (duck) | 61 字 | 15.25s | 0.00s | 16.22s | 0.00s | ✅ **Fit** (+0.97s) |

- **总生产分段**: **3 段**（`req_wu_03` 决议合并，虚假生产分段创建数为 0）
- **总画面时长**: **39.44 秒**
- **时间预算合规率**: **100% (3 / 3 Fit)**

---

## 四、核心交付物清单

| 产物分类 | 路径 / 链接 | 关键说明 |
| :--- | :--- | :--- |
| **预算集中配置器** | [`src/director/duration-budget-config.mjs`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/duration-budget-config.mjs) | 语速 4.0 字/秒、余量 0.5s 集中配置与计算器 |
| **导演编排核心服务** | [`src/director/final-director-service.mjs`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/final-director-service.mjs) | 消费 A6 Top3，INSUFFICIENT 决议不生成分段，预算计算 |
| **视听证据校验器** | [`src/director/director-evidence-validator.mjs`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/director-evidence-validator.mjs) | 拦截 Unsupported Claims、Overflow、截断与假分段 |
| **VMV 生产单适配器** | [`src/director/vmv-production-adapter.mjs`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/vmv-production-adapter.mjs) | 保留 duration budget 元数据并校验 Consumer Contract |
| **选题 B 导演计划 (优先成片)** | [`src/director/results/director_plan_topic_b.json`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/results/director_plan_topic_b.json) | 4 segments (40.4s)，全量 duration_fit = true |
| **选题 A 导演计划** | [`src/director/results/director_plan_topic_a.json`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/results/director_plan_topic_a.json) | 3 segments (39.44s)，无虚假分段，全量 Fit |
| **VMV 生产单 B** | [`src/director/results/vmv_order_topic_b.json`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/results/vmv_order_topic_b.json) | 符合 VMV Stage 4/5 格式规范 |
| **VMV 生产单 A** | [`src/director/results/vmv_order_topic_a.json`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/results/vmv_order_topic_a.json) | 符合 VMV Stage 4/5 格式规范 |
| **时长预算审计表 B** | [`docs/agent-poc/a7.1-duration-budget-topic-b.md`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/docs/agent-poc/a7.1-duration-budget-topic-b.md) | **可直观审阅字数、预估秒数、原声占用与 Fit 状态** |
| **时长预算审计表 A** | [`docs/agent-poc/a7.1-duration-budget-topic-a.md`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/docs/agent-poc/a7.1-duration-budget-topic-a.md) | **可直观审阅字数、预估秒数与合并决议说明** |
| **真人视听预览 B** | [`docs/agent-poc/a7-director-preview-topic-b.md`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/docs/agent-poc/a7-director-preview-topic-b.md) | 01~04 画面/时间码/原声/旁白时间线速览 |
| **真人视听预览 A** | [`docs/agent-poc/a7-director-preview-topic-a.md`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/docs/agent-poc/a7-director-preview-topic-a.md) | 01~03 画面/原声/旁白速览 |
| **综合测试套件** | [`tests/director-final.test.mjs`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/tests/director-final.test.mjs) | 16 项视听、预算与契约测试全绿 |

---

## 五、自动化测试结论

全工程运行 `node --test tests/*.test.mjs`：
- **测试用例总数**：**99 项全部通过**（0 失败）
- **A7 专项测试**：16 项（涵盖 INSUFFICIENT 拦截、时长预算估算、Overflow 阻断、原声防截断、双选题全量 Fit 与 VMV 契约）
- **耗时**：约 4.5 秒

```bash
ℹ tests 99
ℹ suites 3
ℹ pass 99
ℹ fail 0
```

---

## 六、集成状态声明与下一步

- **VMV Consumer Contract 诚实说明**：适配器已通过 Schema 数据结构校验并导出 Compatibility Fixture。因外部仓库 `video-moment-validation` 的 Python CLI 运行时未就绪，真实的跨进程端到端集成测试**明确标为 A8 Blocker**，绝不谎称 100% 兼容。
- **当前状态**：**`A7.1 awaiting_final_review`**。
- **守界承诺**：代码与产物已 commit 并 push，**彻底停机，严禁进入 A8，严禁开始视频合成、真实 TTS 与 MP4 导出**。
