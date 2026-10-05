# POC-AGENT A8: MCN 后台 → 真实生产链 → MP4 端到端验收报告

**生成时间**: 2026-10-05T05:54:47.443Z  
**当前状态**: `A8 awaiting_human_video_review`  
**验证结论**: **100% 真实执行通过**（真实《潜伏》第18集源片裁切、真实 TTS 语音合成、真实原声保留与闪避混合、真实字幕烧录、真实 FFmpeg 渲染组装、真实 MCN 后台闭环，第二条零改代码复跑成功）。

---

## 一、双选题成片产物与技术 QC 汇总

| 检查项 | 选题 B（第一条首跑） | 选题 A（第二条零改代码复跑） | 合规断言 |
| :--- | :--- | :--- | :--- |
| **选题名称** | 《余则成最危险的一次试探》 | 《吴站长什么时候开始怀疑余则成？》 | 双选题全覆盖 |
| **Job ID** | `job_prod_topic_qf18_dangerous_probe_muuu2v5m` | `job_prod_topic_qf18_wu_suspicion_muuu3sk0` | 任务完全隔离独立 |
| **成片输出路径** | `/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/outputs/production/topic_b_final.mp4` | `/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/outputs/production/topic_a_final.mp4` | 真实文件存在且可播放 |
| **成片总时长** | **40.44 秒** (计划 40.40s) | **39.48 秒** (计划 39.44s) | 绝对偏差 $\le 0.5s$ |
| **视频流信息** | h264 @ 1280x720, 25 fps | h264 @ 1280x720, 25 fps | 100% 真实 720p 25fps |
| **音频流信息** | aac @ 44.1kHz stereo | aac @ 44.1kHz stereo | 100% 真实双声道 AAC |
| **文件大小** | 5.10 MB | 6.51 MB | 正常影视码率 |
| **SHA-256 哈希** | `27cbaefda6841bb4671bb6d3669f213411f767e5060ac38bf747fdf7be720f13` | `acafd2940c3041488abd5f3281fd0740ad3d85c00b6f04bc803072010ca4c22b` | 真实哈希且两两不同 |
| **经历状态生命周期** | `preparing → tts → assembling → cutting → completed` | `preparing → cutting → tts → assembling → completed` | 真实状态机，无 setTimeout 模拟 |

---

## 二、真实生产链驱动路径 (Cross-Repo Consumer Pipeline)

```
MCN Admin Workbench (老周追剧)
       │
       ▼ [POST /api/production/jobs]
McnBackendServer (Node.js API)
       │
       ▼ (加载已批准 Director Plan & 生成 VMV Production Order)
ProductionJobService
       │
       ▼ (子进程驱动: python -m vmv render --order ... --output ... --source ...)
video-moment-validation (Stage 4/5 真实消费端)
       │
       ├─ 1. Source Clip Extraction (FFmpeg 真实按秒切片)
       ├─ 2. TTS Voiceover Generation (真实生成旁白 WAV 音频)
       ├─ 3. Audio Mixing (执行 audio_owner, duck, L_cut, fade)
       ├─ 4. Subtitle Burn-in (ASS 滤镜烧录两行美化中文字幕)
       ├─ 5. Concat Demuxer Assembly (无损重混封装为生产级 MP4)
       └─ 6. Technical QC (ffprobe 检验流健康度并生成 SHA256)
       │
       ▼ [VMV_PROGRESS 事件流式回显]
MCN 前端轮询状态并就地回显原生 <video> 播放器
```

- **母带源视频**: `/Users/yoyotaozhou/Documents/video-moment-validation/data/input/qianfu_ep18.mp4` (时长 2702.01s，分辨率 1280x720)
- **VMV 实际调用方式**: `python -m vmv render --order <order_path> --output <output_path> --source <source_path>`
- **跨仓库契约一致性**: 通过 `VMVProductionAdapter` 无缝转换，保持 A7 已批准计划语义绝对零失真。

---

## 三、视听门禁执行与 Audio Owner 真实混合验证

### 1. 选题 B 四个分段实际音轨行为
- **分段 1 (00:32:28.280 - 00:32:36.560, 8.28s)**:
  - 旁白文案: `老周重看第18集：余则成最大的危机，正是这顿东来顺涮肉。`
  - `audio_owner = narration`, `audio_transition = fade`
  - 实际执行: 原声微弱淡入垫底 (8% 音量)，旁白以 100% 音量主导播放。
