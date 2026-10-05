# X0｜技术选型与复用 Spike 调研与实测报告

**执行时间：** 2026-10-05  
**执行角色：** 🏛️ 全栈架构师 × ⚡ 算法与性能专家  
**执行分支：** `agent-poc/a1-contracts`  
**基线 HEAD：** `20495ea` (工作区干净)  
**实验环境：** Apple Silicon M2 (arm64), macOS, Python 3.12 (uv 隔离环境) + Python 3.9 (系统), FFmpeg 7.0  
**实验目录：** `/private/tmp/x0-technology-spike` (所有脚本、中间切片、抽帧、原始输出与日志已完整归档供独立核验)  
**源片路径：** `/Users/yoyotaozhou/Documents/video-moment-validation/data/input/qianfu_ep18.mp4` (VMV 保持只读)  

---

## 0. 执行背景与边界说明

为落实交接文档 (`poc-revalidation-handoff.md`) 与三份独立技术审计报告的审查决议，本项目全面冻结原 A8/A9/A10 及旧 A5/A6/A7 规则。X0 Spike 旨在为 X1（L1 自动素材理解 Benchmark）探索开源技术复用路线，评估镜头切分、代表帧、OCR/ASR、VLM 客观观察、以及长视频检索的候选可行性。

**实验边界与隔离声明**：
1. 实验代码与临时产物严格限定在 `/private/tmp/x0-technology-spike/`，主生产链 (`src/`)、外层仓库与 VMV 仓库保持严格只读；
2. 严禁使用旧 `canonical_evidence`、`EP18_REAL_SCENE_MAP`、Topic A/B、旧 Requirements、旧 Storyboard 等历史数据作为实验输入；
3. 严禁剧情人物 Hard-code，严禁下载大模型权重，严禁整片上传，严禁打印敏感凭证；
4. 实验选选中立短片段（EP18: 900.0s–930.0s），避开历史事故点；
5. 所有技术评估均为“候选技术方案比较”，不自宣 PASS，最终选型待人工 Review 裁定。

---

## 一、候选开源项目源码与 License 深度审计

我们在 `/private/tmp/x0-technology-spike/repos` 中克隆并核查了候选项目源码：

