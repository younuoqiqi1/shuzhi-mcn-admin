# POC-AGENT A7: Final Director Plan 内容编排与视听门禁交付报告

> **前置评审状态**：A6 Final Review = APPROVED（基线 Commit: `28accfbdfa499e48c752e2d285bae33d9230fbd6`，有效覆盖率 7/8 = 87.5% >= 80%）。  
> **本阶段交付物**：Final Director Plan 编排服务、证据边界校验器、VMV 生产单适配器、双真实选题导演计划与真人视听预览文档。  
> **阶段红线守界**：本阶段**仅完成 Director Final**，严格进入 `A7 awaiting_review` 并终止。**严禁进入 A8、严禁生成最终 MP4、严禁执行真实 TTS 音频合成**。

---

## 一、A7 核心设计与执行架构

A7 的核心职责是：“**已有 A6 真实证据，最终这条视频怎么剪、怎么讲、用哪个镜头、何时保留原声、何时接入旁白、镜头精确从哪秒切到哪秒**”。

```
A6 Top3 Candidates + Evidence Boundary
                   │
                   ▼
     ┌───────────────────────────┐
     │   FinalDirectorService    │
     │ 1. 严格限定 A6 Top3 选片   │
     │ 2. 音频所有权优先决策      │
     │ 3. Narration Job 职责推导 │
     │ 4. 显式决议素材缺失       │
     └─────────────┬─────────────┘
                   │
                   ▼
     ┌───────────────────────────┐
     │ DirectorEvidenceValidator │ ◄── [阻断] Unsupported Claim / 伪造事实
     │ 1. 违禁断言拦截           │ ◄── [阻断] 旁白与原声硬切打架
     │ 2. 出镜人物动作一致性     │ ◄── [阻断] 非 Top3 偷塞镜头
     └─────────────┬─────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
Final Director Plan   VMV Production Order
(富语义镜头编排)      (Stage 4/5 消费结构)
```

---

## 二、报告核心问题深度复盘（8项关键答卷）

### 1. 每段为什么选这个镜头？
所有镜头选片**100% 严格来源于 A6 Top3**，绝无新增镜头或手动伪造 scene_id：

#### 选题 B：余则成最危险的一次试探 (`topic_qf18_dangerous_probe`)
- **第 1 段 (Hook)**: 选取 A6 Top1 `unit_scene_0138_01` (32:28.280–32:36.560, 8.28s)  
  *选片理由*: 东来顺包厢热气腾腾铜锅前，谢若林歪头打量，余则成冷笑警惕。画面具有极其鲜明的情境质感，完美引出“致命饭局”的悬念。
- **第 2 段 (Revelation)**: 选取 A6 Top1 `unit_scene_0139_01` (32:36.560–32:49.760, 13.20s)  
  *选片理由*: 谢若林叼着烟冷笑着抛出底牌，余则成眼神凝固。该镜头涵盖全剧最具张力的试探动作，无可替代。
- **第 3 段 (Counterattack)**: 选取 A6 Top1 `unit_scene_0149_01` (33:37.760–33:43.200, 5.44s)  
  *选片理由*: 谈及金钱与情报买卖，谢若林的贪婪算计与余则成的商人伪装形成强烈视听共振，印证“两根金条瓦解信仰怀疑”的论点。
- **第 4 段 (Evacuation)**: 选取 A6 Top1 `unit_scene_0193_01` (40:42.000–40:51.360, 9.36s)  
  *选片理由*: 火车站站台夜色深沉，列车汽笛弥漫，余则成翠平送别晚秋登上列车，以行动破局达成叙事闭环。

#### 选题 A：吴站长什么时候开始怀疑余则成？ (`topic_qf18_wu_suspicion`)
- **第 1 段 (Hook)**: 选取 A6 Top2 `unit_scene_0046_01` (05:10.960–05:15.000, 4.04s)  
  *选片理由*: 站长办公室内两人近距离对坐，余则成垂手谨慎，吴站长目光深邃。
- **第 2 段 (Testing)**: 选取 A6 Top1 `unit_scene_0044_01` (04:59.960–05:05.960, 6.00s)  
  *选片理由*: 吴站长靠坐大班椅点雪茄吐烟雾，居高临下敲山震虎。
