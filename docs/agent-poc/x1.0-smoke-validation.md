# X1.0 盲测小样真实验证技术报告 (15-Shot Smoke Validation)

> **严正声明与科学评测准则**：
> 1. **非完整 X1 Gate 评审**：本次验证仅为 15-Shot 盲抽小样工程验证，**严禁用 15-Shot 代替完整的 X1 Gate 评审（完整 Gate 需 50-shot Gold 标准集与系统对齐）**。本轮验证完成立即 **STOP 提交 Review**，不推进 X1.1。
> 2. **无 Gold 不自宣 PASS**：由于本轮测试完全处于无人工标注黄金真值 (Gold Standard) 的全新盲测环境，**严禁自行宣称算法能力 PASS，严禁捏造 F1、CER 等评估指标**，仅如实呈现实测数据、异常事实、模型局限与耗时。
> 3. **全部语义待人工审核**：所有 VLM 提取的结构化观察一律强制标注 `requires_human_review=True` 与 `semantic_status="unverified"`。Schema 检验仅能证明符合 JSON 字段规范，绝不代表语义客观准确。

---

## 1. 盲选 Shot 清单与全集前中后分布

在观察视频内容前，算法使用 ffmpeg 场景切换检测器探测全集（总时长 2702.01s），生成完整算法 Shot 边界，并固化 Candidate Manifest SHA-256 与随机种子。

- **随机种子 (Seed)**: `20261005`
- **固化清单与哈希**:
```text
SEED=20261005
MANIFEST_SHA256=556efbf06471a7abf64a3e5a18831678ee7205c3fb498510d091bd19147d3848
CANDIDATE_SHOT_COUNT=162
TOTAL_DURATION=2702.013243
```

- **三分盲选 15 个完整算法 Shot 列表（前、中、后各 5 个）**:

| Shot ID | 起始时间 (s) | 终止时间 (s) | 时长 (s) | 分区归属 | 抽取帧规范引用 (25%/50%/75%) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `shot_0010` | 41.44 | 49.40 | 7.96 | 前段 (0-900.7s) | `shot_0010/frame_25.jpg`, `50`, `75` |
| `shot_0018` | 72.24 | 73.84 | 1.60 | 前段 (0-900.7s) | `shot_0018/frame_25.jpg`, `50`, `75` |
| `shot_0019` | 73.84 | 76.20 | 2.36 | 前段 (0-900.7s) | `shot_0019/frame_25.jpg`, `50`, `75` |
| `shot_0026` | 289.72 | 292.00 | 2.28 | 前段 (0-900.7s) | `shot_0026/frame_25.jpg`, `50`, `75` |
| `shot_0035` | 556.52 | 573.24 | 16.72 | 前段 (0-900.7s) | `shot_0035/frame_25.jpg`, `50`, `75` |
| `shot_0053` | 1082.68 | 1085.12 | 2.44 | 中段 (900.7-1801.3s) | `shot_0053/frame_25.jpg`, `50`, `75` |
| `shot_0055` | 1121.92 | 1186.64 | 64.72 | 中段 (900.7-1801.3s) | `shot_0055/frame_25.jpg`, `50`, `75` |
| `shot_0056` | 1186.64 | 1247.24 | 60.60 | 中段 (900.7-1801.3s) | `shot_0056/frame_25.jpg`, `50`, `75` |
| `shot_0069` | 1463.56 | 1466.84 | 3.28 | 中段 (900.7-1801.3s) | `shot_0069/frame_25.jpg`, `50`, `75` |
| `shot_0070` | 1466.84 | 1473.12 | 6.28 | 中段 (900.7-1801.3s) | `shot_0070/frame_25.jpg`, `50`, `75` |
| `shot_0095` | 2017.76 | 2023.20 | 5.44 | 后段 (1801.3-2702.0s) | `shot_0095/frame_25.jpg`, `50`, `75` |
| `shot_0117` | 2220.64 | 2271.20 | 50.56 | 后段 (1801.3-2702.0s) | `shot_0117/frame_25.jpg`, `50`, `75` |
| `shot_0133` | 2442.00 | 2470.32 | 28.32 | 后段 (1801.3-2702.0s) | `shot_0133/frame_25.jpg`, `50`, `75` |
| `shot_0137` | 2524.84 | 2536.24 | 11.40 | 后段 (1801.3-2702.0s) | `shot_0137/frame_25.jpg`, `50`, `75` |
| `shot_0149` | 2609.08 | 2613.24 | 4.16 | 后段 (1801.3-2702.0s) | `shot_0149/frame_25.jpg`, `50`, `75` |

