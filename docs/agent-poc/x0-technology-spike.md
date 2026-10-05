# X0｜技术选型与复用 Spike 调研与实测报告

**执行时间：** 2026-10-05  
**执行角色：** 🏛️ 全栈架构师 × ⚡ 算法与性能专家  
**执行分支：** `agent-poc/a1-contracts`  
**基线 HEAD：** `20495ea` (工作区干净)  
**实验环境：** Apple Silicon M2 (arm64), macOS, Python 3.12 (uv 隔离环境) + Python 3.9 (系统), FFmpeg 7.0  
**实验目录：** `/private/tmp/x0-technology-spike` (所有脚本、中间切片、抽帧、原始输出与日志已完整归档供独立核验)  
**源片路径：** `/Users/yoyotaozhou/Documents/video-moment-validation/data/input/qianfu_ep18.mp4` (VMV 保持只读)  

---

## 0. 执行背景与边界声明

为响应交接文档 (`poc-revalidation-handoff.md`) 与三份独立技术审计报告的结论，原 A8/A9/A10 及旧 A5/A6/A7 规则全面冻结。X0 Spike 旨在为 X1（L1 自动素材理解 Benchmark）探索开源技术复用路线，横向对比镜头切分、代表帧抽取、文本提取（OCR/ASR）、VLM 客观观察及多集检索的候选可行性。

**实验边界与隔离声明**：
1. 实验代码与临时产物严格限定在 `/private/tmp/x0-technology-spike/`；主生产链 (`src/`)、外层仓库与 VMV 仓库保持严格只读；
2. 严禁使用旧 `canonical_evidence`、`EP18_REAL_SCENE_MAP`、Topic A/B、旧 Requirements、旧 Storyboard 等历史数据作为实验输入；
3. 严禁剧情人物 Hard-code，严禁下载大模型权重，严禁整片上传，严禁打印敏感凭证；
4. 实验选选中立短片段（EP18: 900.0s–930.0s），避开历史审计揭露的事故区间；
5. 所有技术选型均为“候选技术方案比较”，不自宣 PASS，最终选型待人工 Review 裁定。

---

## 一、候选开源项目源码与 License 审计

我们在 `/private/tmp/x0-technology-spike/repos` 中克隆并核查了候选项目源码与符号：