- **第 3 段 (Crisis)**: 选取 A6 Top1 `unit_scene_0059_01` (09:16.520–09:33.240, 16.72s)  
  *选片理由*: 因第18集无机要室档案镜头（见下文），选用办公室机密对话作为承接过渡。
- **第 4 段 (Conclusion)**: 选取 A6 Top3 `unit_scene_0047_04` (05:27.000–05:33.360, 6.36s)  
  *选片理由*: 涉及钱财与家当，生动诠释保密局利益至上的潜规则。

---

### 2. 哪些段保留原声？
借鉴 `video-recap-skills` 铁律：**原对白本身足够有力量时，老周绝不硬压旁白！**
- **选题 B 第 2 段 (谢若林致命摊牌)**：
  - `audio_owner = "original_dialogue"`, `narration_job = "none"`, `narration_text = ""`
  - 保留原声台词：*“这第一呀 重要的情报没人向上汇报 这第二啊 你是共党 那我很高兴 这第三呢”*
  - 演员原声语气轻佻冷酷，戏剧张力达到顶峰，任何旁白口播都会破坏沉浸感。
- **选题 A 第 2 段 (吴站长敲山震虎)**：
  - `audio_owner = "original_dialogue"`, `narration_job = "none"`, `narration_text = ""`
  - 保留原声台词：*“你来当这个副站长 不合适吧 还是跟李队长商量商量”*
  - 老谋深算的官场敲打必须让观众亲耳听见原声。

---

### 3. 哪些段使用旁白？
- **背景引入与悬念抛出段**（选题 B 第 1 段、选题 A 第 1 段）：
  - `narration_job = "context"` / `"foreshadow"`，老周切入点破玄机。
- **深度动机与官场心理剖析段**（选题 B 第 3 段、选题 A 第 4 段）：
  - `narration_job = "interpretation"`，老周剖析“两根金条的降维打击”与“吴站长的捞钱哲学”。
- **事实澄清与收束升华段**（选题 B 第 4 段、选题 A 第 3 段）：
  - `narration_job = "transition"` / `"context"`。

---

### 4. 哪些地方使用 L/J cut 或 duck？
为了杜绝**“旁白与关键原声互相打架”**：
- **Duck (原声避让)**：
  - **选题 B 第 3 段**：原声前两秒爆发（*“一个师呀才两根金条…”*），随后音量压低至 25% 作为背景垫底，老周旁白接入（`audio_transition = "duck"`）。
- **L-Cut / J-Cut (音画交错延展)**：
  - **选题 A 第 3 段**：前段吴站长室内原声余韵未消，画面切入走廊对坐，旁白同步延展带入（`audio_transition = "L_cut"`）。
  - **选题 B 第 4 段**：火车站台汽笛声先入，画面随后亮起，实现平滑转场（`audio_transition = "L_cut"`）。

---

### 5. `req_wu_03` 如何处理？
- **客观物理事实**：《潜伏》第18集全集李涯出镜 0 秒，且保密局不存在物理“机要档案室”。
- **严禁造假**：A7 严禁为了凑数而谎称“找到了档案室镜头”。
- **导演决议 (Resolution)**：
  - 标记 `director_resolution: "insufficient_evidence"`，执行 `resolution_action: "soften"`。
  - 在解说词中坦诚说明事实：“老周必须说明：整部第18集里，并没有李涯在机要室搜查余则成物理档案的镜头。为什么？因为在老站长眼里，一纸档案根本不重要，真正致命的是人心……”
  - 选用合法 Top1 办公室密谈画面 `unit_scene_0059_01` 承载，将立意升华为心战博弈。

---

### 6. 是否存在 unsupported claim？
- **零违禁伪断言**：全量文本经由 [`DirectorEvidenceValidator`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/director-evidence-validator.mjs) 校验。
- **被拦截并严格禁止的断言清单**：
  - ❌ “吴站长已确认余则成是共产党”（违禁，已拦截）
  - ❌ “余则成在档案室排查照片”（违禁，已拦截）
  - ❌ “李涯当面搜捕拔枪”（违禁，已拦截）
- 所有观点均带有清晰的博主视角修辞（“老周觉得”、“在老周看来”、“老周视角”），与 L1 物理事实界限分明。

---

