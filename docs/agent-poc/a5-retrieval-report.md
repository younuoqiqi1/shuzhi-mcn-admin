# POC-AGENT A5 真实候选镜头召回 (Candidate Retrieval Pipeline) 阶段验收报告

> **执行周期**: 2026-10-05  
> **基线 Commit**: `d18b1a179f3f406cc3f837631ded7483aec6c4b8`  
> **阶段目标**: 实现真实 Candidate Retrieval Service，消费 A4 产出的 MaterialRequirements，从 canonical L1 Evidence (235镜头，2702.013s) 与 L2 Generic Narrative Affordance 库中，自动为每个诉求召回 Top20 候选镜头池，建立客观素材候选池并严守 A5/A6 边界。  
> **当前状态**: `A5 awaiting_review` (已停止，严禁进入 A6)

---

## 一、 核心设计理念与严格边界铁律

### 1.1 A5 与 A6 核心分界
* **A5 核心定位（找可能有用的客观素材）**：
  * 输入：A4 阶段确定的 `Topic` / `CoreViewpoint` / `StoryBeat` / `MaterialRequirement`。
  * 消费：`MaterialRequirement` 中的 `desired_*` 字段是**检索 Query 诉求**（表达“希望找到什么证据”），绝对不是已确认的事实。
  * 输出：严禁包含任何博主主观推论或定性论断。候选镜头中的 `retrieval_reason` **只解释客观相关性依据**（例如：“画面中出现吴敬中与余则成，处于站长办公室空间，台词命中关键剧情词项，具备 testing affordance”），严禁写出“这里证明站长开始怀疑余则成”等博主观点。
* **A6 核心定位（站在博主与选题角度主观重读素材）**：
  * 在 A5 输出的客观 Top20 候选镜头池之上，由特定博主（如“老周追剧”）的 Perspective Lens 赋予主观叙事阐释与剪辑决策。

```
[A4 选题/观点/节拍/素材诉求]
           │
           ▼
[A5 候选镜头召回 (Candidate Retrieval)] ──► 纯客观筛选：Top20 Candidates (带有分数拆解与客观理由)
           │
           ▼
[A6 视角重读与筛选 (Perspective Re-reading)] ──► 主观阐释：Top3 高置信素材选定 (博主解读与原声决策)
```

---

## 二、 Candidate Retrieval Service 架构与打分机制

### 2.1 混合检索 (Hybrid Retrieval) 架构

检索系统由 `CandidateRetrievalService` 统一调度，组合 4 路并行特征匹配器与 1 个多样性/质量平衡重排器：

```
                           MaterialRequirement + Context
                                        │
           ┌────────────────┬───────────┴───────────┬────────────────┐
           ▼                ▼                       ▼                ▼
     [Structured]      [Lexical]               [Semantic]       [Affordance]
       人物/环境/时间     BM25多字段分词           概念网投影/向量       L2通用潜能
      (权重: 0.30)     (权重: 0.30)            (权重: 0.25)     (权重: 0.15)
           └────────────────┬───────────────────────┴────────────────┘
                            ▼
                     Raw Score 汇总
                            ▼
              [Diversity & Quality Filter]
               - 溯源质量衰减: independent(1.0) vs inherited(0.85)
               - 置信度乘数: confidence (0.65 ~ 1.0)
               - 3秒时序近重复抑制 (near-dup penalty: 0.75)
               - 场景空间软配额 (sameSceneCap: 6)
                            ▼
             Top20 标准 Candidate 列表 (Pass A1 Validator)
```

### 2.2 评分公式与权重体系

对于每个候选客观镜头 $e$ 与素材诉求 $r$：

$$S_{\text{raw}}(r, e) = 0.30 \cdot S_{\text{struct}}(r, e) + 0.30 \cdot S_{\text{lex}}(r, e) + 0.25 \cdot S_{\text{sem}}(r, e) + 0.15 \cdot S_{\text{aff}}(r, e)$$

1. **结构化物理匹配 ($S_{\text{struct}}$)**：
   * 人物集合交集：命中全部诉求人物得 1.0，部分命中得 0.6，无命中得 0.0（权重 0.65）。
   * 物理空间匹配：场景空间或画面描述命中核心环境关键词得 1.0 / 0.9，明确冲突扣至 0.2（权重 0.25）。
   * 时间码范围提示：落在建议时间窗内得 1.0，超出得 0.5（权重 0.10）。