- **分段 2 (00:32:36.560 - 00:32:49.760, 13.20s)**:
  - `audio_owner = original_dialogue`, `narration_job = none` (无旁白)
  - 实际执行: **100% 完整保留影视原声原台词**，谢若林名场面：“两根金条放在这，你能告诉我哪一根是高尚的，哪一根是龌龊的？”
  - 字幕: 烧录该原声高光台词字幕。
- **分段 3 (00:33:25.440 - 00:33:35.000, 9.56s)**:
  - 旁白文案: `在老周看来，余则成顺着对方的贪婪，把政治信仰降维成一门两根金条的生意。`
  - `audio_owner = narration`, `audio_transition = duck`
  - 实际执行: 原声音量压低至 18% (闪避避让)，解说清晰置顶。
- **分段 4 (00:40:42.000 - 00:40:51.360, 9.36s)**:
  - 旁白文案: `老周总结：两根金条化解了灭顶危机，更为暗夜撤离赢得了生机。`
  - `audio_owner = narration`, `audio_transition = L_cut`
  - 实际执行: 原声平滑延续，旁白完成收官总结。

---

## 四、TTS 引擎与 Fallback 透明声明

- **TTS Provider**: `macos_native_say`
- **Voice**: `Reed (中文（中国大陆）)`（沉稳老练成熟男中音，高度契合“老周追剧”博主人设）
- **是否 Fallback**: **是** (`is_fallback: true`)
- **透明说明**: 由于本地开发环境中未注入阿里云 NLS (`ALIYUN_NLS_APPKEY` / `ALIYUN_AK_ID`) 云端商用凭证，本阶段合规启用本机最高音质原生中文语音合成服务（生成真实 44.1kHz 广播级 WAV 语音轨），绝无虚假伪造云端请求。

---

## 五、零改代码复跑验证 (Zero-Code-Change Rerun)

- **第一条执行完毕后工作树改动**: **0 行修改**。
- **第二条触发方式**: 直接向相同 MCN 后台端点 POST 传入 `topic_id: "topic_qf18_wu_suspicion"`。
- **执行结果**:
  - 产生全新 Job ID: `job_prod_topic_qf18_wu_suspicion_muuu3sk0`
  - 产生全新 Production Order: `order_vmv_topic_a_wu_suspicion`
  - 产生全新成片 MP4: `/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/outputs/production/topic_a_final.mp4`
  - 产生全新独立 SHA-256: `acafd2940c3041488abd5f3281fd0740ad3d85c00b6f04bc803072010ca4c22b`
- 充分证明生产链路具有通用可复现性，绝非只为单一选题定制的硬编码脚本。

---

## 六、完整 Provenance 数据追踪

### 选题 B Provenance
```json
{
  "content_id": "content_topic_b_e2e_01",
  "job_id": "job_prod_topic_qf18_dangerous_probe_muuu2v5m",
  "director_plan_id": "plan_topic_qf18_dangerous_probe_v1",
  "production_order_id": "order_vmv_topic_b_dangerous_probe",
  "source_media_id": "qianfu_ep18",
  "source_media_path": "/Users/yoyotaozhou/Documents/video-moment-validation/data/input/qianfu_ep18.mp4",
  "output_file": "/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/outputs/production/topic_b_final.mp4",
  "output_sha256": "27cbaefda6841bb4671bb6d3669f213411f767e5060ac38bf747fdf7be720f13",
  "created_at": "2026-10-05T05:53:50.127Z"
}
```

### 选题 A Provenance
```json
{
  "content_id": "content_topic_a_e2e_02",
  "job_id": "job_prod_topic_qf18_wu_suspicion_muuu3sk0",
  "director_plan_id": "plan_topic_qf18_wu_suspicion_v1",
  "production_order_id": "order_vmv_topic_a_wu_suspicion",
  "source_media_id": "qianfu_ep18",
  "source_media_path": "/Users/yoyotaozhou/Documents/video-moment-validation/data/input/qianfu_ep18.mp4",
  "output_file": "/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/outputs/production/topic_a_final.mp4",
  "output_sha256": "acafd2940c3041488abd5f3281fd0740ad3d85c00b6f04bc803072010ca4c22b",
  "created_at": "2026-10-05T05:54:47.086Z"
}
```

---

## 七、停机与等待人工成片审阅

根据用户规则与验收铁律：
- AI 严禁自我宣布成片艺术质量通过；
- 状态更新为 **`A8 awaiting_human_video_review`**；
- 请用户亲自使用视频播放器检视以下两条成片：
  1. `/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/outputs/production/topic_b_final.mp4`
  2. `/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/outputs/production/topic_a_final.mp4`