| 候选项目 | 仓库地址与审计 Commit | License 声明 | 关键源码路径与核心符号 | 架构特征与 X1 适配性审计 |
| :--- | :--- | :--- | :--- | :--- |
| **`video-recap-skills`** | `zenstory-ai/video-recap-skills`<br>`5391686229` (2026-10-04, `v0.6.2`) | **MIT** (`LICENSE`) | `skills/video-understanding/scripts/detect.py`: `detect_scenes` (L13)<br>`skills/video-understanding/scripts/extract.py`: `extract_frames` (L40)<br>`skills/video-understanding/scripts/vlm.py`: `vlm_prompt_payload` (L23), `_parse_vlm_depth_response` (L35)<br>`skills/video-understanding/scripts/asr.py`: `transcribe_audio` (L88) | **候选方案（需裁剪）**。<br>1. 场景检测依赖 `ffmpeg -vf scdet`；抽帧基于 fps。<br>2. **关键审计发现**：其原始 VLM Prompt 包含【深层分析】及人物背景研究注入 (`_load_name_glossary`)，**不天然符合 L1 客观事实标准**。若用于 X1，必须做外科手术式裁剪：删除深层动机推测，严禁输入剧名《潜伏》及人名词典，仅保留物理视觉描述。 |
| **`marlin-cli`** | `shu-bamma/marlin-cli`<br>`62927d174e` (2026-07-01, `v0.1.24`) | CLI 源码: **Apache-2.0** (`LICENSE`)<br>*(注：Marlin-2B 模型权重为模型专有协议，与 CLI 分开)* | `src/marlin/cli.py`: `_require_signin` (L62), `_do_setup` (L124), `caption` (L314), `find` (L431)<br>`src/marlin/auth.py`: `login` (L84), `current` (L42)<br>`src/marlin/engines.py`: `install_mlx` (L180) | **候选方案（中长期本地化）**。<br>1. 针对 Marlin-2B 视频模型，提供 `.caption()` 与 `.find()` 时间定位接口，面向 Apple Silicon MLX 8bit 量化与 hosted API。<br>2. **认证机制核实修正**：查实 `cli.py` L66 `if auth.email() or is_json() or not sys.stdin.isatty(): return`，**非交互式 Agent/JSON 调用豁免 Google 登录**，此前“强制登录”断言有误。<br>3. 本地运行需构建 MLX 引擎并下载模型权重；因沙箱禁止下载大模型且未配置 hosted 凭证，本轮未启动实际模型推理。 |
| **`VideoRAG`** | `HKUDS/VideoRAG`<br>`c412a093a8` (2026-03-18) | **MIT** (`LICENSE`) | `VideoRAG-algorithm/videorag_longervideos.py` (L1)<br>`VideoRAG-algorithm/videorag/` | **架构参考（多集阶段）**。<br>论文级长视频检索增强生成框架，结合辅助文本对长视频进行动态分层检索。适合 X3/X4 多集素材检索架构参考，单集阶段（单集 ~350 镜头）直接引入属于过度工程。 |
| **`PySceneDetect`** | PyPI `scenedetect==0.7.1` | **BSD-3-Clause** | `scenedetect.detectors`: `ContentDetector`, `AdaptiveDetector`<br>`scenedetect.scene_manager`: `SceneManager` | **候选方案（实测通过）**。<br>依赖 OpenCV。实测在非 GUI 环境下首次加载动态库耗时较长（约 10~15 秒），但随后实际镜头检测运行正常，切点与 VMV 高度重合。 |
| **`VMV Stage 1`** | `video-moment-validation`<br>(本地只读工作树) | 内部只读 | `src/vmv/scene_detection.py`:<br>`read_frame_scores` (L10)<br>`select_cutpoints` (L48) | **候选方案（实测通过）**。<br>基于 `ffmpeg signalstats` 提取逐帧 `scene_score` 与 `YDIF`，通过局部中位数峰值自适应算法切分，零外部 C 库依赖，性能稳定。 |

---

## 二、真实短片段镜头检测横向对比实测 (EP18: 900.0s–930.0s)

测试片段：`/private/tmp/x0-technology-spike/neutral_900_930.mp4`（截取自 EP18 900.0s–930.0s，时长 30.0 秒，750 帧，25fps，避开敏感事故点）。

### 2.1 四种检测方法实测数据对比

所有测试脚本均具备 `atexit` 清理与 `<=50s` 超时保护，各方法真实运行命令、输出 JSON 及结果如下：

| 方法与工具 | 核心参数 | 运行命令 / 驱动脚本 | 耗时 (实测) | 检出切点数 (30s 内) | 检出切点绝对时间戳 (秒) | 对应划分 Shot 结构 |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| **VMV Stage 1 (直接调用原函数)** | `mode=adaptive`<br>`threshold=0.12`<br>`floor=0.06`<br>`ratio=3.0` | 脚本：`run_vmv_original_spike.py`<br>调用：`vmv.scene_detection.read_frame_scores` + `select_cutpoints` | 提取帧分: **3.102s**<br>自适应计算: **0.0003s**<br>总计: **3.102s** | **4** | `[910.20, 913.00, 915.36, 925.60]` | 5 个 Shot：<br>S1: 900.00–910.20 (10.20s)<br>S2: 910.20–913.00 (2.80s)<br>S3: 913.00–915.36 (2.36s)<br>S4: 915.36–925.60 (10.24s)<br>S5: 925.60–930.00 (4.40s) |
| **PySceneDetect ContentDetector** | `threshold=27.0`<br>`min_scene_len=15` | 脚本：`run_pyscenedetect_spike.py`<br>调用：`scenedetect.detectors.ContentDetector` | **8.455s** | **4** | `[910.20, 913.00, 915.36, 925.60]` | 5 个 Shot，与 VMV Stage 1 切点**完全重合**。 |
| **PySceneDetect AdaptiveDetector** | `adaptive_threshold=3.0`<br>`min_scene_len=15` | 脚本：`run_pyscenedetect_spike.py`<br>调用：`scenedetect.detectors.AdaptiveDetector` | **7.842s** | **7** | `[910.20, 911.36, 913.00, 915.36, 916.48, 921.60, 925.60]` | 8 个 Shot，在主体镜头内捕捉到 3 处细微动作切变。 |
| **`video-recap-skills` `detect.py`** | `threshold=0.15`<br>(scdet=15) | 脚本：`run_video_recap_skills_spike.py`<br>调用：`detect.detect_scenes` (`ffmpeg scdet`) | **0.382s** | **0** | `[]` (未检出硬切) | 1 个完整 30s 场景（默认阈值在该低照度平缓镜头下未触发）。 |