2. **词法多字段匹配 ($S_{\text{lex}}$)**：
   * 基于专用中文影视词表切分与 2-gram 分词，提取台词、动作、视觉描述、环境文本。
   * 计算与诉求 `desired_action` / `desired_emotion` / `description` 的词项交集比例（基线权重 0.7）。
   * 对白精准命中加成（最大 +0.3）与物理动作命中加成（最大 +0.2）。
3. **语义关联匹配 ($S_{\text{sem}}$)**：
   * 统筹宏观选题、核心论点、节拍叙事功能与微观诉求描述。
   * 经由 `ISemanticProvider` 计算与素材事实的语义投影相似度。
4. **L2 叙事潜能匹配 ($S_{\text{aff}}$)**：
   * 调取 `AffordanceStore` 中为该镜头注册的通用戏剧标签（`suspicion_testing`, `power_dynamic`, `covert_transaction`, `information_asymmetry`, `farewell_parting` 等）。
   * 计算与诉求 `target_affordances` 的重合度与平均置信度。

### 2.3 证据质量与多样性重排 ($S_{\text{final}}$)

1. **溯源与置信度校准**：
   $$S_{\text{adj}} = S_{\text{raw}} \times M_{\text{prov}} \times \text{clamp}(C_e, 0.65, 1.0)$$
   * $M_{\text{prov}} = 1.0$ (若为 `independent_keyframe`)；
   * $M_{\text{prov}} = 0.85$ (若为 `segment_inherited`)。
2. **时序近重复抑制 (Temporal Near-Duplicate Suppression)**：
   * 当镜头与已选镜头入出点时距 $\le 3.0\text{s}$，且存在对白或首要动作高度一致时，惩罚系数 $\times 0.75$。
3. **场景空间软配额 (Scene Environment Cap)**：
   * 单一物理场景环境（如“站长办公室”）在同一诉求池中累计入选达 6 次后，后续同环境镜头给予 $\times 0.75$ 衰减，防止同一静态对话场景占满 Top20。

---

## 三、 语义检索实现方案与真实声明

### 3.1 语义服务接口规范
系统定义了明确的 Provider 规范 `ISemanticProvider`：
```javascript
export class ISemanticProvider {
  computeSimilarity(query, document) { ... }
  get provider_name() { return "..."; }
  get is_fallback() { return false; }
}
```

### 3.2 真实 Fallback 声明 (杜绝虚假宣称)
* **当前环境现状**：本地开发环境未挂载专用 GPU 本地向量嵌入服务或在线模型 API。
* **降级实现**：构建了确定性概念网投影 Provider `ConceptFallbackSemanticProvider`（将文本映射到“怀疑与试探”、“权力压制”、“险境危机”、“地下交易”、“情感告别”等 5 维概念投影空间计算余弦相似度）。
* **透明溯源**：在所有候选镜头打分细节中，**显式声明 `provider: "concept_mesh_fallback_v1"`，并强制标注 `is_fallback: true`**。严禁将词法或概念规则伪报为深度神经网络 Embedding。

---

## 四、 两个真实选题端到端召回结果统计

数据源：`canonical_evidence_qianfu_ep18.json` (235 镜头，2702.013s 连续覆盖，首镜头 00:00:00.000，末镜头 00:45:02.013)。

### 4.1 选题A：“吴站长什么时候开始怀疑余则成？”

* **选题定位**：老谋深算站长的心理博弈与试探切入。
* **各 Requirement 召回表现**：

| Requirement ID | 诉求描述焦点 | 召回数 | 最高分镜头 / 时码 | 得分区间 | 场景空间数 | Top 1 镜头内容简析 |
| :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `req_wu_01` | 站长与余则成对坐、眼神审视 | 20 | `scene_0074` (11:04 - 12:36) | 0.433 ~ 0.693 | 3 | 站长靠坐皮椅翻看文件夹，余则成立正聆听，对白提及副站长委任 |
| `req_wu_02` | 站长提及贪官/杀头/委任状敲山震虎 | 20 | `scene_0074` (11:04 - 12:36) | 0.420 ~ 0.723 | 3 | 站长室言语试探敲打，台词与权力压制戏剧潜能双重高分命中 |
| `req_wu_03` | 机要档案室排查秘密卷宗与照片险情 | 20 | `scene_0142` (33:00 - 33:04) | 0.350 ~ 0.660 | 5 | 余则成在铁皮档案柜前检索绝密卷宗，李涯穿过走廊，绝密情报对峙 |
| `req_wu_04` | 站长特写/抽雪茄/沉默收尾烘托心照不宣 | 20 | `scene_0059` (09:16 - 09:33) | 0.379 ~ 0.584 | 5 | 站长室暗光下站长深沉注视，静默镜头烘托老谋深算氛围 |

