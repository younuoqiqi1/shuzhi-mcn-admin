/**
 * @file schemas.js
 * @description POC-AGENT A1: 9 大核心跨模块数据契约定义 (JSON Schema 规范)
 * 严格遵循 Topic-First 闭环架构，禁止硬编码任何业务角色、剧情或时间码。
 */

export const PersonaSchema = {
  $id: "https://schema.shuzhi.ai/contracts/persona.json",
  title: "Persona",
  type: "object",
  required: ["id", "name", "tone", "core_lens", "voice_config"],
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    avatar: { type: "string" },
    tier: { type: "string", enum: ["S", "A", "B", "C"] },
    tone: { type: "string", minLength: 1 },
    core_lens: { type: "string", minLength: 1 },
    target_audience: { type: "string" },
    voice_config: {
      type: "object",
      required: ["provider", "voice_id"],
      properties: {
        provider: { type: "string", minLength: 1 },
        voice_id: { type: "string", minLength: 1 },
        speech_rate: { type: "number", minimum: 0.5, maximum: 2.0 },
        pitch_rate: { type: "number", minimum: 0.5, maximum: 2.0 },
      },
    },
  },
};

export const TopicSchema = {
  $id: "https://schema.shuzhi.ai/contracts/topic.json",
  title: "Topic",
  type: "object",
  required: ["id", "blogger_id", "title", "source_media_id", "aspect_ratio", "target_duration_sec"],
  properties: {
    id: { type: "string", minLength: 1 },
    blogger_id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    source_media_id: { type: "string", minLength: 1 },
    aspect_ratio: { type: "string", enum: ["16:9", "9:16"] },
    target_duration_sec: { type: "number", minimum: 30, maximum: 600 },
  },
};

export const CoreViewpointSchema = {
  $id: "https://schema.shuzhi.ai/contracts/core-viewpoint.json",
  title: "CoreViewpoint",
  type: "object",
  required: ["topic_id", "thesis", "hook", "takeaway"],
  properties: {
    topic_id: { type: "string", minLength: 1 },
    thesis: { type: "string", minLength: 1 },
    hook: { type: "string", minLength: 1 },
    takeaway: { type: "string", minLength: 1 },
    tone_keywords: {
      type: "array",
      items: { type: "string" },
    },
  },
};

export const StoryBeatSchema = {
  $id: "https://schema.shuzhi.ai/contracts/story-beat.json",
  title: "StoryBeat",
  type: "object",
  required: ["beat_id", "order", "beat_title", "narrative_function", "target_duration_sec"],
  properties: {
    beat_id: { type: "string", minLength: 1 },
    order: { type: "integer", minimum: 1 },
    beat_title: { type: "string", minLength: 1 },
    narrative_function: { type: "string", minLength: 1 },
    target_duration_sec: { type: "number", exclusiveMinimum: 0 },
    key_dialogue_or_claim: { type: "string" },
  },
};

export const MaterialRequirementSchema = {
  $id: "https://schema.shuzhi.ai/contracts/material-requirement.json",
  title: "MaterialRequirement",
  type: "object",
  required: ["beat_id", "action_cue", "emotional_tone"],
  properties: {
    beat_id: { type: "string", minLength: 1 },
    characters: {
      type: "array",
      items: { type: "string" },
    },
    scene_env: { type: "string" },
    action_cue: { type: "string", minLength: 1 },
    emotional_tone: { type: "string", minLength: 1 },
    preferred_affordances: {
      type: "array",
      items: { type: "string" },
    },
    forbidden_elements: {
      type: "array",
      items: { type: "string" },
    },
  },
};

export const CandidateSchema = {
  $id: "https://schema.shuzhi.ai/contracts/candidate.json",
  title: "Candidate",
  type: "object",
  required: ["candidate_id", "beat_id", "media_id", "scene_id", "timecode", "evidence_l1", "affordance_l2"],
  properties: {
    candidate_id: { type: "string", minLength: 1 },
    beat_id: { type: "string", minLength: 1 },
    media_id: { type: "string", minLength: 1 },
    scene_id: { type: "string", minLength: 1 },
    timecode: {
      type: "object",
      required: ["in", "out", "duration_sec"],
      properties: {
        in: { type: "string", pattern: "^\\d{2}:\\d{2}:\\d{2}\\.\\d{3}$" },
        out: { type: "string", pattern: "^\\d{2}:\\d{2}:\\d{2}\\.\\d{3}$" },
        duration_sec: { type: "number", exclusiveMinimum: 0 },
      },
    },
    evidence_l1: {
      type: "object",
      required: ["dialogue", "characters", "actions"],
      properties: {
        dialogue: { type: "string" },
        characters: { type: "array", items: { type: "string" } },
        actions: { type: "array", items: { type: "string" } },
        camera: { type: "string" },
      },
    },
    affordance_l2: {
      type: "object",
      required: ["tags"],
      properties: {
        tags: { type: "array", items: { type: "string" } },
        tension_score: { type: "number", minimum: 0.0, maximum: 1.0 },
        audio_features: { type: "array", items: { type: "string" } },
      },
    },
    score: { type: "number", minimum: 0.0, maximum: 1.0 },
  },
};