| 候选项目 | 源码仓库与审计 Commit | License 声明 | 关键源码路径与精确符号行号 | 架构特征与 X1 适配性审计 |
| :--- | :--- | :--- | :--- | :--- |
| **`video-recap-skills`** | `zenstory-ai/video-recap-skills`<br>`5391686229` (2026-10-04, `v0.6.2`) | **MIT** (`LICENSE`) | `skills/video-understanding/scripts/detect.py`: `detect_scenes` (L13)<br>`skills/video-understanding/scripts/extract.py`: `extract_frames` (L40)<br>`skills/video-understanding/scripts/vlm.py`: `vlm_prompt_payload` (L23), `_parse_vlm_depth_response` (L35)<br>`skills/video-understanding/scripts/asr.py`: `_load_name_glossary` (L26), `transcribe_audio` (L88) | **候选方案（需裁剪）**。<br>1. 场景检测依赖 `ffmpeg -vf scdet`；抽帧基于 fps。<br>2. **关键审计发现**：其原始流程包含【深层分析】（`vlm.py` L35）与人名词典注入（`asr.py` L26 `_load_name_glossary` 从 `background_research.json` 加载），**不天然符合 L1 客观事实标准**。若用于 X1，必须做外科手术式裁剪：删除深层动机推测，严禁输入剧名《潜伏》及人名词典，仅保留物理视觉描述。 |
| **`marlin-cli`** | `shu-bamma/marlin-cli`<br>`62927d174e` (2026-07-01, `v0.1.24`) | CLI 源码: **Apache-2.0** (`LICENSE`)<br>*(注：底座 Marlin-2B 模型权重 License 未核验，与 CLI 分开)* | `src/marlin/cli.py`: `_require_signin` (L62), `_do_setup` (L124), `caption` (L362), `find` (L434)<br>`src/marlin/auth.py`: `login` (L216), `current` (L42)<br>`src/marlin/engines.py`: `install_mlx` (L359) | **候选方案（中长期本地化）**。<br>1. 针对 Marlin-2B 视频模型，提供 `.caption()` 与 `.find()` 时间定位接口，面向 Apple Silicon MLX 8bit 量化与 hosted API。<br>2. **认证机制核查**：查实 `cli.py` L66 `if auth.email() or is_json() or not sys.stdin.isatty(): return`，**非交互式 Agent 调用或指定 `--json` 时豁免 Google 登录**。<br>3. 本地运行需通过 `engines.install_mlx` (L359) 构建 MLX 引擎并下载模型权重；因沙箱禁止下载大模型且未配置 hosted 凭证，本轮未启动实际模型推理。 |
| **`VideoRAG`** | `HKUDS/VideoRAG`<br>`c412a093a8` (2026-03-18) | **MIT** (`LICENSE`) | `VideoRAG-algorithm/videorag_longervideos.py` (L1)<br>`VideoRAG-algorithm/videorag/` | **架构参考（多集阶段）**。<br>论文级长视频检索增强生成框架，结合辅助文本对长视频进行动态分层检索。适合 X3/X4 多集素材检索架构参考，单集阶段（单集 ~350 镜头）直接引入属于过度工程。 |
| **`PySceneDetect`** | PyPI `scenedetect==0.7.1` | **BSD-3-Clause** | `scenedetect.detectors`: `ContentDetector`, `AdaptiveDetector`<br>`scenedetect.scene_manager`: `SceneManager` | **候选方案（实测通过）**。<br>依赖 OpenCV (`opencv-python-headless 5.0.0.93`)。实测运行成功，切点与 VMV 一致。 |
| **`VMV Stage 1`** | `video-moment-validation`<br>工作树路径：`.vmv-runner/worktrees/stage1-codex-local-run` | 内部只读 | `src/vmv/scene_detection.py`:<br>`read_frame_scores` (L10)<br>`select_cutpoints` (L48) | **候选方案（实测通过）**。<br>工作树 HEAD: `46d9e8d0a5cbd16b7e1a14b7e14d1e819bd94fce`（主仓库 HEAD 为 `b33feb807fc73f05d7bf3768d4f1ebc1db3ceccb`）。基于 `ffmpeg signalstats` 提取逐帧 `scene_score` 与 `YDIF`，通过局部中位数峰值自适应算法切分，零外部 C 库依赖，性能稳定。 |

---

## 二、真实短片段镜头检测横向对比实测 (EP18: 900.0s–930.0s)

测试片段：`/private/tmp/x0-technology-spike/neutral_900_930.mp4`（截取自 EP18 900.0s–930.0s，时长 30.0 秒，750 帧，25fps，避开敏感事故点）。

### 2.1 四种检测方法实测数据对比

测试脚本输出完整保存在 `/private/tmp/x0-technology-spike/`，实测耗时与切点数据严格取自原始 JSON 记录：

| 方法与工具 | 核心参数与调用方式 | 驱动脚本与原始记录文件 | 实际耗时记录 | 检出切点数 (30s 内) | 检出切点绝对时间戳 (秒) | 对应划分 Shot 结构说明 |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| **VMV Stage 1 (直接调用原函数)** | `mode=adaptive`<br>`threshold=0.12`<br>`floor=0.06`<br>`ratio=3.0` | 脚本：`run_vmv_original_spike.py`<br>记录：`vmv_original_results.json`<br>引入：`.vmv-runner/worktrees/stage1-codex-local-run/src/vmv/scene_detection.py` | 提取帧分: **3.102s**<br>自适应计算: **0.00488s**<br>总计: **3.107s** | **4** | `[910.20, 913.00, 915.36, 925.60]` | 划分出 5 个 Shot：<br>S1: 900.00–910.20 (10.20s)<br>S2: 910.20–913.00 (2.80s)<br>S3: 913.00–915.36 (2.36s)<br>S4: 915.36–925.60 (10.24s)<br>S5: 925.60–930.00 (4.40s) |
| **PySceneDetect ContentDetector** | `threshold=27.0`<br>`min_scene_len=15` | 脚本：`run_pyscenedetect_spike.py`<br>记录：`pyscenedetect_results.json`<br>调用：`scenedetect.detectors.ContentDetector` | import 耗时: **0.331s**<br>检测耗时: **8.455s** | **4** | `[910.20, 913.00, 915.36, 925.60]` | 划分出 5 个 Shot，切点与 VMV Stage 1 检出结果完全重合。 |
| **PySceneDetect AdaptiveDetector** | `adaptive_threshold=3.0`<br>`min_scene_len=15` | 脚本：`run_pyscenedetect_spike.py`<br>记录：`pyscenedetect_results.json`<br>调用：`scenedetect.detectors.AdaptiveDetector` | 检测耗时: **1.918s** | **7** | `[910.20, 911.36, 913.00, 915.36, 916.48, 921.60, 925.60]` | 划分出 8 个 Shot。多出的 3 个切点（911.36, 916.48, 921.60）属于自适应算法敏感度差异，未经逐帧目视确认为真实有效物理硬切。 |
| **`video-recap-skills` `detect.py`** | `threshold=0.15`<br>(wrapper显式传入) | 脚本：`run_video_recap_skills_spike.py`<br>记录：`video_recap_skills_results.json`<br>调用：`detect.detect_scenes` (`ffmpeg scdet`) | 检测耗时: **0.382s** | **0** | `[]` (未检出硬切) | 整个 30s 视作 1 个场景。原因未确定，可能受后处理短场景合并机制 (`_merge_short_scenes`) 或 `scdet` 阈值参数影响，未经拆分核验。 |