### 1.1 镜头切分质量限制披露
- **切分参数与合并规则**: 使用 ffmpeg `scene > 0.38` 探测切点，对相邻间隔短于 `1.5s` 的切点强制向后合并。
- **未评切分质量指标**: 本次验证**未对镜头切分边界进行 ShotBoundaryUsableRate 人工准确率评定**。
- **长候选镜头过拟合/欠切风险**: 候选集中存在长达 `64.72s` (如候选 shot)、`60.60s` 的长区间候选 Shot，这表明极可能存在将多个机位镜头/蒙太奇剪辑合并为一个算法 Shot 的欠切分现象，**绝对不能宣称切分准确性已验证**，仅作为盲抽候选集依据。

---

## 2. 真实三模块运行统计与限制说明

### 2.1 真实 ASR 语音识别统计 (mlx-whisper tiny)
- **总调用数**: 15 次，全部成功调用完成（无崩溃）。
- **有声学文本 Shot (10 个)**: `shot_0035, shot_0053, shot_0055, shot_0056, shot_0069, shot_0070, shot_0095, shot_0117, shot_0133, shot_0137`
- **空文本 Shot (5 个)**: `shot_0010, shot_0018, shot_0019, shot_0026, shot_0149`（注：空文本可能为真实画面静音，也可能为 ASR 漏识别，原因未人工听音标注；10 条有输出不等于对白内容绝对正确，识别质量与错误率未经人工真值标注评定）。
- **模型与局限性**: 使用本地 `mlx-community/whisper-tiny`（权重 71MiB `weights.npz`）。音频中即便出现人名仅作为原生声学词段留存，绝未泄露给视觉或人物映射。

### 2.2 真实 Objective VLM 统计与局限性暴露 (mlx-vlm Qwen2-VL-2B-Instruct-4bit)
- **评估总帧数**: 45 帧（15 Shot × 3 帧独立推理，`resize_shape=(384, 384)`, `max_tokens=256`）。
- **Schema 结构合规帧数**: `20 / 45`
- **Schema 拒识帧数 (Rejected)**: `25 / 45`
- **推理异常帧数 (Error)**: `0 / 45`
- **Shot 级结构分布**:
  - `3 个 Shot` 三帧全结构成功 (`shot_0010, shot_0133, shot_0137`);
  - `12 个 Shot` 包含拒识帧 (`shot_0018, shot_0019, shot_0026, shot_0035, shot_0053, shot_0055, shot_0056, shot_0069, shot_0070, shot_0095, shot_0117, shot_0149`);
  - `0 个 Shot` 包含推理异常帧 (``)。
- **严重语义局限性披露（严禁包装能力 PASS）**:
  1. **主观/关系性推测泄露**：实测发现即使结构通过 Schema，模型原始输出中依然存在主观关系推测。例如在 `shot_0010` 的 uncertainty 字段中，模型输出了 `"there is a sense of intimacy and connection between the characters"`（推测出亲密与连接感），这表明 **Schema 过滤仅能拦截固定字段与特定格式，无法完全杜绝模型产生主观臆断**！
  2. **格式漂移导致拒识**：在 `shot_0149` 等帧中，模型将示例中的 dict 误当成了数组元素输出为 `list of dicts`，被严格 Schema 拦截并标记为 `rejected`。
  3. **待人工核验标记**：所有观察数据的 `requires_human_review` 均强制为 `True`，`semantic_status` 为 `"unverified"`，保留原始 `raw_output`。

### 2.3 真实人脸检测与跨 Shot 一致性聚类 (OpenCV YuNet + SFace)
- **人脸检测总数**: `50` 处人脸 (45 帧实测)。
- **算法聚类匿名簇**: **`31 个算法匿名聚类簇`**（**声明：这仅代表算法基于余弦相似度生成的聚类簇数量，绝对不能等同于 31 位真实独立人物！**）。
- **算法局限性披露**:
  1. 当前余弦相似度阈值固定为 `0.55`，**未经任何人工 Ground Truth 数据集校准**；
  2. 算法存在人脸漏检（例如侧脸、暗光、遮挡）与错分风险；
  3. 新出现的人脸仅记录 `match_status="new_identity"` 与真实历史最高相似度，严禁伪造 1.0 假证据。

---

## 3. 完整 Run Provenance 溯源信息

