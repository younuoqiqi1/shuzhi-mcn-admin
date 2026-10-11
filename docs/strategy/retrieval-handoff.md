# MCN「会想」至「会找」检索任务包交接规范 (Handoff Specification)

版本：`mcn.strategy-handoff.v1`
日期：2026-10-11
上游阶段：MCN「会想」策略运营后台
下游阶段：MCN「会找」素材检索与证据匹配子系统

当前已有5份真实运行交接包，位于本地 `.local-data/exports/`，可读展示为同目录 `成果展示.md`。本轮验证上游生成、审核与导出；旧检索模块保持冻结，下游自动消费适配及真实镜头检索尚未执行。两份原片均已核验登记，不能把需求包当成已命中的素材。下一阶段按asset_id读取当前资产；本地 `media-manifest.json` 可随5份真实交接包传递。历史生成输入快照保留原版本，不因原片后来登记而覆盖。

---

## 1. 契约原则与边界

1. **素材需求定位**：本阶段导出的交付物属于**初版素材需求单**，绝非已证实的剪辑成片单。
2. **严禁编造物理时间码**：
   - 所有的 `story_beats.source_interval` 严格为 `null`；
   - 所有的 `story_beats.candidates` 严格为空数组 `[]`；
   - 所有的节拍状态 `fact_status` 严格标为 `requested_unverified`。
3. **真实依据链条**：保留模型对客观节目事实与分析方法的真实引用 ID（`evidence_citations`），用于检索阶段溯源。
4. **服务生成导出 ID**：交接包 ID 由系统服务根据时间戳与加密随机数生成（形如 `handoff-<timestamp>-<hash>`），禁止依赖模型编造 ID。
5. **审核绑定**：仅在运营审核通过（`is_approved = true` 且处于 `ready_for_retrieval` 状态）时方可导出；若后续发生文案编辑，旧审核与交接版本立刻失效。

---

## 2. 交付包 JSON 结构规范

以下是**纯结构占位示例**，不是剧情事实、真实生成结果或可执行检索任务。真实交接包请读取本地5份 `*-handoff-latest.json`；运行来源按 `provenance.topics` 与 `provenance.plan` 分开记录。