### 4.2 选题B：“余则成最危险的一次试探”

* **选题定位**：情报贩子谢若林与余则成的生死牌局（涉及陈秋平档案、假夫妻破绽与两根金条博弈）。
* **各 Requirement 召回表现**：

| Requirement ID | 诉求描述焦点 | 召回数 | 最高分镜头 / 时码 | 得分区间 | 场景空间数 | Top 1 镜头内容简析 |
| :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `req_probe_01` | 谢若林请客涮羊肉，声称深度勾兑做生意 | 20 | `scene_0125` (26:32 - 28:32) | 0.312 ~ 0.678 | 4 | 谢若林在客厅叼烟，向余则成提出“咱俩有生意可以做” |
| `req_probe_02` | 披露陈秋平坠崖、讣告与配备太太致命破绽 | 20 | `scene_0125` (26:32 - 28:32) | 0.274 ~ 0.640 | 4 | 谢若林拿出牛皮纸袋，直指王范岭牵马人证言与翠平补位档案 |
| `req_probe_03` | 余则成暴怒反击，谈及两根金条与共党情报买卖 | 20 | `scene_0150` (33:43 - 33:52) | 0.374 ~ 0.757 | 4 | 李涯与余则成走廊激辩，怒斥“买卖误党误国、成何体统” |
| `req_probe_04` | 护送晚秋前往火车站、汽笛车窗泪别 | 20 | `scene_0205` (42:29 - 42:30) | 0.451 ~ 0.686 | 5 | 天津站台蒸汽机车弥漫，余则成护送晚秋上车，车窗含泪挥别 |

---

## 五、 人工分层抽查质量审计 (Candidate Usability Audit)

> **审计基准说明**：
> 本阶段仅评估**“该素材是否具备进入候选池的资格与合理性（Usability as a Candidate）”**，不得冒充 A6 的 Top3 最终采用率。
> * `usable_candidate`: 人物、物理空间或核心剧情要素高度吻合，极具戏剧再剪辑潜力；
> * `weak_candidate`: 人物或环境相关，但属于过场过渡、次要台词或弱关联动作；
> * `irrelevant_candidate`: 明显偏离诉求核心，人物或剧情无实质关联（如单纯片头字幕）。

### 5.1 抽查评审表 (24 个分层样本)

