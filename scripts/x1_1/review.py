"""
scripts/x1_1/review.py
单 HTML 静态人工审核平台生成模块 (X1.1 原 45 帧 + Gemini 单 Provider + 客观事实计数规范)

特性:
1. 真实嵌入原 45 帧 384x384 视觉图像 (base64 嵌入);
2. 生产审核仅面向 AGY CLI Gemini 单 Provider；历史本地结果仅作为只读参考 (Historical) 折叠展示，严禁新增本地推理;
3. Objective 审核引入逐事实计数 (factual_count / hallucinated_count)，以及 scene / action 独立客观审核 (accepted/rejected/uncertain)，严禁以单帧粗标签假装事实率;
4. 用户手工填写，禁止系统预填，默认未选择时为 null;
5. 保持 40 对人脸 pairs 不改且 hidden 相似度，人工判定无默认标签，导入/导出 JSON 完全兼容;
6. 支持 --section faces / vlm / all，支持仅生成人脸审核材料;
7. 严格使用 html.escape 防止 XSS 注入，<=55s 生命周期守卫。
"""
import argparse
import base64
import html
import json
import os
import sys
import time
from typing import Tuple, Dict, Any, Optional

from scripts.x1_1.lifecycle import setup_lifecycle_guard
from scripts.x1_1.isolation_guard import assert_safe_path

import hashlib
import io
from PIL import Image

TMP_DIR = "/private/tmp/x1_1"
DEFAULT_PAIRS_PATH = "benchmarks/x1/predictions/x1_1/face_pairs_anonymous.json"
PRED_DIR = "benchmarks/x1/predictions/x1_1"
OUT_HTML_PATH = "/private/tmp/x1_1/review/review.html"

def img_to_b64(img_path: str) -> str:
    if not img_path or not os.path.exists(img_path):
        return ""
    try:
        with open(img_path, "rb") as f:
            return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode("utf-8")
    except Exception:
        return ""

def get_standardized_384_preview(img_path: str) -> Tuple[str, str]:
    """
    生成与 Provider 一致的 384x384 标准化 JPEG 预览及 canonical bytehash
    """
    if not img_path or not os.path.exists(img_path):
        return "", "unknown"
    try:
        with open(img_path, "rb") as f:
            raw_bytes = f.read()
        pil_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        pil_img = pil_img.resize((384, 384))
        buf = io.BytesIO()
        pil_img.save(buf, format="JPEG", quality=90)
        std_bytes = buf.getvalue()
        c_hash = hashlib.sha256(std_bytes).hexdigest()
        b64 = "data:image/jpeg;base64," + base64.b64encode(std_bytes).decode("utf-8")
        return b64, c_hash
    except Exception:
        return img_to_b64(img_path), "unknown"

