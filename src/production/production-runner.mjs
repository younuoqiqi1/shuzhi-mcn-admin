/**
 * @file production-runner.mjs
 * @description POC-AGENT A8: 端到端真实生产流水线执行器 (Production Runner)。
 * 
 * 协调：
 * Director Plan -> VMV Production Order -> ProductionJobService -> VMV Stage 4/5 真实合成
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VMVProductionAdapter } from "../director/vmv-production-adapter.mjs";
import { ProductionJobService } from "./production-job-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const RESULTS_DIR = path.resolve(__dirname, "../director/results");
const OUTPUT_DIR = path.resolve(REPO_ROOT, "outputs/production");

export class ProductionRunner {
  constructor(jobService = null) {
    this.jobService = jobService || new ProductionJobService({ outputDir: OUTPUT_DIR });
  }

  /**
   * 执行选题 B 生产：余则成最危险的一次试探
   */
  async produceTopicB(options = {}) {
    const planPath = options.planPath || path.join(RESULTS_DIR, "director_plan_topic_b.json");
    const orderPath = options.orderPath || path.join(RESULTS_DIR, "vmv_order_topic_b.json");
    
    if (!fs.existsSync(planPath)) {
      throw new Error(`Director Plan not found at ${planPath}`);
    }

    const directorPlan = JSON.parse(fs.readFileSync(planPath, "utf-8"));

    // Ensure order exists or regenerate via VMVProductionAdapter
    if (!fs.existsSync(orderPath)) {
      const order = VMVProductionAdapter.adaptPlanToProductionOrder(directorPlan, {
        orderId: "order_vmv_topic_b_dangerous_probe",
      });
      fs.writeFileSync(orderPath, JSON.stringify(order, null, 2), "utf-8");
    }

    const job = this.jobService.createJob({
      contentId: options.contentId || "content_topic_b_dangerous_probe",
      topicId: directorPlan.topic_id || "topic_qf18_dangerous_probe",
      directorPlanId: directorPlan.director_plan_id,
      productionOrderId: "order_vmv_topic_b_dangerous_probe",
      orderFilePath: orderPath,
      outputFileName: "topic_b_final.mp4",
    });

    console.log(`[ProductionRunner] 启动选题 B 生产任务: ${job.job_id}`);
    const completedJob = await this.jobService.runJob(job.job_id);
    return completedJob;
  }

  /**
   * 执行选题 A 生产：吴站长什么时候开始怀疑余则成？
   */
  async produceTopicA(options = {}) {
    const planPath = options.planPath || path.join(RESULTS_DIR, "director_plan_topic_a.json");
    const orderPath = options.orderPath || path.join(RESULTS_DIR, "vmv_order_topic_a.json");

    if (!fs.existsSync(planPath)) {
      throw new Error(`Director Plan not found at ${planPath}`);
    }

    const directorPlan = JSON.parse(fs.readFileSync(planPath, "utf-8"));

    if (!fs.existsSync(orderPath)) {
      const order = VMVProductionAdapter.adaptPlanToProductionOrder(directorPlan, {
        orderId: "order_vmv_topic_a_wu_suspicion",
      });
      fs.writeFileSync(orderPath, JSON.stringify(order, null, 2), "utf-8");
    }

    const job = this.jobService.createJob({
      contentId: options.contentId || "content_topic_a_wu_suspicion",
      topicId: directorPlan.topic_id || "topic_qf18_wu_suspicion",
      directorPlanId: directorPlan.director_plan_id,
      productionOrderId: "order_vmv_topic_a_wu_suspicion",
      orderFilePath: orderPath,
      outputFileName: "topic_a_final.mp4",
    });

    console.log(`[ProductionRunner] 启动选题 A 生产任务: ${job.job_id}`);
    const completedJob = await this.jobService.runJob(job.job_id);
    return completedJob;
  }
}