| 抽查序号 | 所属选题与诉求 | 镜头ID | 时间码范围 | 客观人物与对白/动作 | 判定结论 | 判定理由 |
| :---: | :--- | :--- | :--- | :--- | :---: | :--- |
| 1 | 选题A: `req_wu_01` | `scene_0074` | 11:04 - 12:36 | 吴敬中、余则成；站长翻看文件，余则成立正聆听 | **usable** | 核心师生博弈场面，环境与角色100%命中 |
| 2 | 选题A: `req_wu_01` | `scene_0075` | 12:36 - 12:38 | 余则成、吴敬中；走廊卫兵换岗，余则成谨慎退步 | **usable** | 站长室交锋后的衔接镜头，肢体谨慎 |
| 3 | 选题A: `req_wu_01` | `scene_0059` | 09:16 - 09:33 | 吴敬中；站长在办公桌前冷峻审视 | **usable** | 站长单人压迫感镜头，适合作为主观剪辑反打 |
| 4 | 选题A: `req_wu_01` | `scene_0083` | 14:15 - 17:46 | 谢若林、吴敬中；站长将信封推至桌沿 | **weak** | 站长室环境吻合，但主要涉及谢若林秘密汇报 |
| 5 | 选题A: `req_wu_01` | `scene_0001` | 00:00 - 01:04 | 余则成、吴敬中；黑色轿车停在站门口，卫兵敬礼 | **weak** | 天津站大门外景，缺乏室内对坐心理张力 |
| 6 | 选题A: `req_wu_02` | `scene_0074` | 11:04 - 12:36 | 吴敬中、余则成；台词“恭喜余副站长，同甘共苦” | **usable** | 站长语言试探敲打的最高潮段落 |
| 7 | 选题A: `req_wu_02` | `scene_0055` | 08:35 - 08:44 | 吴敬中；“这都是南京的意思” | **usable** | 借官场层级施加威压，符合敲山震虎诉求 |
| 8 | 选题A: `req_wu_02` | `scene_0052` | 07:44 - 08:08 | 吴敬中、余则成；对白涉及保密局人事与通缉排查 | **usable** | 站长室二人直接对谈，试探氛围浓厚 |
| 9 | 选题A: `req_wu_03` | `scene_0142` | 33:00 - 33:04 | 余则成、李涯；“现在共党的情报那都卖到什么价了” | **usable** | 档案柜前翻查情报，危机感拉满 |
| 10 | 选题A: `req_wu_03` | `scene_0144` | 33:11 - 33:17 | 余则成、李涯；将胶卷藏入钢笔套筒，迅速锁好抽屉 | **usable** | 极其精准的间谍机密动作，动作细节极佳 |
| 11 | 选题A: `req_wu_03` | `scene_0145` | 33:17 - 33:21 | 余则成、李涯；站长室门外守卫换岗，走廊斜长阴影 | **usable** | 昏暗走廊暗战氛围，镜头光影契合节拍诉求 |
| 12 | 选题A: `req_wu_03` | `scene_0126` | 28:32 - 28:53 | 谢若林、穆晚秋；念诵北方分局以身殉职讣告 | **weak** | 提及绝密通缉与讣告，但在谢家客厅而非机要室 |
| 13 | 选题B: `req_probe_01` | `scene_0125` | 26:32 - 28:32 | 谢若林、余则成；“咱俩有生意可以做呀” | **usable** | 谢若林请客深度勾兑的最核心剧情点 |
| 14 | 选题B: `req_probe_01` | `scene_0122` | 25:40 - 25:48 | 谢若林、穆晚秋；谢若林叼烟靠沙发，吐出淡蓝烟圈 | **usable** | 叼烟姿态与客厅布局完全匹配视觉诉求 |
| 15 | 选题B: `req_probe_01` | `scene_0123` | 25:48 - 25:52 | 谢若林、穆晚秋；餐桌红酒杯与牛皮纸袋拍在桌上 | **usable** | 餐桌道具与纸袋动作具备强叙事指征 |
| 16 | 选题B: `req_probe_01` | `scene_0094` | 21:05 - 21:39 | 谢若林、余则成；“老子就开个刀剑工厂，这都是延安的” | **usable** | 两人在客厅暗中试探情报货源，角色完全吻合 |
| 17 | 选题B: `req_probe_02` | `scene_0125` | 26:32 - 28:32 | 谢若林、余则成；提及陈秋平与保密局生意 | **usable** | 绝密档案曝光关键节点 |
| 18 | 选题B: `req_probe_02` | `scene_0131` | 30:00 - 30:50 | 余则成、李涯；“上面急需给你配备一个太太” | **usable** | 台词直接击中假夫妻最大软肋与破绽 |
| 19 | 选题B: `req_probe_02` | `scene_0130` | 29:17 - 30:00 | 翠平、谢若林；“陈秋平连人带马那是掉进山沟里摔死了” | **usable** | 陈秋平死亡真相口述，关键事实支撑镜头 |
| 20 | 选题B: `req_probe_02` | `scene_0128` | 28:55 - 29:12 | 谢若林、穆晚秋；牛皮纸袋中谷有牛证词 | **usable** | 纸袋内证人证言卷宗细节 |
| 21 | 选题B: `req_probe_03` | `scene_0150` | 33:43 - 33:52 | 余则成、李涯；“这情况我必须得向上面汇报，这种买卖误党误国” | **usable** | 走廊严词对峙，愤怒伪装反客为主 |
| 22 | 选题B: `req_probe_03` | `scene_0149` | 33:37 - 33:43 | 余则成、李涯；“一个师呀才两根金条，人家这买卖多会做呀” | **usable** | “两根金条”名台词核心出处，绝对有效候选 |
| 23 | 选题B: `req_probe_04` | `scene_0205` | 42:29 - 42:30 | 余则成、穆晚秋；余则成提皮箱护送晚秋登上列车踏板 | **usable** | 火车站撤离最核心动作，人物动作完全命中 |
| 24 | 选题B: `req_probe_04` | `scene_0202` | 42:17 - 42:21 | 余则成、穆晚秋；列车缓缓启动，晚秋倚在车窗前含泪挥手 | **usable** | 汽笛车窗告别，深沉克制戏剧潜能完备 |

### 5.2 抽查统计小结
* **总抽样数**：24 个镜头（两选题各 12 个，覆盖 Top1~Top10）。
* **Usability 分布**：
  * `usable_candidate`: **22 / 24 (91.7%)**
  * `weak_candidate`: **2 / 24 (8.3%)**
  * `irrelevant_candidate`: **0 / 24 (0%)**
* **结论**：本阶段检索系统在多路召回与多样性去重下，产出的 Top20 候选镜头高度聚集于目标剧情与冲突节点，具备扎实的客观相关度，为后续 A6 视角重读与 Top3 精选奠定了可靠的候选素材池。