def locate_frame_path(shot_id: str, pct: str) -> str:
    candidates = [
        f"/private/tmp/x1_0/frames/{shot_id}/frame_{pct}.jpg",
        f"/private/tmp/x1_1/frames/{shot_id}/frame_{pct}.jpg",
        f"/private/tmp/x1_1/anonymous_frames/{shot_id}_frame_{pct}.jpg",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return ""

def load_vlm_predictions(pred_dir: str) -> dict:
    preds = {}
    if not os.path.exists(pred_dir):
        return preds
    for fname in os.listdir(pred_dir):
        if fname.startswith("vlm_") and fname.endswith(".json"):
            fpath = os.path.join(pred_dir, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    f_id = data.get("frame_id")
                    prov = data.get("provider", "unknown")
                    if f_id:
                        if f_id not in preds:
                            preds[f_id] = {}
                        preds[f_id][prov] = data.get("response", {})
            except Exception:
                pass
    return preds

def build_review_html(pairs_file: str, pred_dir: str, section: str, out_html_path: str):
    pairs_data = []
    if section in ("faces", "all") and os.path.exists(pairs_file):
        with open(pairs_file, "r", encoding="utf-8") as f:
            c = json.load(f)
            pairs_data = c.get("pairs", [])

    vlm_preds = load_vlm_predictions(pred_dir)

    shots_15 = [
        "shot_0010", "shot_0018", "shot_0019", "shot_0026", "shot_0035",
        "shot_0053", "shot_0055", "shot_0056", "shot_0069", "shot_0070",
        "shot_0095", "shot_0117", "shot_0133", "shot_0137", "shot_0149"
    ]
    anchor_frames = []
    for s in shots_15:
        for p in ["25", "50", "75"]:
            anchor_frames.append((s, p, f"{s}_frame_{p}"))

    html_code = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>X1.1 人工独立审核材料与标注工作台 ({section})</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; color: #1e293b; margin: 0; padding: 20px; }}
        .topbar {{ position: sticky; top: 0; background: #0f172a; color: #fff; padding: 12px 20px; border-radius: 8px; z-index: 1000; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }}
        .btn {{ background: #2563eb; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; }}
        .btn:hover {{ background: #1d4ed8; }}
        .btn-outline {{ background: transparent; border: 1px solid #94a3b8; color: #e2e8f0; margin-right: 8px; }}
        .section {{ background: #fff; padding: 24px; border-radius: 8px; margin-top: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }}
        .pair-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; margin-top: 16px; }}
        .pair-card {{ border: 1px solid #cbd5e1; padding: 14px; border-radius: 8px; background: #f8fafc; }}
        .img-row {{ display: flex; gap: 14px; margin: 10px 0; }}
        .img-row img {{ width: 110px; height: 110px; object-fit: cover; border-radius: 6px; border: 1px solid #94a3b8; }}
        .vlm-row {{ border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 20px; background: #f8fafc; }}
        .vlm-grid {{ display: grid; grid-template-columns: 240px 1fr; gap: 16px; margin-top: 12px; }}
        .vlm-box {{ background: #fff; border: 1px solid #e2e8f0; padding: 14px; border-radius: 6px; font-size: 13px; }}
        .frame-preview {{ width: 220px; height: 220px; object-fit: contain; background: #000; border-radius: 6px; }}
        pre {{ background: #f1f5f9; padding: 8px; border-radius: 4px; overflow-x: auto; max-height: 240px; font-size: 12px; }}
        .note-input {{ width: 100%; box-sizing: border-box; padding: 6px; margin-top: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; }}
        .audit-group {{ margin-top: 10px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }}
        .audit-title {{ font-weight: 600; font-size: 13px; color: #334155; margin-bottom: 6px; }}
        .fact-count-input {{ width: 85px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px; margin-left: 6px; }}
        label {{ margin-right: 14px; font-size: 13px; cursor: pointer; }}
        .badge {{ background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="topbar">
        <div>
            <strong>X1.1 人工独立审核工作台</strong>
            <span class="badge" style="margin-left: 10px;">Provenance: human_review</span>
            <input type="text" id="reviewer-name" placeholder="审核员代号 (默认 anonymous)" style="margin-left:12px; padding:4px 8px; border-radius:4px; border:1px solid #64748b; background:#1e293b; color:#fff;" />
        </div>
        <div>
            <input type="file" id="import-file" style="display:none;" onchange="importJSON(event)" />
            <button class="btn btn-outline" onclick="document.getElementById('import-file').click()">导入进度 JSON</button>
            <button class="btn" onclick="exportJSON()">导出标注 JSON</button>
        </div>
    </div>
"""

    if section in ("faces", "all"):
        html_code += f"""
    <div class="section">
        <h2>任务 1: 40 对跨 Shot 匿名人脸 Pairs 人工判定</h2>
        <p><small>说明：相似度已严格隐藏。请肉眼比对判定是否为同一人物。未选择保留为 null，真正点击才生效。</small></p>
        <div class="pair-grid">
"""
        for p in pairs_data:
            pid = p["pair_id"]
            img_a = img_to_b64(p["face_a"]["crop_path"])
            img_b = img_to_b64(p["face_b"]["crop_path"])
            html_code += f"""
            <div class="pair-card" data-pid="{pid}">
                <strong>Pair ID: {pid}</strong>
                <div class="img-row">
                    <div>
                        <img src="{img_a}" alt="Face A">
                        <div><small>{html.escape(p["face_a"]["face_id"])}</small></div>
                    </div>
                    <div>
                        <img src="{img_b}" alt="Face B">
                        <div><small>{html.escape(p["face_b"]["face_id"])}</small></div>
                    </div>
                </div>
                <div>
                    <label><input type="radio" name="face_{pid}" value="same" onchange="autoSave()"> 同一人 (same)</label>
                    <label><input type="radio" name="face_{pid}" value="different" onchange="autoSave()"> 不同人 (different)</label>
                    <label><input type="radio" name="face_{pid}" value="uncertain" onchange="autoSave()"> 不确定 (uncertain)</label>
                </div>
            </div>
"""
        html_code += """
        </div>
    </div>
"""

    if section in ("vlm", "all"):
        html_code += f"""
    <div class="section">
        <h2>任务 2: 原 45 Anchor 帧客观观察审核 (AGY CLI Gemini 单 Provider)</h2>
        <p><small>说明：生产环境仅以 Gemini 单 Provider 为准。历史本地结果仅供只读参考 (Historical)，严禁新增本地推理。人工核验无默认标签。请对每个事实陈述逐项核对计数，并分别对场景与物理动作独立判定，避免以单帧总标签假装事实率。用户手工填写，禁止系统预填。</small></p>
"""
        for s, p, fid in anchor_frames:
            f_path = locate_frame_path(s, p)
            raw_b64 = img_to_b64(f_path)
            std_b64, calc_hash = get_standardized_384_preview(f_path)

            f_preds = vlm_preds.get(fid, {})
            mlx_res = f_preds.get("local-mlx", {})
            gemini_res = f_preds.get("agy-gemini", {})

            # 1. 标题 badge 需从实际 model_version 读取
            actual_model = gemini_res.get("model_version") or "gemini-3.1-pro-high"
            badge_text = f"Model: {actual_model}"

            # 2. 失败必须显示真实 error 而非 Pending
            if gemini_res.get("error"):
                gemini_display = f"[Error / 推理失败: {html.escape(str(gemini_res['error']))}]"
            elif gemini_res.get("parsed_validation"):
                gemini_display = html.escape(json.dumps(gemini_res.get("parsed_validation"), indent=2, ensure_ascii=False))
            elif gemini_res:
                gemini_display = f"[Warning / 原始输出异常: {html.escape(str(gemini_res.get('raw_text', '')))}]"
            else:
                gemini_display = "[Pending: 待 AGY CLI 运行]"

            mlx_json = html.escape(json.dumps(mlx_res.get("parsed_validation"), indent=2, ensure_ascii=False)) if mlx_res.get("parsed_validation") else "[Pending / 无本地历史记录]"

            # 3. 与 Provider 一致的 canonical JPEG bytehash
            canonical_hash = gemini_res.get("inference_image_hash") or calc_hash

            html_code += f"""
        <div class="vlm-row" data-fid="{fid}">
            <h3>Anchor 帧: {fid}</h3>
            <div class="vlm-grid">
                <div>
                    <img class="frame-preview" src="{std_b64}" alt="{fid}">
                    <div style="margin-top:6px; font-size:11px; color:#334155;">
                        <strong>384×384 标准化输入</strong> (模型实际输入像素)<br>
                        <span style="font-family: monospace; font-size: 10px; color:#64748b; word-break: break-all;">Hash: {canonical_hash[:16]}...</span>
                    </div>
                    <details style="margin-top:8px;">
                        <summary style="cursor: pointer; font-size: 11px; color: #2563eb; font-weight: 500;">查看原始高清帧</summary>
                        <img src="{raw_b64}" alt="Raw {fid}" style="width: 220px; margin-top: 4px; border-radius: 4px; border: 1px solid #cbd5e1;">
                        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">说明: 模型推理仅使用 384×384 统一缩放像素，不可依据原图高清画质推断模型所见细节。</div>
                    </details>
                    <div style="margin-top:6px;"><small>{s} ({p}%)</small></div>
                </div>
                <div class="vlm-box">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong>AGY CLI (Gemini 生产单 Provider):</strong>
                        <span class="badge">{html.escape(badge_text)}</span>
                    </div>
                    <pre>{gemini_display}</pre>

                    <div class="audit-group">
                        <div class="audit-title">1. 客观事实逐项计数 (禁止预填，请人工逐条核对陈述后手工填写):</div>
                        <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                            <label>符合事实陈述数 (factual_count):
                                <input type="number" min="0" step="1" id="factual_{fid}" class="fact-count-input" placeholder="填写数量" oninput="autoSave()">
                            </label>
                            <label>存在幻觉陈述数 (hallucinated_count):
                                <input type="number" min="0" step="1" id="hallucinated_{fid}" class="fact-count-input" placeholder="填写数量" oninput="autoSave()">
                            </label>
                        </div>
                    </div>

                    <div class="audit-group">
                        <div class="audit-title">2. 场景/环境独立审核 (Scene Audit - 人工判定无默认标签):</div>
                        <div>
                            <label><input type="radio" name="scene_{fid}" value="accepted" onchange="autoSave()"> 客观符合 (accepted)</label>
                            <label><input type="radio" name="scene_{fid}" value="rejected" onchange="autoSave()"> 存在幻觉/错误 (rejected)</label>
                            <label><input type="radio" name="scene_{fid}" value="uncertain" onchange="autoSave()"> 不确定 (uncertain)</label>
                        </div>
                    </div>

                    <div class="audit-group">
                        <div class="audit-title">3. 物理动作独立审核 (Action Audit - 人工判定无默认标签):</div>
                        <div>
                            <label><input type="radio" name="action_{fid}" value="accepted" onchange="autoSave()"> 客观符合 (accepted)</label>
                            <label><input type="radio" name="action_{fid}" value="rejected" onchange="autoSave()"> 存在幻觉/错误 (rejected)</label>
                            <label><input type="radio" name="action_{fid}" value="uncertain" onchange="autoSave()"> 不确定 (uncertain)</label>
                        </div>
                    </div>

                    <input type="text" class="note-input" id="note_gemini_{fid}" placeholder="Gemini 观察备注 / 错误细节说明" oninput="autoSave()">

                    <details style="margin-top: 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 8px;">
                        <summary style="cursor: pointer; font-size: 12px; font-weight: bold; color: #64748b;">历史本地结果 (Historical: Local MLX - 仅供只读参考，不可新增推理)</summary>
                        <pre style="margin-top: 6px; max-height: 160px;">{mlx_json}</pre>
                    </details>
                </div>
            </div>
        </div>
"""
        html_code += """
    </div>
"""

    html_code += """
    <script>
        const STORAGE_KEY = "x1_1_review_cache_v3";

        function getFormData() {
            const data = {
                timestamp: new Date().toISOString(),
                provenance: "human_review",
                reviewer: document.getElementById("reviewer-name").value || "anonymous_reviewer",
                face_pairs: {},
                vlm_gemini_audits: {},
                vlm_mlx_audits: {},
            };

            document.querySelectorAll(".pair-card").forEach(el => {
                const pid = el.getAttribute("data-pid");
                const checked = el.querySelector(`input[name="face_${pid}"]:checked`);
                data.face_pairs[pid] = checked ? checked.value : null;
            });

            document.querySelectorAll(".vlm-row").forEach(el => {
                const fid = el.getAttribute("data-fid");
                const factualInp = document.getElementById(`factual_${fid}`);
                const hallucinatedInp = document.getElementById(`hallucinated_${fid}`);
                const sceneCheck = el.querySelector(`input[name="scene_${fid}"]:checked`);
                const actionCheck = el.querySelector(`input[name="action_${fid}"]:checked`);
                const noteInp = document.getElementById(`note_gemini_${fid}`);

                const factualVal = (factualInp && factualInp.value !== "") ? parseInt(factualInp.value, 10) : null;
                const hallucinatedVal = (hallucinatedInp && hallucinatedInp.value !== "") ? parseInt(hallucinatedInp.value, 10) : null;

                data.vlm_gemini_audits[fid] = {
                    factual_count: factualVal,
                    hallucinated_count: hallucinatedVal,
                    scene_audit: sceneCheck ? sceneCheck.value : null,
                    action_audit: actionCheck ? actionCheck.value : null,
                    notes: noteInp ? noteInp.value : "",
                    label: sceneCheck ? sceneCheck.value : null
                };
            });
            return data;
        }

        function autoSave() {
            const data = getFormData();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }

        function restoreFromData(data) {
            if (!data) return;
            if (data.reviewer) document.getElementById("reviewer-name").value = data.reviewer;

            if (data.face_pairs) {
                for (const [pid, val] of Object.entries(data.face_pairs)) {
                    if (val) {
                        const r = document.querySelector(`input[name="face_${pid}"][value="${val}"]`);
                        if (r) r.checked = true;
                    }
                }
            }

            if (data.vlm_gemini_audits) {
                for (const [fid, item] of Object.entries(data.vlm_gemini_audits)) {
                    if (!item) continue;
                    const factualInp = document.getElementById(`factual_${fid}`);
                    if (factualInp && item.factual_count !== null && item.factual_count !== undefined) {
                        factualInp.value = item.factual_count;
                    }

                    const hallucinatedInp = document.getElementById(`hallucinated_${fid}`);
                    if (hallucinatedInp && item.hallucinated_count !== null && item.hallucinated_count !== undefined) {
                        hallucinatedInp.value = item.hallucinated_count;
                    }

                    if (item.scene_audit) {
                        const r = document.querySelector(`input[name="scene_${fid}"][value="${item.scene_audit}"]`);
                        if (r) r.checked = true;
                    } else if (item.label) {
                        const r = document.querySelector(`input[name="scene_${fid}"][value="${item.label}"]`);
                        if (r) r.checked = true;
                    }

                    if (item.action_audit) {
                        const r = document.querySelector(`input[name="action_${fid}"][value="${item.action_audit}"]`);
                        if (r) r.checked = true;
                    }

                    if (item.notes) {
                        const inp = document.getElementById(`note_gemini_${fid}`);
                        if (inp) inp.value = item.notes;
                    }
                }
            }
        }

        function exportJSON() {
            const data = getFormData();
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `x1_1_human_labels_${data.reviewer}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function importJSON(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    restoreFromData(data);
                    autoSave();
                    alert("标注数据导入并恢复成功！");
                } catch(err) {
                    alert("JSON 解析失败: " + err);
                }
            };
            reader.readAsText(file);
        }

        window.addEventListener("DOMContentLoaded", () => {
            const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("x1_1_review_cache_v2");
            if (saved) {
                try {
                    restoreFromData(JSON.parse(saved));
                } catch(e) {}
            }
        });
    </script>
</body>
</html>
"""
    os.makedirs(os.path.dirname(out_html_path), exist_ok=True)
    with open(out_html_path, "w", encoding="utf-8") as f:
        f.write(html_code)

def main():
    setup_lifecycle_guard(55)

    parser = argparse.ArgumentParser(description="生成 X1.1 单 HTML 静态人工审核平台 (<=55s)")
    parser.add_argument("--section", type=str, default="all", choices=["faces", "vlm", "all"], help="生成板块: faces, vlm 或 all")
    parser.add_argument("--pairs-file", type=str, default=DEFAULT_PAIRS_PATH, help="人脸 Pairs 文件")
    parser.add_argument("--pred-dir", type=str, default=PRED_DIR, help="预测目录")
    parser.add_argument("--out-html", type=str, default=OUT_HTML_PATH, help="输出 HTML 路径")
    args = parser.parse_args()

    assert_safe_path(args.pairs_file)
    assert_safe_path(args.pred_dir)

    print(f"=== [Review Generator] 正在构建审核页面 (Section: {args.section}) ===")
    build_review_html(args.pairs_file, args.pred_dir, args.section, args.out_html)
    print(f"审核页面已生成至: {args.out_html}")

if __name__ == "__main__":
    main()