export const PerspectiveReadingSchema = {
  $id: "https://schema.shuzhi.ai/contracts/perspective-reading.json",
  title: "PerspectiveReading",
  type: "object",
  required: ["candidate_id", "beat_id", "blogger_id", "topic_id", "perspective_lens", "subjective_interpretation"],
  properties: {
    candidate_id: { type: "string", minLength: 1 },
    beat_id: { type: "string", minLength: 1 },
    blogger_id: { type: "string", minLength: 1 },
    topic_id: { type: "string", minLength: 1 },
    perspective_lens: { type: "string", minLength: 1 },
    subjective_interpretation: { type: "string", minLength: 1 },
    visual_subtext: { type: "string" },
    original_audio_strategy: {
      type: "object",
      required: ["keep"],
      properties: {
        keep: { type: "boolean" },
        reason: { type: "string" },
        clip_range: { type: "string" },
      },
    },
    confidence_score: { type: "number", minimum: 0.0, maximum: 1.0 },
  },
};

export const DirectorPlanSchema = {
  $id: "https://schema.shuzhi.ai/contracts/director-plan.json",
  title: "DirectorPlan",
  type: "object",
  required: ["plan_id", "topic_id", "blogger_id", "voice_config", "aspect_ratio", "shots"],
  properties: {
    plan_id: { type: "string", minLength: 1 },
    topic_id: { type: "string", minLength: 1 },
    blogger_id: { type: "string", minLength: 1 },
    aspect_ratio: { type: "string", enum: ["16:9", "9:16"] },
    voice_config: {
      type: "object",
      required: ["provider", "voice_id"],
      properties: {
        provider: { type: "string", minLength: 1 },
        voice_id: { type: "string", minLength: 1 },
        speech_rate: { type: "number", minimum: 0.5, maximum: 2.0 },
        pitch_rate: { type: "number", minimum: 0.5, maximum: 2.0 },
      },
    },
    shots: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: [
          "shot_index",
          "beat_id",
          "selected_candidate_id",
          "media_id",
          "scene_id",
          "in_timecode",
          "out_timecode",
          "duration_sec",
          "narration",
          "original_audio",
        ],
        properties: {
          shot_index: { type: "integer", minimum: 1 },
          beat_id: { type: "string", minLength: 1 },
          selected_candidate_id: { type: "string", minLength: 1 },
          media_id: { type: "string", minLength: 1 },
          scene_id: { type: "string", minLength: 1 },
          in_timecode: { type: "string", pattern: "^\\d{2}:\\d{2}:\\d{2}\\.\\d{3}$" },
          out_timecode: { type: "string", pattern: "^\\d{2}:\\d{2}:\\d{2}\\.\\d{3}$" },
          duration_sec: { type: "number", exclusiveMinimum: 0 },
          narration: {
            type: "object",
            required: ["text"],
            properties: {
              text: { type: "string", minLength: 1 },
              start_delay_sec: { type: "number", minimum: 0.0 },
            },
          },
          original_audio: {
            type: "object",
            required: ["preserve"],
            properties: {
              preserve: { type: "boolean" },
              volume_percent: { type: "number", minimum: 0, maximum: 100 },
              time_range: { type: "string" },
            },
          },
          burn_subtitles: { type: "boolean" },
        },
      },
    },
  },
};

export const ProductionJobSchema = {
  $id: "https://schema.shuzhi.ai/contracts/production-job.json",
  title: "ProductionJob",
  type: "object",
  required: ["job_id", "topic_id", "blogger_id", "status", "created_at", "updated_at", "progress_percent", "current_stage"],
  properties: {
    job_id: { type: "string", minLength: 1 },
    topic_id: { type: "string", minLength: 1 },
    blogger_id: { type: "string", minLength: 1 },
    status: {
      type: "string",
      enum: [
        "drafting",
        "scripting",
        "awaiting_script_review",
        "retrieving",
        "perspective_reading",
        "directing",
        "awaiting_director_review",
        "vmv_producing",
        "completed",
        "failed",
        "cancelled",
      ],
    },
    created_at: { type: "string" },
    updated_at: { type: "string" },
    progress_percent: { type: "number", minimum: 0, maximum: 100 },
    current_stage: { type: "string", minLength: 1 },
    payload: { type: "object" },
    error: {
      type: ["object", "null"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        stage: { type: "string" },
        details: { type: "object" },
      },
    },
    history: {
      type: "array",
      items: {
        type: "object",
        required: ["from", "to", "timestamp"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          timestamp: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
};
