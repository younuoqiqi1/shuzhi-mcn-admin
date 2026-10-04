/**
 * @file laozhou-qianfu-fixture.js
 * @description POC-AGENT A1: “老周追剧 + 潜伏”端到端最小真实任务测试 fixture。
 * 注意：本文件仅作为测试数据固件使用，所有人物（老周、余则成、吴敬中）、剧名及时间码不得硬编码进核心逻辑。
 */

export const laozhouPersonaFixture = Object.freeze({
  id: "creator-laozhou",
  name: "老周追剧",
  avatar: "./avatars/laozhou.jpg",
  tier: "S",
  tone: "沉稳老辣、字字珠玑、深谙组织博弈与人情世故",
  core_lens: "体制与职场微权力运转、下属向上汇报与危机自保策略",
  target_audience: "25-45岁职场中坚力量与影视剧情深度爱好者",
  voice_config: {
    provider: "aliyun",
    voice_id: "zh-laozhou-calm",
    speech_rate: 1.05,
    pitch_rate: 0.95,
  },
});

export const qianfuTopicFixture = Object.freeze({
  id: "topic-qf-20261005-01",
  blogger_id: "creator-laozhou",
  title: "从余则成两次倒水，看体制内如何向一把手汇报",
  source_media_id: "qianfu_ep01",
  aspect_ratio: "16:9",
  target_duration_sec: 120,
});

export const qianfuCoreViewpointFixture = Object.freeze({
  topic_id: "topic-qf-20261005-01",
  thesis: "高手向上汇报，第一句话永远不在嘴上，而在这杯茶的轻重与动作留白里。",
  hook: "为什么吴站长头也不抬，余则成却暗中完成了最致命的一次试探？",
  takeaway: "在强权上位者面前，汇报工作切忌抢话表功；用身体动作建立确定性，用沉默给领导留足掌控感。",
  tone_keywords: ["职场暗战", "留白博弈", "微表情掌控", "向上汇报"],
});

export const qianfuStoryBeatsFixture = Object.freeze([
  {
    beat_id: "beat-01",
    order: 1,
    beat_title: "黄金悬念开场",
    narrative_function: "hook",
    target_duration_sec: 4.5,
    key_dialogue_or_claim: "很多人以为汇报工作是讲事实，其实老手汇报，先看的是领导桌上的杯子。",
  },
  {
    beat_id: "beat-02",
    order: 2,
    beat_title: "身体语言与动作留白",
    narrative_function: "conflict_demonstration",
    target_duration_sec: 6.2,
    key_dialogue_or_claim: "水温不能太烫，手腕悬停一秒半，这是给上位者思考的台阶，也是试探情绪的温度计。",
  },
  {
    beat_id: "beat-03",
    order: 3,
    beat_title: "立意收束与认知交付",
    narrative_function: "payoff_summary",
    target_duration_sec: 5.5,
    key_dialogue_or_claim: "当你学会用动作代替言语，你在职场里才算真正告别了学生气。",
  },
]);

export const qianfuMaterialRequirementsFixture = Object.freeze([
  {
    beat_id: "beat-01",
    characters: ["余则成", "吴敬中"],
    scene_env: "保密局天津站站长办公室",
    action_cue: "余则成双手递茶，吴敬中低头审阅文件未抬头",
    emotional_tone: "平静下的暗流试探与权力压迫",
    preferred_affordances: ["试探", "权力压迫", "视线压迫"],
    forbidden_elements: ["激烈枪战", "户外大场面"],
  },
  {
    beat_id: "beat-02",
    characters: ["余则成"],
    scene_env: "办公室桌旁",
    action_cue: "手部端茶微动作特写，身体站姿微倾且沉稳",
    emotional_tone: "极度专注与克制",
    preferred_affordances: ["假意顺从", "心理防线维持"],
    forbidden_elements: ["滑稽表情"],
  },
  {
    beat_id: "beat-03",
    characters: ["吴敬中", "余则成"],
    scene_env: "办公室全景或站长特写",
    action_cue: "吴敬中微微抬头示意，双方视线瞬间交汇后移开",
    emotional_tone: "心理博弈落锤与达成默契",
    preferred_affordances: ["戏剧转折", "对峙松解"],
    forbidden_elements: ["暴露卧底身份的画面"],
  },
]);

export const qianfuCandidatesFixture = Object.freeze([
  {
    candidate_id: "cand-qf-01",
    beat_id: "beat-01",
    media_id: "qianfu_ep01",
    scene_id: "scene_0042",
    timecode: {
      in: "00:08:14.200",
      out: "00:08:18.700",
      duration_sec: 4.5,
    },
    evidence_l1: {
      dialogue: "站长，您喝茶。",
      characters: ["余则成", "吴敬中"],
      actions: ["双手递茶", "低头看卷宗"],
      camera: "中景侧拍",
    },
    affordance_l2: {
      tags: ["权力等级展现", "汇报试探", "视线压迫"],
      tension_score: 0.65,
      audio_features: ["原声对白清晰", "环境音克制"],
    },
    score: 0.94,
  },
  {
    candidate_id: "cand-qf-02",
    beat_id: "beat-02",
    media_id: "qianfu_ep01",
    scene_id: "scene_0043",
    timecode: {
      in: "00:08:18.700",
      out: "00:08:24.900",
      duration_sec: 6.2,
    },
    evidence_l1: {
      dialogue: "放那儿吧。",
      characters: ["余则成"],
      actions: ["将茶杯轻放桌面", "收手退步垂立"],
      camera: "半身特写接手部特写",
    },
    affordance_l2: {
      tags: ["克制服从", "肢体留白", "微动作博弈"],
      tension_score: 0.72,
      audio_features: ["瓷杯碰撞微弱声", "短句冷淡回复"],
    },
    score: 0.91,
  },
  {
    candidate_id: "cand-qf-03",
    beat_id: "beat-03",
    media_id: "qianfu_ep01",
    scene_id: "scene_0048",
    timecode: {
      in: "00:09:10.000",
      out: "00:09:15.500",
      duration_sec: 5.5,
    },
    evidence_l1: {
      dialogue: "南京那边催得紧，你看着办。",
      characters: ["吴敬中", "余则成"],
      actions: ["吴敬中摘下老花镜", "余则成立正领命"],
      camera: "过肩双人镜头",
    },
    affordance_l2: {
      tags: ["权力下放", "试探落地", "默契达成"],
      tension_score: 0.58,
      audio_features: ["领导原声金句"],
    },
    score: 0.88,
  },
]);