### 7. VMV Consumer Contract 到底验证到什么程度？
- **已完成部分**：
  - 成功建立 [`VMVProductionAdapter`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/vmv-production-adapter.mjs)，将 Final Director Plan 准确转换为 VMV Stage 4/5 标准生产单（`version: "1.0.0"`，包含 target_format, audio_track, segments, clip, original_audio 等）。
  - 通过 Consumer Contract Test 校验，并导出两份合法兼容产物：
    - [`vmv_order_topic_a.json`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/results/vmv_order_topic_a.json)
    - [`vmv_order_topic_b.json`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/results/vmv_order_topic_b.json)
- **诚实边界声明（绝不宣称 100% 兼容）**：
  - 由于外部代码库 `video-moment-validation` 当前主干处于 `feat/local-task-runner`，其 Stage 4/5 真实的 Python CLI 消费端（`python -m vmv render`、ffmpeg 切割与阿里云真实 TTS）尚未部署落地。
  - 因此，真实的跨进程跨语言 Consumer Integration Test **明确标为 A8 Blocker**。

---

### 8. A8 还缺什么？（进入成片前的关键缺口清单）
在正式获批进入 A8 真实视频合成前，系统必须解决以下前置条件：
1. **TTS 真实声学接入与时长锁定**：
   - 当前旁白为预估语速与文本长度，进入 A8 后需对接真实 TTS（或预先渲染音频切片），得到精确到毫秒的音频波形时长，并依此微调剪辑点的出入点时间码。
2. **VMV Render 渲染管线就绪**：
   - VMV 仓库需要具备完整的 FFmpeg 切片压制与软/硬字幕烧录命令（或通过 Node.js 本地轻量 FFmpeg 脚本实现自闭环渲染）。
3. **真实原片媒体文件路径映射**：
   - 本地 `qianfu_ep18_720p_25fps.mp4` 的真实绝对路径配置，用于实际抽取视频帧与切割音频。

---

## 三、产物清单与文件导航

| 产物分类 | 路径 | 描述 |
| :--- | :--- | :--- |
| **导演服务实现** | [`src/director/final-director-service.mjs`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/final-director-service.mjs) | 核心导演编排服务，Top3 选片与决策 |
| **视听证据校验** | [`src/director/director-evidence-validator.mjs`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/director-evidence-validator.mjs) | 严格证据边界、违禁断言拦截与打架防护 |
| **VMV 适配转换** | [`src/director/vmv-production-adapter.mjs`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/vmv-production-adapter.mjs) | 映射到 VMV 生产单并进行 Consumer Contract 校验 |
| **选题 B 计划 (优先成片)** | [`src/director/results/director_plan_topic_b.json`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/results/director_plan_topic_b.json) | 余则成最危险的一次试探 Final Plan (4 segments, 36.28s) |
| **选题 A 计划** | [`src/director/results/director_plan_topic_a.json`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/results/director_plan_topic_a.json) | 吴站长什么时候开始怀疑余则成 Final Plan (含决议, 33.12s) |
| **VMV 消费单 B** | [`src/director/results/vmv_order_topic_b.json`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/results/vmv_order_topic_b.json) | 生产单 B (满足 VMV Stage 4/5 规范) |
| **VMV 消费单 A** | [`src/director/results/vmv_order_topic_a.json`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/results/vmv_order_topic_a.json) | 生产单 A (满足 VMV Stage 4/5 规范) |
| **真人预览 Markdown B** | [`docs/agent-poc/a7-director-preview-topic-b.md`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/docs/agent-poc/a7-director-preview-topic-b.md) | 直观展示 01~04 画面/音频/原声/旁白时间线 |
| **真人预览 Markdown A** | [`docs/agent-poc/a7-director-preview-topic-a.md`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/docs/agent-poc/a7-director-preview-topic-a.md) | 直观展示 01~04 画面/音频/决议说明 |
| **综合测试套件** | [`tests/director-final.test.mjs`](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/tests/director-final.test.mjs) | 12 项专项覆盖测试，100% 通过 |

---

## 四、自动化测试结论

全工程运行 `node --test tests/*.test.mjs`：
- **测试用例总数**：95 项全部通过（新增 12 项 A7 Director Final 视听与契约专项测试）
- **失败用例**：0
- **耗时**：约 3.4 秒

```bash
ℹ tests 95
ℹ suites 3
ℹ pass 95
ℹ fail 0
```

---

## 五、状态声明与下一步

当前工程已完成 A7 的全部交付，并更新状态至：
**`A7 awaiting_review`**

**严禁擅自推进 A8，已立即停止执行。等待真人评审意见。**