| 标的 | 文件/配置 | 哈希 (SHA-256) / 取值 | 备注 |
| :--- | :--- | :--- | :--- |
| **输入视频** | `qianfu_ep18.mp4` | `7987a13f4df2403d0eb3927a9c1f6b170821077e171afc72df4c95d935f17c9c` | 本地真实流式读取 |
| **候选清单** | `candidate_manifest.json` | `6338a0de4290bc0774376ff5252533543edbeda1347388e718e55df94fa1fd0f` | 162 个算法 Shot |
| **盲选清单** | `selected_15_shots.json` | `9b8a78d666a1f38b174e4e4066e50bd3451b8ca226abc0761621e19ae98d1938` | Seed=20261005 盲抽 15 Shot |
| **ASR 权重** | `whisper-tiny/weights.npz` | `d5a3b8671ac7aab11a2c9d0f16e7da94bad5500d785856f438c6bd44c3723944` | 权重 71MiB，Revision: `unknown` |
| **VLM 权重** | `Qwen2-VL-4bit/model.safetensors` | `3534d3dcfaacd0cd00e935469bc34b6d692b2ba0749c5d9ee422f3f2175cf992` | 权重 1.26GB，Revision: `unknown` |
| **YuNet ONNX** | `face_detection_yunet_2023mar.onnx` | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` | OpenCV 官方模型 (232KB) |
| **SFace ONNX** | `face_recognition_sface_2021dec.onnx` | `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` | OpenCV 官方模型 (38MB) |
| **VLM 参数** | `resize_shape=(384, 384), max_tokens=256, temp=0.0` | Prompt SHA256: `cd19be2ddba10f95ba0a84cda87181e19a16f9fa92866780c970a9d9567febb8` | 纯客观物理 prompt |
| **环境依赖** | `mlx, mlx-whisper, mlx-vlm, opencv, torch` | 全部位于 `/private/tmp/x1_0/venv` | 项目主依赖零污染 |

---

## 4. 隔离安全防护真实边界说明

- **隔离方式与局限性**：
  当前的防护模块 (`isolation_guard.py`) 为**应用级路径拦截函数与断言防护**，而非 Linux Namespaces 或 macOS App Sandbox 等操作系统级强制内核沙箱。
  其防护边界在于：在所有数据读取、音频提取与模型推理入口调用 `assert_safe_path`，严格禁止代码引用 `PROGRESS`、`poc-revalidation-handoff.md`、旧审计报告及含剧情先验的路径；同时将剧名和文件名替换为匿名标的（`source_media_001`, `ep_anon_001`）。
- **生命周期与进程安全加固说明**：
  在本次小样验证早期，全集场景探测脚本与批量推理脚本曾在单次连续执行中接近或超过 60s 限制。随后工程架构进行了彻底重构：
  1. 拆解为原子化独立任务；
  2. 引入统一的 `scripts/x1_0/lifecycle.py`，配置全局硬超时守卫（55s SIGALRM）与 `atexit`/信号强制清理（向子进程组发送 SIGKILL 并 wait 清理），杜绝孤儿进程与常驻后台。

---

## 5. 逐 Shot 真实推断与三帧客观观察明细

### Shot: `shot_0010` (41.44s - 49.40s, 时长: 7.96s)

- **ASR 状态**: `success` | **文本**: `（空文本；原因未标注）` (耗时: 0.499s)
- **人脸状态**: `detected` | **检出数**: 1 处
  - `person_001` (new_identity) | 新出现 (最佳历史相似度: None) | 帧: `shot_0010/frame_50.jpg`
- **VLM 总体状态**: `success` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person with short hair, wearing a dark coat, and a person with long hair, wearing a light-colored top']`
    - 环境: `an indoor setting with dim lighting, possibly a room or a darkened area`
    - 动作: `["a person is kissing the other person's head", "a person is kissing the other person's cheek"]`
    - 物体: `[]`
    - 机位: `close-up`
    - 不确定性: `some parts of the image are obscured by the subjects' hair, and there is a sense of intimacy and connection between the characters`
  - **帧 `frame_50.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['two men in white shirts, one with a red heart in his lapel']`
    - 环境: `a dimly lit room with candles, traditional Chinese decor, and a wooden table with food and cups`
    - 动作: `['standing, holding candles, and looking at food']`
    - 物体: `['candles, traditional Chinese decorations, and food on the table']`
    - 机位: `medium shot, capturing the men and some of the objects on the table`
    - 不确定性: `some parts of the image are obscured by smoke or fog, making it difficult to see details`
  - **帧 `frame_75.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person sitting at a table with a plate of food and candles']`
    - 环境: `a dimly lit room with a table, plate of food, candles, and chairs`
    - 动作: `['sitting']`
    - 物体: `['plate of food, candles, chairs']`
    - 机位: `medium shot`
    - 不确定性: `some objects may be partially obscured by the candles`

---

### Shot: `shot_0018` (72.24s - 73.84s, 时长: 1.60s)