### 2.2 实测关键发现
1. **VMV Stage 1 与 PySceneDetect ContentDetector 达成绝对一致**：
   - 两种不同实现对同一 30 秒片段的物理硬切点判定完全一致（910.20s, 913.00s, 915.36s, 925.60s），证明该切点具备跨工具的可复现性；
   - VMV Stage 1 耗时 3.102s，PySceneDetect Content 耗时 8.455s，VMV 方案在运行速度和轻量化（零第三方 C 库依赖）上具有优势。
2. **`video-recap-skills` 的 `scdet` 阈值敏感性**：
   - 其默认采用 `ffmpeg -vf scdet=threshold=15`，实测耗时极短（0.382s），但在本测试段内未产生切点。说明标准直方图差分检测在色调较暗的场景下灵敏度低于边缘峰值差分（`signalstats.YDIF`）与 HSV 颜色空间分析。
3. **依赖挂起误判纠偏说明**：
   - 早期测试曾记录 `import cv2` 在 5 秒超时设置下返回 `-999`。本次经隔离复测确认，该环境在首次动态加载多项 dylib 时耗时约 10~15 秒，并非死锁；加长超时后 PySceneDetect 成功导入并完成实测。特此纠正，不作为否决依据。

---

## 三、代表帧抽取与原生 Vision OCR 实测

### 3.1 代表帧抽取核验 (25% / 50% / 75%)
依据 VMV Stage 1 划分的 5 个 Shot，按 25%、50%、75% 采样抽取 15 张代表帧 JPG，生成至 `/private/tmp/x0-technology-spike/frames/`：
- 总抽帧耗时：**0.85 秒**（平均单张 **0.057s**）；
- 抽取位置与文件大小：
  - `shot_001`: 902.55s (48KB), 905.10s (50KB), 907.65s (57KB)
  - `shot_002`: 910.90s (40KB), 911.60s (40KB), 912.30s (39KB)
  - `shot_003`: 913.59s (41KB), 914.18s (57KB), 914.77s (49KB)
  - `shot_004`: 917.92s (39KB), 920.48s (40KB), 923.04s (49KB)
  - `shot_005`: 926.70s (46KB), 927.80s (49KB), 928.90s (36KB)
- 抽帧核验：时码严格处于所属 Shot 的物理区间内，无越界，文件生成有效。

### 3.2 macOS 原生 Vision OCR 离线实测
为评估无外部 API 条件下的文本提取能力，采用 Swift 编译原生二进制 (`vision_ocr_bin`) 调用系统 `VNRecognizeTextRequest`：
- **实测耗时**：15 张代表帧处理总耗时 **5.55 秒**（平均单张耗时 **370 毫秒**）；
- **实测文本捕获**：
  - `shot_001` (905.10s 抽帧) $\rightarrow$ 检出硬字幕：`“妹子你就不该跟他”`
  - `shot_001` (907.65s 抽帧) $\rightarrow$ 检出硬字幕：`“你看到什么还不自己心里难受吗”`
  - `shot_003` (914.18s 抽帧) $\rightarrow$ 检出硬字幕：`“你给我念念这个”`
  - `shot_004` (923.04s 抽帧) $\rightarrow$ 检出硬字幕：`“忧伤被泪湿坏了翅膀”`
  - `shot_005` (926.70s 抽帧) $\rightarrow$ 检出硬字幕：`“甲骨文说我太古老”`
  - `shot_005` (927.80s 抽帧) $\rightarrow$ 检出硬字幕：`“用骨文说我太古老”`
