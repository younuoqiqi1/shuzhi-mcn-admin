/**
 * @file production-job-service.mjs
 * @description POC-AGENT A8: MCN 生产任务调度服务 (Production Job Service)。
 * 
 * 核心职能：
 * 1. 严格管理生产任务生命周期状态机：
 *    queued -> preparing -> cutting -> tts -> assembling -> qc -> completed (或 failed)
 * 2. 真实驱动 video-moment-validation 的 Stage 4/5 渲染器 (python -m vmv render)。
 * 3. 实时解析渲染器输出的结构化进度日志 ([VMV_PROGRESS])，坚决杜绝前端 setTimeout 假进度。
 * 4. 落地完整生产 Provenance (包含 content_id, job_id, director_plan_id, output_sha256 等)。
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const VMV_REPO_PATH = "/Users/yoyotaozhou/Documents/video-moment-validation";
const VMV_PYTHON = path.join(VMV_REPO_PATH, ".venv/bin/python3");
const SOURCE_MEDIA_DEFAULT = path.join(VMV_REPO_PATH, "data/input/qianfu_ep18.mp4");
const OUTPUT_DIR_DEFAULT = path.resolve(REPO_ROOT, "outputs/production");

export const PRODUCTION_JOB_STATES = Object.freeze({
  QUEUED: "queued",
  PREPARING: "preparing",
  CUTTING: "cutting",
  TTS: "tts",
  ASSEMBLING: "assembling",
  QC: "qc",
  COMPLETED: "completed",
  FAILED: "failed",
});

export class ProductionJobService {
  constructor(options = {}) {
    this.outputDir = options.outputDir || OUTPUT_DIR_DEFAULT;
    this.vmvPython = options.vmvPython || VMV_PYTHON;
    this.sourceMedia = options.sourceMedia || SOURCE_MEDIA_DEFAULT;
    this.jobs = new Map();

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * 创建并注册一个新生产任务
   */
  createJob({
    contentId = null,
    topicId,
    directorPlanId,
    productionOrderId,
    orderFilePath,
    outputFileName,
  }) {
    if (!topicId) throw new Error("topicId is required");
    if (!directorPlanId) throw new Error("directorPlanId is required");
    if (!orderFilePath) throw new Error("orderFilePath is required");

    const timestamp = Date.now();
    const jobId = `job_prod_${topicId}_${timestamp.toString(36)}`;
    const finalFileName = outputFileName || `${topicId}_final.mp4`;
    const outputPath = path.join(this.outputDir, finalFileName);

    const job = {
      job_id: jobId,
      content_id: contentId || `content_${topicId}_${timestamp.toString(36)}`,
      topic_id: topicId,
      director_plan_id: directorPlanId,
      production_order_id: productionOrderId || `order_${topicId}_${timestamp.toString(36)}`,
      order_file_path: orderFilePath,
      output_path: outputPath,
      output_url: `/api/videos/${path.basename(outputPath)}`,
      current_stage: PRODUCTION_JOB_STATES.QUEUED,
      progress: 0.0,
      started_at: new Date().toISOString(),
      completed_at: null,
      error: null,
      provenance: null,
      qc_details: null,
    };

    this.jobs.set(jobId, job);
    return job;
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  listJobs() {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
  }

  /**
   * 启动生产任务真实执行
   */
  async runJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.current_stage = PRODUCTION_JOB_STATES.PREPARING;
    job.progress = 0.05;

    return new Promise((resolve, reject) => {
      const args = [
        "-m", "vmv", "render",
        "--order", job.order_file_path,
        "--output", job.output_path,
        "--source", this.sourceMedia,
      ];

      const child = spawn(this.vmvPython, args, {
        cwd: VMV_REPO_PATH,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          PATH: `/Users/yoyotaozhou/.local/bin:${process.env.PATH || ""}`,
        },
      });

      let stdoutAccum = "";
      let stderrAccum = "";

      child.stdout.on("data", (data) => {
        const text = data.toString();
        stdoutAccum += text;
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("[VMV_PROGRESS]")) {
            try {
              const payloadStr = line.replace("[VMV_PROGRESS]", "").trim();
              const payload = JSON.parse(payloadStr);
              if (payload.stage) {
                job.current_stage = payload.stage;
                job.progress = payload.progress ?? job.progress;
              }
            } catch {
              // Ignore malformed progress line
            }
          }
        }
      });

      child.stderr.on("data", (data) => {
        stderrAccum += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          job.current_stage = PRODUCTION_JOB_STATES.COMPLETED;
          job.progress = 1.0;
          job.completed_at = new Date().toISOString();

          // Read manifest
          const manifestPath = job.output_path.replace(/\.mp4$/, ".manifest.json");
          let manifest = null;
          if (fs.existsSync(manifestPath)) {
            try {
              manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
            } catch (err) {
              console.error("Failed to parse manifest:", err);
            }
          }

          job.qc_details = manifest ? manifest.qc_details : null;
          job.provenance = {
            content_id: job.content_id,
            job_id: job.job_id,
            director_plan_id: job.director_plan_id,
            production_order_id: job.production_order_id,
            source_media_id: "qianfu_ep18",
            source_media_path: this.sourceMedia,
            output_file: job.output_path,
            output_sha256: manifest ? manifest.sha256 : null,
            created_at: job.completed_at,
          };

          resolve(job);
        } else {
          job.current_stage = PRODUCTION_JOB_STATES.FAILED;
          job.completed_at = new Date().toISOString();
          job.error = `VMV render exited with code ${code}. Stderr: ${stderrAccum.slice(-1000)}`;
          reject(new Error(job.error));
        }
      });

      child.on("error", (err) => {
        job.current_stage = PRODUCTION_JOB_STATES.FAILED;
        job.completed_at = new Date().toISOString();
        job.error = err.message;
        reject(err);
      });
    });
  }
}
