/**
 * @file evidence-store.mjs
 * @description POC-AGENT A2: L1 稳定客观 Evidence 存储服务。
 * 遵循严格物理只读与防污染原则，支撑跨博主复用。
 */

import { validateObjectiveEvidence, parseTimecodeToSeconds, L1PollutionError } from "./objective-evidence.mjs";

export class EvidenceStore {
  constructor() {
    this._records = new Map(); // key: evidence_id -> ObjectiveEvidence
    this._mediaIndex = new Map(); // key: media_id -> Array<evidence_id>
  }

  /**
   * 注册一组客观 Evidence
   * @param {Array<Object>} evidenceList
   */
  registerBatch(evidenceList) {
    if (!Array.isArray(evidenceList)) {
      throw new Error("registerBatch 期望传入数组");
    }

    for (const ev of evidenceList) {
      validateObjectiveEvidence(ev);
      const frozen = Object.freeze({ ...ev, timecode: Object.freeze({ ...ev.timecode }) });

      this._records.set(ev.evidence_id, frozen);

      if (!this._mediaIndex.has(ev.media_id)) {
        this._mediaIndex.set(ev.media_id, []);
      }
      const list = this._mediaIndex.get(ev.media_id);
      if (!list.includes(ev.evidence_id)) {
        list.push(ev.evidence_id);
      }
    }
  }

  /**
   * 根据 ID 查询单个证据
   * @param {string} evidenceId
   * @returns {Object|null}
   */
  get(evidenceId) {
    return this._records.get(evidenceId) || null;
  }

  /**
   * 列出指定作品的所有证据
   * @param {string} mediaId
   * @returns {Array<Object>}
   */
  listByMedia(mediaId) {
    const ids = this._mediaIndex.get(mediaId) || [];
    return ids.map((id) => this._records.get(id));
  }

  /**
   * 按起止秒数范围检索某个作品的镜头证据
   * @param {string} mediaId
   * @param {number} startSec
   * @param {number} endSec
   * @returns {Array<Object>}
   */
  queryTimeRange(mediaId, startSec, endSec) {
    const list = this.listByMedia(mediaId);
    return list.filter((ev) => {
      const inSec = parseTimecodeToSeconds(ev.timecode.in);
      const outSec = parseTimecodeToSeconds(ev.timecode.out);
      return inSec < endSec && outSec > startSec;
    });
  }

  /**
   * 按出现角色查询客观证据
   * @param {string} characterName
   * @returns {Array<Object>}
   */
  findByCharacter(characterName) {
    const results = [];
    for (const ev of this._records.values()) {
      if (Array.isArray(ev.characters) && ev.characters.includes(characterName)) {
        results.push(ev);
      }
    }
    return results;
  }

  /**
   * 按场景 ID 查询客观证据
   * @param {string} sceneId
   * @returns {Array<Object>}
   */
  findByScene(sceneId) {
    const results = [];
    for (const ev of this._records.values()) {
      if (ev.scene_id === sceneId) {
        results.push(ev);
      }
    }
    return results;
  }

  /**
   * 获取所有登记的证据总数
   * @returns {number}
   */
  size() {
    return this._records.size;
  }

  /**
   * 严禁修改已有客观事实 (主动拦截污染)
   */
  update() {
    throw new L1PollutionError("update", "L1 客观事实层为只读基准，严禁覆盖或修改已有证据！");
  }
}