### 2.2 运行诊断与误判纠正说明
1. **PySceneDetect 导入测试核查**：
   - 早期单次测试曾在 5 秒超时设置下返回 `-999`，超时原因未定；
   - 本次进行隔离复测（`test_cv2_isolated.py`），实测 `import cv2` 与 `import scenedetect` 耗时为 **0.331 秒**，成功完成导入与检测，不存在动态链接死锁问题，特此更正记录。
2. **切点跨工具重合度**：
   - VMV Stage 1 原生算法与 PySceneDetect ContentDetector 在该片段切点判定完全一致，表明该物理切点具备跨工具的可复现性。
   - VMV Stage 1 耗时 3.107s，PySceneDetect Content 耗时 8.455s，VMV 方案在运行耗时与依赖精简度上具有优势。

---

## 三、代表帧抽取与原生 Vision OCR 实测

### 3.1 代表帧抽取核验 (25% / 50% / 75%)
依据 VMV Stage 1 划分的 5 个 Shot，按 25%、50%、75% 采样抽取 15 张代表帧 JPG，生成至 `/private/tmp/x0-technology-spike/frames/`：
- **抽帧耗时核对**：根据 `spike_execution_report.json` 中 15 次抽帧命令的 `elapsed_sec` 实际求和，总耗时为 **0.8440 秒**（平均单张耗时 **0.0563 秒**）；
- **抽取时码核验**：
  - `shot_001`: 902.55s (48KB), 905.10s (50KB), 907.65s (57KB)
  - `shot_002`: 910.90s (40KB), 911.60s (40KB), 912.30s (39KB)
  - `shot_003`: 913.59s (41KB), 914.18s (57KB), 914.77s (49KB)
  - `shot_004`: 917.92s (39KB), 920.48s (40KB), 923.04s (49KB)
  - `shot_005`: 926.70s (46KB), 927.80s (49KB), 928.90s (36KB)
- 抽帧核验：时码均处于所属 Shot 的物理区间内，无越界，文件生成有效。

### 3.2 macOS 原生 Vision OCR 实测
采用 Swift 编译原生二进制 (`vision_ocr_bin`) 调用系统 `VNRecognizeTextRequest` 对 15 张代表帧进行识别：
- **实测耗时**：15 张代表帧处理总耗时 **5.55 秒**（平均单张耗时 **370 毫秒**）；
- **实测捕获文本**（记录于 `ocr_results_900_930.json`）：
  - `shot_001` (905.10s) $\rightarrow$ 检出硬字幕：`“妹子你就不该跟他”`
  - `shot_001` (907.65s) $\rightarrow$ 检出硬字幕：`“你看到什么还不自己心里难受吗”`
  - `shot_003` (914.18s) $\rightarrow$ 检出硬字幕：`“你给我念念这个”`
  - `shot_004` (923.04s) $\rightarrow$ 检出硬字幕：`“忧伤被泪湿坏了翅膀”`
  - `shot_005` (926.70s) $\rightarrow$ 检出硬字幕：`“甲骨文说我太古老”`
  - `shot_005` (927.80s) $\rightarrow$ 检出硬字幕：`“用骨文说我太古老”` (微小字符漂移)