- **客观局限性说明**：
  - 本测试表明系统级 Vision OCR 能够离线检出视频硬字幕；
  - 但**当前未建立黄金标注集 (Gold Set)，未计算字符错误率 (CER/WER)**，存在微小字形识别漂移（如“甲骨文”识别为“用骨文”）；
  - 尚不能得出“完全胜任”、“生产级”或“准确率极高”的结论，仅作为 X1 中 OCR 模块的有效候选，必须在 X1 中与 ASR 结合并进行量化评测。

### 3.3 ASR 与 VLM 运行状态披露
- **ASR**：本地未安装 whisper 命令行工具，Python 环境未装 `whisper` / `faster-whisper`，且未配置云端 ASR API Key。如实记录为 **未运行 (UNAVAILABLE_NO_LOCAL_ENGINE_OR_KEY)**。
- **VLM**：未配置多模态模型 API Key，Marlin-2B 本地模型未下载权重（遵守禁止大模型下载约束）。如实记录为 **未运行 (UNAVAILABLE_MODEL_NOT_DOWNLOADED)**。
- **Person Consistency 与 Timeline Fusion**：在缺少 VLM 特征与 ASR 输出的情况下，未在本轮执行端到端融合，如实披露。

---

## 四、耗时与成本测算 (实测基准 vs 参数化估算模型)

> **严正原则**：严格区分实测数据与理论公式推导，严禁给出未经测试的确定性财务结论。

### 4.1 已测步骤基准测量值 (EP18 30秒片段)
- **镜头检测 (VMV Stage 1)**：30s 视频耗时 **3.102 秒**（约 0.103 秒计算耗时 / 秒视频）。
- **代表帧抽取**：15 张抽帧耗时 **0.85 秒**（平均 **0.057 秒 / 张**）。
- **Vision OCR**：15 张抽帧耗时 **5.55 秒**（平均 **0.370 秒 / 张**）。
- **镜头密度测量**：在 30 秒中立对话片段中检出 5 个 Shot，平均每个 Shot 时长为 **6.0 秒**（不同于宏观假设的 7.5 秒）。

### 4.2 单集全量处理估算模型 (EP18, 2702 秒 ≈ 45.03 分钟)

#### 1. 已测模块外推计算：
- **Shot 数量外推**：
  - 按实测镜头密度 (6.0s/Shot)：约 $2702 / 6.0 \approx 450$ 个 Shot；
  - 按理论宏观假设 (7.5s/Shot)：约 $2702 / 7.5 \approx 360$ 个 Shot；
- **抽帧量外推 (每 Shot 抽 3 帧)**：$1080 \sim 1350$ 张 JPG；
- **已测环节理论计算耗时**：
  - 镜头检测耗时：$2702 \times 0.103 \approx 278 \text{ 秒} \ (4.6 \text{ 分钟})$；
  - 抽帧耗时 (1080 帧)：$1080 \times 0.057 \approx 62 \text{ 秒} \ (1.0 \text{ 分钟})$；
  - Vision OCR 耗时 (1080 帧)：$1080 \times 0.370 \approx 400 \text{ 秒} \ (6.7 \text{ 分钟})$；
  - 已测环节小计：约 **12.3 分钟**。

#### 2. 未测模块参数化公式 (待 X1 实测填充)：
- **ASR 耗时与成本**：
  $$T_{\text{asr}} = D_{\text{audio}} \times \text{RTF}_{\text{asr}}, \quad C_{\text{asr}} = D_{\text{audio\_min}} \times P_{\text{asr\_per\_min}}$$
  *(注：$\text{RTF}_{\text{asr}}$ 依赖本地模型如 faster-whisper 在 M2 上的实时率；$P_{\text{asr}}$ 依赖所选云端 API 价格，当前未定)*