- **ASR 状态**: `success` | **文本**: `（空文本；原因未标注）` (耗时: 0.195s)
- **人脸状态**: `detected` | **检出数**: 3 处
  - `person_002` (new_identity) | 新出现 (最佳历史相似度: 0.0674) | 帧: `shot_0018/frame_25.jpg`
  - `person_002` (matched_existing) | 相似度: 0.8932 | 帧: `shot_0018/frame_50.jpg`
  - `person_003` (new_identity) | 新出现 (最佳历史相似度: 0.2224) | 帧: `shot_0018/frame_75.jpg`
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person wearing a dark coat']`
    - 环境: `a room with a blue light, possibly a studio or a dark room`
    - 动作: `['standing']`
    - 物体: `['no visible objects']`
    - 机位: `medium shot`
    - 不确定性: `no significant blur or low light, but the lighting is dim, suggesting it might be indoors`
  - **帧 `frame_50.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a dark coat",   "environment": "a black and white photo",   "physical_action...`
  - **帧 `frame_75.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person wearing a dark suit and patterned tie']`
    - 环境: `a dimly lit, possibly office-like setting with a wooden desk and chair, and a lamp on the desk`
    - 动作: `['bending over a desk', 'looking down']`
    - 物体: `['a wooden desk', 'a lamp on the desk', 'a patterned tie']`
    - 机位: `medium shot, focusing on the person's lower body and head`
    - 不确定性: `some blur due to the dim lighting`

---

### Shot: `shot_0019` (73.84s - 76.20s, 时长: 2.36s)