- **客观局限性说明**：
  - 本测试仅表明系统级 Vision OCR 在当前样帧中成功检出文字；
  - **当前测试未建立黄金标注集 (Gold Set)，未计算字符错误率 (CER/WER)**；
  - 尚不能得出“生产级”、“完全胜任”或“准确率极高”等定性结论，字符完整度与跨场景泛化能力待在 X1 中进行量化基准测评。

### 3.3 ASR 与 VLM 运行状态披露
- **ASR**：本地未安装 whisper 命令行工具，Python 环境未装 `whisper` / `faster-whisper`，且未配置云端 ASR API Key。如实记录为 **未运行 (UNAVAILABLE_NO_LOCAL_ENGINE_OR_KEY)**。
- **VLM**：未配置多模态模型 API Key，Marlin-2B 本地模型未下载权重（遵守禁止大模型下载约束）。如实记录为 **未运行 (UNAVAILABLE_MODEL_NOT_DOWNLOADED)**。
- **Person Consistency 与 Timeline Fusion**：跨镜头人物匿名一致性与时间轴融合在缺少 VLM 与 ASR 输出的情况下，**未在本次运行**。

---

## 四、耗时与成本测算 (实测基准 vs 参数化估算模型)

> **严正声明**：本节严格区分已测数据的线性外推与未测环节的参数化公式，不给出任何未经核验的虚假总成本或总耗时结论。

### 4.1 已测步骤基准测量值 (EP18 30秒片段)
- **镜头检测 (VMV Stage 1)**：30s 视频耗时 **3.107 秒**（约 0.103 秒计算耗时 / 秒视频）。
- **代表帧抽取**：15 张抽帧总耗时 **0.844 秒**（平均 **0.0563 秒 / 张**）。
- **Vision OCR**：15 张抽帧总耗时 **5.55 秒**（平均 **0.370 秒 / 张**）。
- **镜头密度实测**：30 秒测试段检出 5 个 Shot，平均每个 Shot 时长为 **6.0 秒**（明确区分此前理论假设的 7.5 秒）。

### 4.2 单集全量处理估算模型 (EP18, 2702 秒 ≈ 45.03 分钟)

#### 1. 已测模块外推范围（仅供参考）：
- **Shot 数量外推**：
  - 若按实测平均 6.0s/Shot 外推：全集约 $2702 / 6.0 \approx 450$ 个 Shot；
  - 若按宏观假设 7.5s/Shot 外推：全集约 $2702 / 7.5 \approx 360$ 个 Shot；
- **抽帧量外推 (每 Shot 抽 3 帧)**：$1080 \sim 1350$ 张 JPG；
- **已测环节理论计算耗时**：
  - 镜头检测耗时（VMV 方案）：$2702 \times 0.103 \approx 278 \text{ 秒} \ (4.6 \text{ 分钟})$；
  - 抽帧耗时 (1080 帧)：$1080 \times 0.0563 \approx 60.8 \text{ 秒} \ (1.0 \text{ 分钟})$；
  - Vision OCR 耗时 (1080 帧)：$1080 \times 0.370 \approx 400 \text{ 秒} \ (6.7 \text{ 分钟})$；
  - 已测环节小计：约 **12.3 分钟**。

#### 2. 未测模块参数化公式 (待 X1 实测确定，总体未知)：
- **ASR 耗时与成本**：
  $$T_{\text{asr}} = D_{\text{audio}} \times \text{RTF}_{\text{asr}}, \quad C_{\text{asr}} = D_{\text{audio\_min}} \times P_{\text{asr\_per\_min}}$$
  *(注：$\text{RTF}_{\text{asr}}$ 与 $P_{\text{asr}}$ 依赖后续选定的离线引擎或云端 API 单价，参数待定)*
- **VLM 客观视觉分析耗时与成本**：
  $$T_{\text{vlm}} = \frac{N_{\text{shots}}}{\text{Concurrency}} \times \text{Latency}_{\text{req}}$$
  $$C_{\text{vlm}} = N_{\text{shots}} \times \left( \text{Tokens}_{\text{in}} \times P_{\text{token\_in}} + \text{Tokens}_{\text{out}} \times P_{\text{token\_out}} \right)$$
  *(注：单 Shot 代表帧打包 token 规则、并发限额及模型单价待定，不预判数值)*