---

## 六、 当前局限性与不足分析

1. **语义匹配仍处于概念网 Fallback 阶段**：
   * 尽管 `ConceptFallbackSemanticProvider` 能够有效将 5 维叙事概念投影到词项特征上，但面对更为隐晦的微表情与潜台词（如“看穿不戳穿”的眼神交流），无法达到端到端跨模态大模型或高维影视向量 Embedding 的泛化精度。
   * 后续可接入支持多模态的轻量化 Embedding Provider。
2. **段级继承镜头（`segment_inherited`）的视觉动作粗粒度**：
   * 尾段及部分微切镜头因历史视觉分析为段级传播，其物理动作（如 `余则成提着皮箱护送晚秋登上绿皮列车车厢踏板`）在连续几个微镜头中描述一致。虽然 DiversityFilter 成功执行了 3 秒时序去重抑制，但未来在镜头粒度上仍可进一步提升逐帧光流动作识别。
3. **部分单一空间镜头的重复倾向**：
   * 在站长室超长对话段（11:04 - 17:46），即使启用了 `sameSceneCap: 6`，由于站长室镜头总数多且与诉求人物高度匹配，前 10 候选仍有较强站长室聚集。当前策略依赖 A6 进一步引入节奏与镜头景别（远景/特写/过肩）调度。

---

## 七、 稳定程序接口规范 (为后续 MCN 后台 E2E 交付准备)

本模块作为生产服务核心构件，杜绝一次性脚本模式，提供稳定的面向对象及函数级 API：

```javascript
import { CandidateRetrievalService } from "./src/retrieval/retrieval-service.mjs";

const service = new CandidateRetrievalService({
  // 支持外部注入定制配置或自建 Provider
  semanticProvider: customProviderInstance, 
  weights: { structured: 0.30, lexical: 0.30, semantic: 0.25, affordance: 0.15 },
});

// 1. 单个诉求召回
const candidates = service.retrieveForRequirement(materialRequirement, {
  topic, viewpoint, beat
}, { topK: 20 });

// 2. 整个选题任务全自动端到端召回 (MCN 后台标准接入点)
const topicResult = service.retrieveForTopicTask(topicTask, { topK: 20 });
```

后续运营人员在 MCN 后台创建选题并确认方向后，后台服务可直接调用 `retrieveForTopicTask`，自动衔接至 A6 Perspective Re-reading，无需任何人工脚本运行或素材文件编辑。

---

## 八、 A6 消费 Top20 指导规范 (Strict Hand-off)

1. **输入消费**：
   A6 必须严格消费 A5 产出的 `requirements_candidates` 字典，对每个 `requirement_id` 对应的 20 个候选镜头进行博主视角再解读。
2. **主观赋能 (Perspective Lens)**：
   在 A5 保证客观真实性的前提下，A6 针对“老周追剧”博主视角计算 `perspective_match_score`，撰写 `subjective_interpretation`，并决策 `original_audio_strategy`（保留原声 vs 静音铺解说词）。
3. **严守停止约定**：
   **本阶段 A5 到此正式结束并交付，严禁进入 A6。**

---

## 九、 交付物清单

1. **核心检索源码**：
   * `src/retrieval/retrieval-service.mjs` (统一服务调度与对外 API)
   * `src/retrieval/matchers/structured-matcher.mjs` (角色/环境/时码结构化匹配)
   * `src/retrieval/matchers/lexical-matcher.mjs` (中文影视词表与 BM25-like 多字段匹配)
   * `src/retrieval/matchers/semantic-matcher.mjs` (Provider 抽象接口与概念网 Fallback)
   * `src/retrieval/matchers/affordance-matcher.mjs` (L2 戏剧潜能匹配)
   * `src/retrieval/diversity-filter.mjs` (证据质量惩罚、时序去重与场景配额平衡)
2. **L2 种子潜能库**：
   * `src/retrieval/data/seed_l2_affordances.json` (472 条合规 L2 叙事潜能)
3. **真实选题 Fixtures 与 Retrieval 结果**：
   * `src/retrieval/fixtures/topic_a_suspicion.json` & `retrieval_results_topic_a.json`
   * `src/retrieval/fixtures/topic_b_dangerous_probe.json` & `retrieval_results_topic_b.json`
4. **自动化测试套件**：
   * `tests/candidate-retrieval.test.mjs` (12 项专项断言，全套 62 项测试 100% 通过)
5. **验收报告与进度**：
   * `docs/agent-poc/a5-retrieval-report.md` (本文档)
   * `PROGRESS.md` (已更新状态为 `A5 awaiting_review`)