```json
{
  "schema_version": "mcn.strategy-handoff.v1",
  "export_id": "handoff-1770701234567-a1b2c3d4",
  "job_id": "job-1770701230000-1-ef89a0",
  "created_at": "2026-10-11T13:52:00.000Z",
  "approval": {
    "reviewer": "运营主编",
    "approved_at": "2026-10-11T13:51:50.000Z",
    "job_version": 3
  },
  "input_snapshot": {
    "persona": {
      "id": "persona-sample-01",
      "name": "示例博主",
      "audience": "成年影视观众；克制、清晰、逻辑型",
      "tone": "克制、清晰、逻辑型",
      "editorial_lens": "人物选择、信息差、因果链、行动代价",
      "interpretation_rules": "将可观察情节与动机推测分开；用前因后果解释选择，避免把推测说成事实",
      "version": 1,
      "knowledge_ids": [
        "k-method-sample-01"
      ],
      "asset_ids": [
        "asset-sample-01"
      ],
      "forbidden_expressions": [
        "无依据断言"
      ]
    },
    "asset": {
      "id": "asset-sample-01",
      "title": "示例节目 第1集",
      "programme": "示例节目",
      "edition": "示例版本",
      "episode": "1",
      "version": 1,
      "video_path": null,
      "video_metadata": null,
      "knowledge_ids": [
        "k-fact-sample-01"
      ],
      "context_status": "ready"
    },
    "knowledge_items": [
      {
        "id": "k-fact-sample-01",
        "title": "字段结构占位资料",
        "kind": "programme_fact",
        "version": 1,
        "text": "仅作字段结构占位，不是本集事实或模型产物。",
        "source_note": "结构说明示例",
        "verification_status": "unverified",
        "asset_id": "asset-sample-01"
      },
      {
        "id": "k-method-sample-01",
        "title": "字段结构占位资料",
        "kind": "analytical_method",
        "version": 1,
        "text": "仅作字段结构占位，不是本集事实或模型产物。",
        "source_note": "结构说明示例",
        "verification_status": "unverified",
        "asset_id": null
      }
    ]
  },
  "provenance": {
    "topics": {
      "model": "gemini-3.8-flash-high",
      "duration_ms": 3840,
      "exit_code": 0,
      "timestamp": "2026-10-11T13:48:30.000Z",
      "raw_log_path": ".local-data/model-runs/run-topics.json"
    },
    "plan": {
      "model": "gemini-3.8-flash-high",
      "duration_ms": 4120,
      "exit_code": 0,
      "timestamp": "2026-10-11T13:51:10.000Z",
      "raw_log_path": ".local-data/model-runs/run-plan.json"
    }
  },
  "selected_topic": {
    "id": "top-1",
    "title": "对话中的信息差与应对选择",
    "core_thesis": "人物依据有限信息做出理性但代价显著的应对决策。",
    "rationale": "对应场景展现了因果清晰的决策边界与信息知情差异。",
    "persona_alignment": "契合周老师严谨拆解人物选择与真实代价的视角。",
    "evidence_citations": [
      "k-fact-sample-01"
    ],
    "verification_needs": [
      "核对对话发生前后双方动作与台词时间边界"
    ]
  },
  "narration_segments": [
    {
      "id": "narr-1",
      "order": 1,
      "text": "在这场对话中，关键不在于言辞多寡，而在于双方掌握信息的不同带来的选择分歧。",
      "speaker_tone": "克制、清晰、逻辑型"
    },
    {
      "id": "narr-2",
      "order": 2,
      "text": "面对对方的追问，人物选择了回避正面冲突，将焦点转移至既有规则之上。",
      "speaker_tone": "克制、清晰、逻辑型"
    }
  ],
  "story_beats": [
    {
      "id": "beat-1",
      "order": 1,
      "narrative_function": "呈现对话开端的试探与情境氛围",
      "narration_segment_ids": [
        "narr-1"
      ],
      "estimated_duration_sec": 12,
      "source_interval": null,
      "candidates": [],
      "fact_status": "requested_unverified",
      "evidence_citations": [
        "k-fact-sample-01"
      ]
    },
    {
      "id": "beat-2",
      "order": 2,
      "narrative_function": "展示应对转向与焦点转移",
      "narration_segment_ids": [
        "narr-2"
      ],
      "estimated_duration_sec": 16,
      "source_interval": null,
      "candidates": [],
      "fact_status": "requested_unverified",
      "evidence_citations": [
        "k-fact-sample-01"
      ]
    }
  ],
  "material_requirements": [
    {
      "id": "req-1",
      "beat_id": "beat-1",
      "narration_segment_ids": [
        "narr-1"
      ],
      "asset_ids": [
        "asset-sample-01"
      ],
      "desired_people": "剧中对应出场人物A、B",
      "desired_scene": "室内对话场景",
      "desired_action": "检索与对应口播一致的动作；具体动作待原片确认",
      "desired_dialogue": "台词关于起因与事实盘问（待原片音频与字幕核验）",
      "desired_emotion": "待原片核验，不预设情绪",
      "narrative_function": "配合第一句解说，烘托信息知情差异下的对话氛围",
      "priority": "essential",
      "fallback": "如无可用镜头，返回未命中并交运营调整",
      "verification_status": "requested_unverified",
      "evidence_citations": [
        "k-fact-sample-01"
      ]
    },
    {
      "id": "req-2",
      "beat_id": "beat-2",
      "narration_segment_ids": [
        "narr-2"
      ],
      "asset_ids": [
        "asset-sample-01"
      ],
      "desired_people": "剧中对应出场人物A",
      "desired_scene": "室内中近景",
      "desired_action": "检索与对应口播一致的动作；具体动作待原片确认",
      "desired_dialogue": "答复与解释台词短摘",
      "desired_emotion": "待原片核验，不预设情绪",
      "narrative_function": "配合第二句解说，呈现人物应对策略转换",
      "priority": "preferred",
      "fallback": "如无可用镜头，返回未命中并交运营调整",
      "verification_status": "requested_unverified",
      "evidence_citations": [
        "k-fact-sample-01"
      ]
    }
  ]
}
```

---

## 3. 下游「会找」消费指南

1. **输入解析**：读取 `material_requirements` 数组，以每条 `req` 为目标进行候选画面检索。
2. **检索约束**：必须限定在 `asset_ids` 允许的单集视频范围内，依据 `desired_people`, `desired_scene`, `desired_action` 检索候选镜头并填入 `candidates`。
3. **闭环核对**：当「会找」成功匹配物理时间码后，方可将 `source_interval` 由 `null` 填充为具体毫秒级时间区间 `[start_ms, end_ms]`，并推进至下一阶段成片导演计划。