### 4.3 30 集扩展性推演
- **数据规模**：30 集 $\times$ 45 分钟 = 1350 分钟视频；预计产生约 $10,800 \sim 13,500$ 个 Shot，抽帧量约 $32,400 \sim 40,500$ 张（磁盘存储约 1.5 ~ 2.0 GB）；
- **架构扩展契约要求**：所有处理产物必须强绑定规范键值：
  - `series_id`
  - `episode_id`
  - `media_id`
  - `shot_id`
  - `episode_scope[]`
  确保后续跨集检索面对多集素材统一 Evidence 库时具备可寻址性。

---

## 五、十二项核心评估维度复核映射表

依据交接文档中列出的十二项核心评估维度，本 Spike 的复核结论如下：

| # | 评估维度 | X0 Spike 调研与实测结论 | 后续落地建议 |
| :---: | :--- | :--- | :--- |
| 1 | **Shot Detection** | VMV Stage 1 原生函数与 PySceneDetect ContentDetector 达成 100% 切点重合。VMV 耗时 3.107s，PySceneDetect 耗时 8.455s。 | 候选首选 VMV Stage 1，备选 PySceneDetect Content。 |
| 2 | **Representative Frames** | 15 张代表帧按 25%、50%、75% 提取成功，总耗时 0.8440s，时码均在段内有效。 | 维持固定三点抽帧策略。 |
| 3 | **OCR / ASR** | macOS 原生 Vision OCR 实测耗时 370ms/帧，成功检出样帧硬字幕，但 CER 未测；ASR 未运行。 | X1 需引入离线 Whisper 或云端 ASR，与 OCR 双源交叉验证。 |
| 4 | **Objective VLM Observation** | 审计 `video-recap-skills` 与 `marlin-cli`。未运行实际推理（无 API 凭证/未下权重）。 | X1 必须精简 Prompt，严禁输入剧名百科，严禁要求主观推断。 |
| 5 | **Person Consistency / Identity** | **未运行**。需依赖视觉特征与人脸检测，X0 阶段未具备前置多模态输入。 | X1 严格解耦局部匿名 ID 与真实人名映射。 |
| 6 | **Timeline Fusion** | **未运行**。底层 ASR 与 VLM 数据未产生。 | 待 X1 数据产生后以 Shot 为骨架完成对齐。 |
| 7 | **Provenance** | 抽帧已验证带绝对时码；Evidence 契约规范需绑定 source_in/out 与 frame_refs。 | 杜绝人工时间区间覆盖。 |
| 8 | **M2 / Apple Silicon 本地能力** | FFmpeg 解码转码与 Vision OCR 在本地运行稳定；PySceneDetect 动态加载耗时 0.331s 正常。 | 本地负责检测、抽帧与 OCR，兼顾轻量与离线。 |
| 9 | **API / VLM 需求** | Marlin 本地 MLX 方案需大权重下载；轻量云端 API（如标准化视觉模型）可降低本地显存压力。 | 待 X1 选定具体可用 API 后测试。 |
| 10 | **单集耗时与成本** | 已测模块（检测+抽帧+OCR）外推约 12.3 分钟；ASR 与 VLM 耗时成本总体未知。 | 避免给出确定性虚假结论。 |
| 11 | **30 集扩展成本** | 素材一次 Ingest 入库模式具备复用价值；全季总成本视所选 ASR/VLM 模型而定，总体未知。 | 避免给出确定性虚假结论。 |
| 12 | **是否形成多集架构死路** | 统一在所有数据契约中强制规范 `series_id`, `episode_id`, `media_id`, `shot_id`, `episode_scope[]`。 | 杜绝单集剧情特化硬编码。 |

---

## 六、环境清理与交付状态

1. **废弃历史脚本说明**：早期测试脚本 `run_shot_detection.py` 因缺少 `atexit` 与超时管理，已确认为不合规并废弃，其生成的旧 JSON 作废；
2. **进程管理真实性核验**：第三方库（如 `video-recap-skills` 和 VMV 内部 spawn）内部若有子进程调用，原 Python wrapper 未逐一追踪其底层 PID，后续工程需引入进程组级清理；本次任务已通过核查，后台无遗留孤儿进程；
3. **交付范围**：本次提交仅正式修改本报告与 `PROGRESS.md`，状态置为 `X0 awaiting_review`，不自行进入 X1，不 push。