- **VLM 客观视觉分析耗时与成本**：
  $$T_{\text{vlm}} = \frac{N_{\text{shots}}}{\text{Concurrency}} \times \text{Latency}_{\text{req}}$$
  $$C_{\text{vlm}} = N_{\text{shots}} \times \left( \text{Tokens}_{\text{in}} \times P_{\text{token\_in}} + \text{Tokens}_{\text{out}} \times P_{\text{token\_out}} \right)$$
  *(注：单 Shot 代表帧打包 token 数、并发限额及模型单价待定，不给出具体总金额)*

### 4.3 30 集扩展性推演
- **数据规模**：30 集 $\times$ 45 分钟 = 1350 分钟视频；预计产生约 $10,800 \sim 13,500$ 个 Shot，抽帧量约 $32,400 \sim 40,500$ 张（磁盘存储约 1.5 ~ 2.0 GB）；
- **批处理模式**：由于素材 Ingest 属于一次性工作，已测的基础信号分析与抽帧可在单机无头模式下通过批处理完成；
- **架构扩展契约要求**：所有处理产物必须强绑定规范键值：
  - `series_id`
  - `episode_id`
  - `media_id`
  - `shot_id`
  - `episode_scope[]`
  确保后续跨集检索（X3/X4）面对多集素材统一 Evidence 库时具备可寻址性。

---

## 五、X1 落地路线推荐与技术风险防范

### 5.1 候选技术推荐排序 (待人审)
1. **Shot Detection & Frame Extraction**：
   - **推荐候选**：VMV Stage 1 算法。与 PySceneDetect ContentDetector 切点完全重合，且零额外 C 库依赖，性能更优。
2. **Dialogue (对白提取)**：
   - **推荐候选**：macOS 原生 Vision OCR（硬字幕） + 离线 Whisper（语音转录）双源重合融合。
3. **VLM Objective Observation (视觉观察)**：
   - **推荐候选**：参考 `video-recap-skills` 的场景多帧打包与重试缓存设计，但必须重写 Prompt，严格限制为：
     ```json
     {
       "visible_person_ids": ["person_001"],
       "scene": {"location_type": "indoor", "environment": "office"},
       "observable_actions": ["standing", "nodding"],
       "objects": ["desk", "tea_cup"],
       "camera": {"shot_scale": "medium_shot", "movement": "static"}
     }
     ```
   - **绝对红线**：严禁输入《潜伏》剧名、剧情百科；严禁输出“试探”、“看破”、“怀疑”、“驭人术”等解释性主观推断。

### 5.2 历史缺陷与避坑原则
1. **防范虚假标注与答案泄漏**：严禁向 Evidence 中注入任何与需求对应的预设单元；
2. **防范自评放行**：X1 验证必须建立独立且隔离的 50 Shot Gold Set，由人工直接检视原片标注真值，计算 Boundary Precision、Recall 与 F1，严禁自动化脚本自测自评通过；
3. **实验脚本合规说明**：早期测试脚本 `run_shot_detection.py` 因缺少 `atexit` 与超时管理已确认为不合规并废弃；后续所有测试（`run_vmv_original_spike.py`, `run_pyscenedetect_spike.py`, `run_video_recap_skills_spike.py`, `batch_vision_ocr.py`）均已严格配置 `atexit` 进程回收与超时控制。

---

## 六、环境清理与交付状态

1. **临时产物归档**：全部实验文件保留在 `/private/tmp/x0-technology-spike/`，包含切片视频、15 张代表帧、OCR 识别 JSON、PySceneDetect 结果、VMV 原生结果及 GitHub 候选源码，供独立核验；
2. **后台进程清理**：已显式终止所有测试子进程与任务，确认后台无孤儿任务；
3. **交付范围**：本次提交仅修改本报告与 `PROGRESS.md`，状态置为 `X0 awaiting_review`，不自行进入 X1，不 push。