export const qianfuPerspectiveReadingsFixture = Object.freeze([
  {
    candidate_id: "cand-qf-01",
    beat_id: "beat-01",
    blogger_id: "creator-laozhou",
    topic_id: "topic-qf-20261005-01",
    perspective_lens: "体制与职场微权力运转",
    subjective_interpretation:
      "吴敬中头也不抬，说明此时多说半句话都是错。余则成身体微屈但步伐极稳，这是标准的服从性试探应对。",
    visual_subtext: "领导用看文件建立心理高位，下属用恭敬动作化解居高临下的审视。",
    original_audio_strategy: {
      keep: true,
      reason: "保留‘站长，您喝茶’这声原片原音，营造沉浸式职场压迫感",
      clip_range: "00:08:14.200 - 00:08:15.500",
    },
    confidence_score: 0.96,
  },
  {
    candidate_id: "cand-qf-02",
    beat_id: "beat-02",
    blogger_id: "creator-laozhou",
    topic_id: "topic-qf-20261005-01",
    perspective_lens: "体制与职场微权力运转",
    subjective_interpretation:
      "茶杯落桌无声，收手后退一步。在体制内，不抢话、不抢戏，用动作给领导思考留出空间，才叫真正懂规矩。",
    visual_subtext: "手部动作克制至极，体现出极其严格的职业素养与城府。",
    original_audio_strategy: {
      keep: true,
      reason: "保留瓷杯轻磕桌面与站长‘放那儿吧’的短句冷淡声",
      clip_range: "00:08:19.500 - 00:08:21.000",
    },
    confidence_score: 0.93,
  },
  {
    candidate_id: "cand-qf-03",
    beat_id: "beat-03",
    blogger_id: "creator-laozhou",
    topic_id: "topic-qf-20261005-01",
    perspective_lens: "体制与职场微权力运转",
    subjective_interpretation:
      "摘眼镜意味着领导从‘审视防御’切换到‘授意托付’。这一刻的交接，是向上汇报最终被接纳的信号。",
    visual_subtext: "过肩镜头的视线对齐，代表权力的默许与考验通过。",
    original_audio_strategy: {
      keep: false,
      reason: "收尾金句由博主完整口播解说，弱化背景对白杂音",
    },
    confidence_score: 0.9,
  },
]);

export const qianfuDirectorPlanFixture = Object.freeze({
  plan_id: "plan-qf-20261005-01",
  topic_id: "topic-qf-20261005-01",
  blogger_id: "creator-laozhou",
  aspect_ratio: "16:9",
  voice_config: {
    provider: "aliyun",
    voice_id: "zh-laozhou-calm",
    speech_rate: 1.05,
    pitch_rate: 0.95,
  },
  shots: [
    {
      shot_index: 1,
      beat_id: "beat-01",
      selected_candidate_id: "cand-qf-01",
      media_id: "qianfu_ep01",
      scene_id: "scene_0042",
      in_timecode: "00:08:14.200",
      out_timecode: "00:08:18.700",
      duration_sec: 4.5,
      narration: {
        text: "高手向上汇报，第一句话永远不在嘴上，而在这杯茶的轻重里。",
        start_delay_sec: 1.3,
      },
      original_audio: {
        preserve: true,
        volume_percent: 100,
        time_range: "00:08:14.200 - 00:08:15.500",
      },
      burn_subtitles: true,
    },
    {
      shot_index: 2,
      beat_id: "beat-02",
      selected_candidate_id: "cand-qf-02",
      media_id: "qianfu_ep01",
      scene_id: "scene_0043",
      in_timecode: "00:08:18.700",
      out_timecode: "00:08:24.900",
      duration_sec: 6.2,
      narration: {
        text: "给领导倒水时上位者不抬头，动作一定要慢。收手后退这一步，是留给领导的安全边界。",
        start_delay_sec: 1.0,
      },
      original_audio: {
        preserve: true,
        volume_percent: 80,
        time_range: "00:08:19.500 - 00:08:21.000",
      },
      burn_subtitles: true,
    },
    {
      shot_index: 3,
      beat_id: "beat-03",
      selected_candidate_id: "cand-qf-03",
      media_id: "qianfu_ep01",
      scene_id: "scene_0048",
      in_timecode: "00:09:10.000",
      out_timecode: "00:09:15.500",
      duration_sec: 5.5,
      narration: {
        text: "当你学会用动作代替言语，你在复杂的职场里，才算真正告别了学生气。",
        start_delay_sec: 0.0,
      },
      original_audio: {
        preserve: false,
        volume_percent: 0,
      },
      burn_subtitles: true,
    },
  ],
});