- **ASR 状态**: `success` | **文本**: `（空文本；原因未标注）` (耗时: 0.064s)
- **人脸状态**: `detected` | **检出数**: 3 处
  - `person_004` (new_identity) | 新出现 (最佳历史相似度: 0.1972) | 帧: `shot_0019/frame_50.jpg`
  - `person_005` (new_identity) | 新出现 (最佳历史相似度: 0.0847) | 帧: `shot_0019/frame_75.jpg`
  - `person_006` (new_identity) | 新出现 (最佳历史相似度: 0.2533) | 帧: `shot_0019/frame_75.jpg`
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person wearing a dark coat']`
    - 环境: `a dimly lit room with a piano and a microphone`
    - 动作: `['playing the piano']`
    - 物体: `['a piano']`
    - 机位: `medium shot`
    - 不确定性: `some blur due to movement`
  - **帧 `frame_50.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a gray shirt",   "environment": "an indoor setting with a desk and a stack o...`
  - **帧 `frame_75.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `非法 JSON 格式: Expecting value: line 1 column 1 (char 0)`
    - 原始 raw 摘录: `'''json {   "characters": [     {       "description": "a person wearing a dark coat"     },     {       "description": ...`

---

### Shot: `shot_0026` (289.72s - 292.00s, 时长: 2.28s)

- **ASR 状态**: `success` | **文本**: `（空文本；原因未标注）` (耗时: 0.056s)
- **人脸状态**: `detected` | **检出数**: 3 处
  - `person_007` (new_identity) | 新出现 (最佳历史相似度: 0.0336) | 帧: `shot_0026/frame_25.jpg`
  - `person_007` (matched_existing) | 相似度: 0.8378 | 帧: `shot_0026/frame_50.jpg`
  - `person_007` (matched_existing) | 相似度: 0.8113 | 帧: `shot_0026/frame_75.jpg`
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a dark coat",   "environment": "a formal indoor setting with a wooden desk, ...`
  - **帧 `frame_50.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a dark coat",   "environment": "a formal setting with a wooden chair, a tabl...`
  - **帧 `frame_75.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a dark coat",   "environment": "a formal indoor setting with a patterned sof...`

---

### Shot: `shot_0035` (556.52s - 573.24s, 时长: 16.72s)

- **ASR 状态**: `success` | **文本**: `替方的一行站着也不可可你自己保重吗全是二退我谢谢你` (耗时: 4.655s)
  - 词段示例: 5 段，首段: `[0.58s - 1.54s] text: "替方的一行"`
- **人脸状态**: `detected` | **检出数**: 6 处
  - `person_007` (matched_existing) | 相似度: 0.5596 | 帧: `shot_0035/frame_25.jpg`
  - `person_008` (new_identity) | 新出现 (最佳历史相似度: 0.1252) | 帧: `shot_0035/frame_25.jpg`
  - `person_009` (new_identity) | 新出现 (最佳历史相似度: 0.4503) | 帧: `shot_0035/frame_50.jpg`
  - ... 其余 3 处见完整 predictions
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: elements of 'characters' must be strings, elements of 'physical_actions' must be strings, elements of 'objects' must be strings`
    - 原始 raw 摘录: `'''json {   "characters": [     {       "description": "A person wearing a dark coat"     },     {       "description": ...`
  - **帧 `frame_50.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: elements of 'characters' must be strings`
    - 原始 raw 摘录: `'''json {   "characters": [     {       "description": "Two men in formal attire, one wearing glasses, standing in a dim...`
  - **帧 `frame_75.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: elements of 'characters' must be strings, elements of 'physical_actions' must be strings, elements of 'objects' must be strings`
    - 原始 raw 摘录: `'''json {   "characters": [     {       "description": "a person wearing a dark coat"     },     {       "description": ...`

---

### Shot: `shot_0053` (1082.68s - 1085.12s, 时长: 2.44s)

- **ASR 状态**: `success` | **文本**: `就是这样说的` (耗时: 0.134s)
  - 词段示例: 1 段，首段: `[0.58s - 1.7s] text: "就是这样说的"`
- **人脸状态**: `detected` | **检出数**: 3 处
  - `person_007` (matched_existing) | 相似度: 0.5994 | 帧: `shot_0053/frame_25.jpg`
  - `person_007` (matched_existing) | 相似度: 0.6488 | 帧: `shot_0053/frame_50.jpg`
  - `person_007` (matched_existing) | 相似度: 0.6363 | 帧: `shot_0053/frame_75.jpg`
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person wearing glasses and a dark coat']`
    - 环境: `a dimly lit indoor setting with a floral-patterned curtain`
    - 动作: `['standing', 'looking down']`
    - 物体: `['a curtain', "a person's head", 'a wall']`
    - 机位: `medium shot`
    - 不确定性: `some blur due to lighting conditions`
  - **帧 `frame_50.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing glasses, standing in a room",   "environment": "a well-lit room with wooden ...`
  - **帧 `frame_75.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a dark coat",   "environment": "a room with a wooden table and a chair, poss...`

---

### Shot: `shot_0055` (1121.92s - 1186.64s, 时长: 64.72s)

- **ASR 状态**: `success` | **文本**: `我昨天晚上昨天晚上昨天晚上现在是最需要的的时候好看你听这有三个月的时间有一种上力叫车车有一种失败叫战力别听东西小声我妹妹在眼眼也不知道怎么样上面只是让我们继续前附下去等待最后的声明老上你需要什么钱的话你有什么把努力据该迷了叫中国人为借房间新建成和翻好的我 我都有胡松文丢了一个团三日一旅旅长被辅了中央还都不知道了` (耗时: 1.077s)
  - 词段示例: 24 段，首段: `[0.0s - 0.8s] text: "我昨天晚上"`
- **人脸状态**: `detected` | **检出数**: 5 处
  - `person_007` (matched_existing) | 相似度: 0.6754 | 帧: `shot_0055/frame_25.jpg`
  - `person_007` (matched_existing) | 相似度: 0.6404 | 帧: `shot_0055/frame_50.jpg`
  - `person_011` (new_identity) | 新出现 (最佳历史相似度: 0.2796) | 帧: `shot_0055/frame_75.jpg`
  - ... 其余 2 处见完整 predictions
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person wearing a white shirt']`
    - 环境: `a formal indoor setting, possibly a office or meeting room`
    - 动作: `['sitting']`
    - 物体: `['a wooden chair']`
    - 机位: `medium shot`
    - 不确定性: `no significant blur or low light, all objects and characters are clearly visible`
  - **帧 `frame_50.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a white shirt and glasses",   "environment": "a dimly lit indoor setting wit...`
  - **帧 `frame_75.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['two men sitting at a bar counter, one wearing a dark coat, the other in a light-colored shirt']`
    - 环境: `a bar with a counter, chairs, and a tiled wall with decorative tiles`
    - 动作: `['sitting']`
    - 物体: `['bar counter, chairs, decorative tiles on the wall']`
    - 机位: `medium shot`
    - 不确定性: `some parts of the image may be obscured by the men's clothing`

---

### Shot: `shot_0056` (1186.64s - 1247.24s, 时长: 60.60s)

- **ASR 状态**: `success` | **文本**: `还有什么周福海 连鱼死情这这么口皮情吗连鱼死情那是有内幕的洋书官的一千五万两皇帝都打电给谁了你知道吗我不想知道我感谢你其实是美金公展何时发现这网名明天就可以给你消息我有个朋友在消目委员会你那有什么知识人的话也能得这样难道这里能有什么避之间的活也来也有叛徒的这个人带着黄金在安塞啊挖出了孟悲什么孟悲孟等套跑来不及带走的文件请来在哪里了` (耗时: 1.57s)
  - 词段示例: 23 段，首段: `[0.72s - 1.6s] text: "还有什么"`
- **人脸状态**: `detected` | **检出数**: 5 处
  - `person_014` (new_identity) | 新出现 (最佳历史相似度: 0.2593) | 帧: `shot_0056/frame_25.jpg`
  - `person_015` (new_identity) | 新出现 (最佳历史相似度: 0.2458) | 帧: `shot_0056/frame_25.jpg`
  - `person_016` (new_identity) | 新出现 (最佳历史相似度: 0.482) | 帧: `shot_0056/frame_50.jpg`
  - ... 其余 2 处见完整 predictions
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: elements of 'characters' must be strings, elements of 'physical_actions' must be strings, elements of 'objects' must be strings`
    - 原始 raw 摘录: `'''json {   "characters": [     {       "description": "a person wearing a dark coat"     },     {       "description": ...`
  - **帧 `frame_50.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person with short hair and a beard, wearing a dark coat', 'a person with glasses and a suit', 'a person with short hair and a beard, wearing a dark coat']`
    - 环境: `a formal indoor setting, possibly a conference room or office`
    - 动作: `['looking at each other', 'smiling', 'talking']`
    - 物体: `['no visible objects']`
    - 机位: `medium shot`
    - 不确定性: `no significant blur or low light, but the focus is slightly off, possibly due to the depth of field`
  - **帧 `frame_75.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: elements of 'characters' must be strings, elements of 'physical_actions' must be strings, elements of 'objects' must be strings`
    - 原始 raw 摘录: `'''json {   "characters": [     {       "description": "A person wearing a dark coat"     },     {       "description": ...`

---

### Shot: `shot_0069` (1463.56s - 1466.84s, 时长: 3.28s)

- **ASR 状态**: `success` | **文本**: `干什么呀你要给他睡前呢` (耗时: 0.132s)
  - 词段示例: 2 段，首段: `[0.0s - 1.4s] text: "干什么呀"`
- **人脸状态**: `detected` | **检出数**: 3 处
  - `person_019` (new_identity) | 新出现 (最佳历史相似度: 0.2597) | 帧: `shot_0069/frame_25.jpg`
  - `person_020` (new_identity) | 新出现 (最佳历史相似度: 0.477) | 帧: `shot_0069/frame_50.jpg`
  - `person_020` (matched_existing) | 相似度: 0.8148 | 帧: `shot_0069/frame_75.jpg`
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person with dark hair, wearing a striped shirt']`
    - 环境: `a indoor setting, possibly a living room or office, with a wooden chair and a lamp on a table`
    - 动作: `['smiling and looking down']`
    - 物体: `['a wooden chair', 'a lamp on a table']`
    - 机位: `medium shot`
    - 不确定性: `some blur due to lighting conditions`
  - **帧 `frame_50.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person with dark hair, wearing a checkered shirt, seated in a room with a wooden chair and ...`
  - **帧 `frame_75.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person with dark hair, wearing a dark coat, and a light-colored shirt']`
    - 环境: `a living room with a couch, a table, and a lamp, with a wooden floor and a white wall`
    - 动作: `['smiling and looking at the camera']`
    - 物体: `['a wooden couch, a table with a lamp on it, and a lamp with a white shade']`
    - 机位: `medium shot, capturing the person from the chest up`
    - 不确定性: `some parts of the image are slightly blurred due to movement`

---

### Shot: `shot_0070` (1466.84s - 1473.12s, 时长: 6.28s)

- **ASR 状态**: `success` | **文本**: `我能猜怎么臭父猜吧` (耗时: 0.157s)
  - 词段示例: 3 段，首段: `[0.0s - 1.46s] text: "我能猜怎么"`
- **人脸状态**: `detected` | **检出数**: 3 处
  - `person_021` (new_identity) | 新出现 (最佳历史相似度: 0.5383) | 帧: `shot_0070/frame_25.jpg`
  - `person_022` (new_identity) | 新出现 (最佳历史相似度: 0.1998) | 帧: `shot_0070/frame_50.jpg`
  - `person_020` (matched_existing) | 相似度: 0.6783 | 帧: `shot_0070/frame_75.jpg`
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a white shirt",   "environment": "a well-lit indoor setting with a wooden ch...`
  - **帧 `frame_50.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a white dress with a floral pattern",   "environment": "a traditional Chines...`
  - **帧 `frame_75.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a dark coat",   "environment": "a dimly lit room with wooden furniture and a...`

---

### Shot: `shot_0095` (2017.76s - 2023.20s, 时长: 5.44s)

- **ASR 状态**: `success` | **文本**: `才两个尽量人家战马上都会做` (耗时: 0.173s)
  - 词段示例: 2 段，首段: `[0.0s - 2.0s] text: "才两个尽量"`
- **人脸状态**: `detected` | **检出数**: 3 处
  - `person_021` (matched_existing) | 相似度: 0.5992 | 帧: `shot_0095/frame_25.jpg`
  - `person_021` (matched_existing) | 相似度: 0.6395 | 帧: `shot_0095/frame_50.jpg`
  - `person_021` (matched_existing) | 相似度: 0.6193 | 帧: `shot_0095/frame_75.jpg`
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a dark coat",   "environment": "a dimly lit room with wooden furniture and a...`
  - **帧 `frame_50.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a dark coat",   "environment": "a dimly lit room with wooden furniture and a...`
  - **帧 `frame_75.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person wearing a dark coat']`
    - 环境: `a dimly lit room with wooden furniture, including a cabinet and a chair, and a bottle on a surface`
    - 动作: `["concrete physical movements, e.g., 'sitting at desk', 'walking'"]`
    - 物体: `['a wooden chair, a bottle']`
    - 机位: `medium shot`
    - 不确定性: `any blur, low light, or occlusions`

---

### Shot: `shot_0117` (2220.64s - 2271.20s, 时长: 50.56s)

- **ASR 状态**: `success` | **文本**: `你哪儿不如救着吧秋姨快去吧她比你会买是人家是成是大小姐你呀你别说我还是真娶了晚秋作二号你们俩的日子能够做你别忘了她是二房取她之前你先得去我` (耗时: 0.59s)
  - 词段示例: 12 段，首段: `[2.28s - 3.44s] text: "你哪儿不如救着吧"`
- **人脸状态**: `detected` | **检出数**: 5 处
  - `person_023` (new_identity) | 新出现 (最佳历史相似度: 0.3824) | 帧: `shot_0117/frame_25.jpg`
  - `person_024` (new_identity) | 新出现 (最佳历史相似度: 0.3567) | 帧: `shot_0117/frame_25.jpg`
  - `person_025` (new_identity) | 新出现 (最佳历史相似度: 0.4171) | 帧: `shot_0117/frame_25.jpg`
  - ... 其余 2 处见完整 predictions
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: elements of 'characters' must be strings, elements of 'physical_actions' must be strings, elements of 'objects' must be strings, missing field 'uncertainty'`
    - 原始 raw 摘录: `'''json {   "characters": [     {       "description": "A person wearing a dark coat"     },     {       "description": ...`
  - **帧 `frame_50.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: field 'characters' type str != expected list, field 'physical_actions' type str != expected list, field 'objects' type str != expected list`
    - 原始 raw 摘录: `'''json {   "characters": "a person wearing a dark coat",   "environment": "a dimly lit indoor setting with wooden stair...`
  - **帧 `frame_75.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `非法 JSON 格式: Expecting value: line 1 column 1 (char 0)`
    - 原始 raw 摘录: `'''json {   "characters": [     {       "description": "a person wearing a dark coat"     },     {       "description": ...`

---

### Shot: `shot_0133` (2442.00s - 2470.32s, 时长: 28.32s)

- **ASR 状态**: `success` | **文本**: `没了给你介绍一下文青这无态的这我们接防我玩车好文青你玩车你怕我什么呀你怎么了我认识的女人要不是他男人瞧瞧我书博我书博也不会逃到日本去我也不至于过现在只有心荒的人` (耗时: 0.616s)
  - 词段示例: 16 段，首段: `[0.0s - 1.6s] text: "没了给你介绍一下"`
- **人脸状态**: `detected` | **检出数**: 3 处
  - `person_028` (new_identity) | 新出现 (最佳历史相似度: 0.4346) | 帧: `shot_0133/frame_25.jpg`
  - `person_029` (new_identity) | 新出现 (最佳历史相似度: 0.5127) | 帧: `shot_0133/frame_50.jpg`
  - `person_028` (matched_existing) | 相似度: 0.7471 | 帧: `shot_0133/frame_75.jpg`
- **VLM 总体状态**: `success` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person wearing a dark coat', 'a person wearing a light blue dress', 'a person wearing a purple dress']`
    - 环境: `a rural setting with a dirt road and greenery, possibly a village or countryside`
    - 动作: `['standing', 'smiling', 'looking at each other']`
    - 物体: `['no visible objects', 'no visible objects', 'no visible objects']`
    - 机位: `close-up`
    - 不确定性: `any blur, low light, or occlusions`
  - **帧 `frame_50.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['two women walking on a grassy bank near a river, one wearing a dark coat and the other in a patterned dress']`
    - 环境: `a grassy bank near a river, with trees in the background, and a cloudy sky`
    - 动作: `['walking on a grassy bank near a river, with one woman in a dark coat and the other in a patterned dress']`
    - 物体: `['grass, river, trees, and a cloudy sky']`
    - 机位: `medium shot, capturing the women from the side, with a focus on their lower bodies and the river in the background`
    - 不确定性: `some parts of the image may be obscured by trees or clouds, but overall, the scene is clear and well-defined`
  - **帧 `frame_75.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a woman with short hair, wearing a light-colored dress with a blue patterned collar']`
    - 环境: `an outdoor setting with a grassy field and trees, possibly in a park or garden`
    - 动作: `['standing']`
    - 物体: `['no visible objects']`
    - 机位: `medium shot`
    - 不确定性: `some parts of the image may be blurred due to motion or low light conditions`

---

### Shot: `shot_0137` (2524.84s - 2536.24s, 时长: 11.40s)

- **ASR 状态**: `success` | **文本**: `生不了了为什么` (耗时: 0.132s)
  - 词段示例: 2 段，首段: `[0.0s - 2.42s] text: "生不了了"`
- **人脸状态**: `detected` | **检出数**: 1 处
  - `person_030` (new_identity) | 新出现 (最佳历史相似度: 0.5253) | 帧: `shot_0137/frame_25.jpg`
- **VLM 总体状态**: `success` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person with dark hair, wearing a light green dress with a dark pattern']`
    - 环境: `an indoor setting, possibly a room with a wooden floor and a light-colored wall`
    - 动作: `['standing and looking at another person']`
    - 物体: `['no significant objects detected in the frame']`
    - 机位: `medium shot, focusing on the person's face and upper body`
    - 不确定性: `no significant blur or low light, but the frame is not clear enough to confidently identify the person's identity`
  - **帧 `frame_50.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['two men standing in a dimly lit room, possibly in a museum or historical setting']`
    - 环境: `a dimly lit room with a large window or glass panel, possibly a museum or historical exhibit`
    - 动作: `['standing and looking at the window']`
    - 物体: `['window or glass panel, possibly a large window or glass panel in a museum or historical exhibit']`
    - 机位: `medium shot, focusing on the men and the window`
    - 不确定性: `some parts of the image are in shadow, making it difficult to see details`
  - **帧 `frame_75.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person wearing a dark coat']`
    - 环境: `a dimly lit room with a window, possibly a bedroom or living room`
    - 动作: `['standing']`
    - 物体: `['window frame']`
    - 机位: `medium shot`
    - 不确定性: `some objects may be partially obscured by the window frame`

---

### Shot: `shot_0149` (2609.08s - 2613.24s, 时长: 4.16s)

- **ASR 状态**: `success` | **文本**: `（空文本；原因未标注）` (耗时: 0.087s)
- **人脸状态**: `detected` | **检出数**: 3 处
  - `person_031` (new_identity) | 新出现 (最佳历史相似度: 0.2578) | 帧: `shot_0149/frame_25.jpg`
  - `person_031` (matched_existing) | 相似度: 0.9316 | 帧: `shot_0149/frame_50.jpg`
  - `person_031` (matched_existing) | 相似度: 0.8244 | 帧: `shot_0149/frame_75.jpg`
- **VLM 总体状态**: `has_rejected_frames` (逐帧状态与原样记录):
  - **帧 `frame_25.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: elements of 'characters' must be strings, elements of 'physical_actions' must be strings, elements of 'objects' must be strings`
    - 原始 raw 摘录: `'''json {   "characters": [     {       "description": "a person wearing a dark coat"     }   ],   "environment": "a mov...`
  - **帧 `frame_50.jpg` (`success`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 外观: `['a person with short hair, wearing a dark coat, and a person with short hair, wearing a white shirt']`
    - 环境: `a dimly lit indoor setting with a whiteboard and text on it, possibly a classroom or office`
    - 动作: `['standing', 'looking down']`
    - 物体: `['whiteboard with text on it']`
    - 机位: `medium shot`
    - 不确定性: `any blur, low light, or occlusions`
  - **帧 `frame_75.jpg` (`rejected`)** | `requires_human_review=True`, `semantic_status=unverified`
    - 拒识原因: `Schema validation failed: elements of 'characters' must be strings, elements of 'physical_actions' must be strings, elements of 'objects' must be strings`
    - 原始 raw 摘录: `'''json {   "characters": [     {       "description": "a person wearing a dark coat"     }   ],   "environment": "indoo...`

---

## 6. 最终结论与交付说明

- **交付状态**: 15-Shot 盲选小样验证已全部完成，三模块数据与 Provenance 溯源均已真实落盘。
- **下一阶段动作**: **STOPReview**。等待用户/Codex 对本小样的数据格式、拒识分布、主观泄露案例与聚类簇进行人工审查，在获得正式授权前严禁推进 X1.1、严禁进入 50-shot Gold/holdout/X2 或生产渲染！
