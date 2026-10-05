/**
 * @file mcn-backend-api.mjs
 * @description POC-AGENT A8: 数智博主 MCN 后台真实生产 API 与流式视频服务器。
 * 
 * 路由：
 * - POST /api/production/jobs: 创建并启动真实生产任务
 * - GET  /api/production/jobs: 获取生产任务列表
 * - GET  /api/production/jobs/:id: 查询任务实时执行阶段 (queued/preparing/cutting/tts/assembling/qc/completed)
 * - GET  /api/videos/:filename: 支持 HTTP 206 Range 分片流式播放的 MP4 视频服务
 * - GET  /*: 托管 MCN 前端工作台静态资源 (index.html, app.js, styles.css 等)
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProductionJobService } from "../production/production-job-service.mjs";
import { ProductionRunner } from "../production/production-runner.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const STATIC_ROOT = REPO_ROOT;
const OUTPUT_DIR = path.resolve(REPO_ROOT, "outputs/production");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
};

export class McnBackendServer {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.outputDir = options.outputDir || OUTPUT_DIR;
    this.jobService = new ProductionJobService({ outputDir: this.outputDir });
    this.runner = new ProductionRunner(this.jobService);
    this.server = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.on("error", reject);
      this.server.listen(this.port, () => {
        const address = this.server.address();
        console.log(`[MCN Server] 服务已启动: http://localhost:${address.port}`);
        resolve(this);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      if (typeof this.server.closeAllConnections === "function") {
        this.server.closeAllConnections();
      }
      this.server.close(() => {
        console.log("[MCN Server] 服务已停止");
        this.server = null;
        resolve();
      });
    });
  }

  async handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    // CORS Headers for local development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    try {
      // 1. API: POST /api/production/jobs
      if (pathname === "/api/production/jobs" && req.method === "POST") {
        return this.handleCreateJob(req, res);
      }

      // 2. API: GET /api/production/jobs/:id
      if (pathname.startsWith("/api/production/jobs/") && req.method === "GET") {
        const jobId = pathname.replace("/api/production/jobs/", "");
        return this.handleGetJob(req, res, jobId);
      }

      // 3. API: GET /api/production/jobs
      if (pathname === "/api/production/jobs" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ jobs: this.jobService.listJobs() }));
      }

      // 4. API: GET /api/videos/:filename (Range capable)
      if (pathname.startsWith("/api/videos/") && req.method === "GET") {
        const filename = path.basename(pathname.replace("/api/videos/", ""));
        return this.handleStreamVideo(req, res, filename);
      }

      // 5. Static files fallback
      return this.handleStatic(req, res, pathname);
    } catch (err) {
      console.error("[MCN Server Error]", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  async handleCreateJob(req, res) {
    let bodyStr = "";
    req.on("data", (chunk) => (bodyStr += chunk));
    req.on("end", async () => {
      try {
        const payload = bodyStr ? JSON.parse(bodyStr) : {};
        const topicId = payload.topic_id || payload.topicId || "topic_qf18_dangerous_probe";

        console.log(`[MCN Server] 收到生产请求: topic_id=${topicId}`);

        let job;
        if (topicId.includes("wu_suspicion") || topicId === "topic_a" || topicId.includes("怀疑余则成")) {
          // Topic A
          const planPath = path.resolve(REPO_ROOT, "src/director/results/director_plan_topic_a.json");
          const orderPath = path.resolve(REPO_ROOT, "src/director/results/vmv_order_topic_a.json");
          const plan = JSON.parse(fs.readFileSync(planPath, "utf-8"));
          job = this.jobService.createJob({
            contentId: payload.content_id || `content_${Date.now().toString(36)}`,
            topicId: plan.topic_id,
            directorPlanId: plan.director_plan_id,
            productionOrderId: "order_vmv_topic_a_wu_suspicion",
            orderFilePath: orderPath,
            outputFileName: "topic_a_final.mp4",
          });
        } else {
          // Topic B (Default)
          const planPath = path.resolve(REPO_ROOT, "src/director/results/director_plan_topic_b.json");
          const orderPath = path.resolve(REPO_ROOT, "src/director/results/vmv_order_topic_b.json");
          const plan = JSON.parse(fs.readFileSync(planPath, "utf-8"));
          job = this.jobService.createJob({
            contentId: payload.content_id || `content_${Date.now().toString(36)}`,
            topicId: plan.topic_id,
            directorPlanId: plan.director_plan_id,
            productionOrderId: "order_vmv_topic_b_dangerous_probe",
            orderFilePath: orderPath,
            outputFileName: "topic_b_final.mp4",
          });
        }

        // Run asynchronously in background
        this.jobService.runJob(job.job_id).catch((err) => {
          console.error(`[MCN Server] Job ${job.job_id} 执行出错:`, err);
        });

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(job));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }

  handleGetJob(req, res, jobId) {
    const job = this.jobService.getJob(jobId);
    if (!job) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: `Job ${jobId} not found` }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(job));
  }

  handleStreamVideo(req, res, filename) {
    const videoPath = path.join(this.outputDir, filename);
    if (!fs.existsSync(videoPath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: `Video ${filename} not found` }));
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Byte range request
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4",
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Full content
      const head = {
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
        "Content-Type": "video/mp4",
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  }

  handleStatic(req, res, pathname) {
    let cleanPath = pathname === "/" ? "/index.html" : pathname;
    cleanPath = cleanPath.replace(/^\/+/, "");
    const filePath = path.resolve(STATIC_ROOT, cleanPath);

    // Prevent directory traversal
    if (!filePath.startsWith(STATIC_ROOT)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      return res.end("Not Found");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  }
}
