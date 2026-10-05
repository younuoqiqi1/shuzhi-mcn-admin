"""
scripts/x1_1/calibrate_face.py
人脸余弦阈值校准与泛化验证模块 (X1.1 独立 Calibration 阶段)

严格约束:
1. 仅限独立阶段运行，inference 代码绝不接触该文件或 labels;
2. 门禁 1: 必须提供 --labels-file，且内含 provenance == 'human_review'，且 reviewer 非空;
3. 门禁 2: 有效标注样本 min >= 10，且 same 与 different 两类各至少 2 条，校准与 eval 集合切分后均保证双类别非空;
4. 候选阈值动态取自校准集真实 cosine 分数的相邻中点与极值点，评估集绝不参与候选生成与阈值优化;
5. 优化目标: Balanced Accuracy = (TPR + TNR)/2 为主，F1 为辅；遇 Tie 时选择更保守的较高阈值;
6. 输出具体 pair_id 的 FP / FN 错判清单与样本量，保存 calibration_pair_ids/holdout_pair_ids、两集合 confusion (tp/fp/fn/tn)、precision/recall/f1、候选阈值及优化目标;
7. 明确划分仅为 pair-disjoint，计算 shared_face_ids 数量并声明非 person-disjoint、不足以证明全 PersonConsistency。
"""
import argparse
import hashlib
import json
import os
import random
import sys
from typing import List, Dict, Any, Tuple, Optional

from scripts.x1_1.lifecycle import setup_lifecycle_guard
from scripts.x1_1.isolation_guard import assert_safe_path

class CalibrationBlockedError(RuntimeError):
    pass

def _compute_sha256(file_path: str) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

class AnnotatedPairsList(list):
    """带元数据的标注 Pairs 列表，兼容标准 list 接口"""
    def __init__(self, items: List[Dict[str, Any]], meta: Optional[Dict[str, Any]] = None):
        super().__init__(items)
        self.meta: Dict[str, Any] = meta or {}

def load_and_verify_human_labels(labels_file: str, pairs_file: str) -> AnnotatedPairsList:
    assert_safe_path(labels_file)
    assert_safe_path(pairs_file)

    if not os.path.exists(labels_file):
        raise CalibrationBlockedError(f"标注文件不存在: {labels_file}，状态为 blocked (待人工标注)！")
    if not os.path.exists(pairs_file):
        raise CalibrationBlockedError(f"Pairs 文件不存在: {pairs_file}，状态为 blocked！")

    labels_sha256 = _compute_sha256(labels_file)
    pairs_sha256 = _compute_sha256(pairs_file)

    with open(labels_file, "r", encoding="utf-8") as f:
        lbl_data = json.load(f)

    # 门禁 1: provenance == 'human_review'
    provenance = lbl_data.get("provenance")
    if provenance != "human_review":
        raise CalibrationBlockedError(
            f"安全门禁拒绝: labels_file 缺少有效 human_review 溯源标记 (实际: {provenance})，严禁伪造！"
        )

    # 门禁 1.1: reviewer 必须非空
    reviewer = lbl_data.get("reviewer")
    if not reviewer or not isinstance(reviewer, str) or not reviewer.strip():
        raise CalibrationBlockedError(
            f"安全门禁拒绝: labels_file 缺少有效 reviewer (人审员) 标识 (实际: {reviewer})，必须非空以关联真实人审源！"
        )
    reviewer = reviewer.strip()

    with open(pairs_file, "r", encoding="utf-8") as f:
        pairs_meta = json.load(f)
    pairs_list = pairs_meta.get("pairs", [])

    user_face_labels = lbl_data.get("face_pairs", {})
    annotated_pairs: List[Dict[str, Any]] = []
    uncertain_count = 0
    unannotated_count = 0

    for p in pairs_list:
        pid = p["pair_id"]
        val = user_face_labels.get(pid)

        fa = p.get("face_a", {})
        fb = p.get("face_b", {})
        fa_id = fa.get("face_id") if isinstance(fa, dict) else None
        fb_id = fb.get("face_id") if isinstance(fb, dict) else None

        if val in ("same", "different"):
            annotated_pairs.append({
                "pair_id": pid,
                "sim": p.get("_internal_cosine_sim", 0.0),
                "label": val,
                "face_a_id": fa_id,
                "face_b_id": fb_id,
            })
        elif val == "uncertain":
            uncertain_count += 1
        else:
            unannotated_count += 1

    # 门禁 2: 样本量及双类别检验 (两类各至少 2 条)
    sames = [p for p in annotated_pairs if p["label"] == "same"]
    diffs = [p for p in annotated_pairs if p["label"] == "different"]

    if len(annotated_pairs) < 10:
        raise CalibrationBlockedError(
            f"有效人工标注数量不足 ({len(annotated_pairs)}/10)。校准已拦截 (blocked)！"
        )
    if len(sames) < 2 or len(diffs) < 2:
        raise CalibrationBlockedError(
            f"缺少双类别样本或类别样本不足 (same: {len(sames)}, different: {len(diffs)})。"
            f"要求 same 与 different 每类各至少 2 条标注，以避免分层划分后校准集或评估集缺失某一类别！"
        )

    meta = {
        "provenance": provenance,
        "reviewer": reviewer,
        "labels_sha256": labels_sha256,
        "pairs_sha256": pairs_sha256,
        "annotated_count": len(annotated_pairs),
        "uncertain_count": uncertain_count,
        "unannotated_count": unannotated_count,
        "total_pairs_count": len(pairs_list),
    }

    return AnnotatedPairsList(annotated_pairs, meta=meta)

def _compute_metrics(subset: List[Dict[str, Any]], thresh: float) -> Dict[str, Any]:
    tp_ids = [p["pair_id"] for p in subset if p["sim"] >= thresh and p["label"] == "same"]
    fp_ids = [p["pair_id"] for p in subset if p["sim"] >= thresh and p["label"] == "different"]
    fn_ids = [p["pair_id"] for p in subset if p["sim"] < thresh and p["label"] == "same"]
    tn_ids = [p["pair_id"] for p in subset if p["sim"] < thresh and p["label"] == "different"]

    tp = len(tp_ids)
    fp = len(fp_ids)
    fn = len(fn_ids)
    tn = len(tn_ids)

    precision = round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0.0
    recall = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 0.0
    f1 = round((2 * precision * recall) / (precision + recall), 4) if (precision + recall) > 0 else 0.0

    tpr = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    tnr = tn / (tn + fp) if (tn + fp) > 0 else 0.0
    balanced_acc = round((tpr + tnr) / 2.0, 4)

    return {
        "sample_count": len(subset),
        "confusion": {
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn,
        },
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "balanced_accuracy": balanced_acc,
        "tp_pair_ids": tp_ids,
        "fp_pair_ids": fp_ids,
        "fn_pair_ids": fn_ids,
        "tn_pair_ids": tn_ids,
    }

def calibrate_and_evaluate(pairs: List[Dict[str, Any]], metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    meta = metadata or getattr(pairs, "meta", {})

    sames = [p for p in pairs if p["label"] == "same"]
    diffs = [p for p in pairs if p["label"] == "different"]

    if len(sames) < 2 or len(diffs) < 2:
        raise CalibrationBlockedError(
            f"校准输入样本双类别不足 (same: {len(sames)}, different: {len(diffs)})，每类至少需要 2 条！"
        )

    # 类别分层划分 50% cal / 50% eval (确保两类切分后每集合至少 1 条)
    rng = random.Random(20261005)
    sames_shuffled = list(sames)
    diffs_shuffled = list(diffs)
    rng.shuffle(sames_shuffled)
    rng.shuffle(diffs_shuffled)

    cal_same_cnt = max(1, len(sames_shuffled) // 2)
    cal_diff_cnt = max(1, len(diffs_shuffled) // 2)

    cal_set = sames_shuffled[:cal_same_cnt] + diffs_shuffled[:cal_diff_cnt]
    eval_set = sames_shuffled[cal_same_cnt:] + diffs_shuffled[cal_diff_cnt:]

    # 严格门禁: 校准集和 eval 集合都检查双类非空
    cal_sames = [p for p in cal_set if p["label"] == "same"]
    cal_diffs = [p for p in cal_set if p["label"] == "different"]
    eval_sames = [p for p in eval_set if p["label"] == "same"]
    eval_diffs = [p for p in eval_set if p["label"] == "different"]

    if not cal_sames or not cal_diffs:
        raise CalibrationBlockedError(
            f"校准集合缺少双类别样本 (same: {len(cal_sames)}, different: {len(cal_diffs)})！"
        )
    if not eval_sames or not eval_diffs:
        raise CalibrationBlockedError(
            f"评估集合缺少双类别样本 (same: {len(eval_sames)}, different: {len(eval_diffs)})！"
        )

    cal_pair_ids = [p["pair_id"] for p in cal_set]
    eval_pair_ids = [p["pair_id"] for p in eval_set]

    # 保留 pair-disjoint 的划分
    if not set(cal_pair_ids).isdisjoint(set(eval_pair_ids)):
        raise CalibrationBlockedError("严重异常: 校准集与评估集 pair_id 存在重叠，违背 pair-disjoint 隔离！")

    # 计算 shared_face_ids 数量（从 pairs face_a/face_b.face_id）
    cal_face_ids = set()
    for p in cal_set:
        fa = p.get("face_a_id") or (p.get("face_a", {}).get("face_id") if isinstance(p.get("face_a"), dict) else None)
        fb = p.get("face_b_id") or (p.get("face_b", {}).get("face_id") if isinstance(p.get("face_b"), dict) else None)
        if fa:
            cal_face_ids.add(fa)
        if fb:
            cal_face_ids.add(fb)

    eval_face_ids = set()
    for p in eval_set:
        fa = p.get("face_a_id") or (p.get("face_a", {}).get("face_id") if isinstance(p.get("face_a"), dict) else None)
        fb = p.get("face_b_id") or (p.get("face_b", {}).get("face_id") if isinstance(p.get("face_b"), dict) else None)
        if fa:
            eval_face_ids.add(fa)
        if fb:
            eval_face_ids.add(fb)

    shared_face_ids = sorted(list(cal_face_ids.intersection(eval_face_ids)))
    shared_face_ids_count = len(shared_face_ids)

    # 实际优化目标
    optimization_objective = (
        "以校准集 Balanced Accuracy = (TPR + TNR)/2 为主优化目标，F1 为辅；"
        "遇 Tie 时选取更保守的较高阈值。评估集绝不参与候选生成与阈值选择。"
    )

    # 基于 cal_set 的真实分数值动态生成候选阈值点 (相邻中点及端点，评估集绝不参与)
    cal_sims = sorted(list(set([p["sim"] for p in cal_set])))
    cand_thresholds = [0.0] + cal_sims + [1.0]
    for i in range(len(cal_sims) - 1):
        cand_thresholds.append(round((cal_sims[i] + cal_sims[i+1]) / 2.0, 4))
    cand_thresholds = sorted(list(set(cand_thresholds)))

    best_thresh = 0.50
    best_bal_acc = -1.0
    best_f1 = -1.0

    for t in cand_thresholds:
        tp = sum(1 for p in cal_set if p["sim"] >= t and p["label"] == "same")
        fp = sum(1 for p in cal_set if p["sim"] >= t and p["label"] == "different")
        fn = sum(1 for p in cal_set if p["sim"] < t and p["label"] == "same")
        tn = sum(1 for p in cal_set if p["sim"] < t and p["label"] == "different")

        tpr = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        tnr = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        bal_acc = (tpr + tnr) / 2.0

        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tpr
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

        # 主指标 Balanced Accuracy，辅指标 F1；平局选更保守的高阈值
        if bal_acc > best_bal_acc:
            best_bal_acc = bal_acc
            best_f1 = f1
            best_thresh = t
        elif abs(bal_acc - best_bal_acc) < 1e-4:
            if f1 > best_f1:
                best_f1 = f1
                best_thresh = t
            elif abs(f1 - best_f1) < 1e-4 and t > best_thresh:
                best_thresh = t

    # 计算校准集与评估集各自的混淆矩阵与综合指标
    cal_metrics = _compute_metrics(cal_set, best_thresh)
    eval_metrics = _compute_metrics(eval_set, best_thresh)

    disclaimer = (
        f"注意: 划分仅保证 pair-disjoint，而非 person-disjoint；"
        f"cal 与 eval 共享 {shared_face_ids_count} 个 face_id (shared_face_ids: {shared_face_ids})，"
        f"不足以证明全 PersonConsistency，仅作为跨镜头成对特征校准与泛化测试参考。"
        f"切勿将小样指标夸大为全集 Gate。"
    )

    report = {
        "status": "calibrated_successfully",
        "provenance": meta.get("provenance", "human_review"),
        "reviewer": meta.get("reviewer", ""),
        "labels_sha256": meta.get("labels_sha256", ""),
        "pairs_sha256": meta.get("pairs_sha256", ""),
        "annotated_count": meta.get("annotated_count", len(pairs)),
        "uncertain_count": meta.get("uncertain_count", 0),
        "unannotated_count": meta.get("unannotated_count", 0),
        "total_pairs_count": meta.get("total_pairs_count", len(pairs)),

        "is_pair_disjoint": True,
        "is_person_disjoint": False,
        "calibration_pair_ids": cal_pair_ids,
        "holdout_pair_ids": eval_pair_ids,
        "shared_face_ids": shared_face_ids,
        "shared_face_ids_count": shared_face_ids_count,

        "chosen_threshold": round(best_thresh, 4),
        "recommended_threshold": round(best_thresh, 4),
        "threshold_candidates": cand_thresholds,
        "optimization_objective": optimization_objective,

        "calibration_metrics": cal_metrics,
        "holdout_metrics": eval_metrics,

        "calibration_confusion": cal_metrics["confusion"],
        "calibration_precision": cal_metrics["precision"],
        "calibration_recall": cal_metrics["recall"],
        "calibration_f1": cal_metrics["f1"],

        "holdout_confusion": eval_metrics["confusion"],
        "holdout_precision": eval_metrics["precision"],
        "holdout_recall": eval_metrics["recall"],
        "holdout_f1": eval_metrics["f1"],

        "calibration_sample_count": len(cal_set),
        "holdout_sample_count": len(eval_set),
        "holdout_balanced_acc": eval_metrics["balanced_accuracy"],
        "holdout_false_positives": eval_metrics["fp_pair_ids"],
        "holdout_false_negatives": eval_metrics["fn_pair_ids"],

        "notes": disclaimer,
        "disclaimer": disclaimer,
    }
    return report

def main():
    setup_lifecycle_guard(55)

    parser = argparse.ArgumentParser(description="X1.1 人脸阈值校准与泛化测试独立工具 (<=55s)")
    parser.add_argument("--labels-file", type=str, required=True, help="导出的人工审核标注 JSON 文件路径")
    parser.add_argument("--pairs-file", type=str, default="benchmarks/x1/predictions/x1_1/face_pairs_anonymous.json", help="Pairs 元数据")
    parser.add_argument("--out-report", type=str, default="benchmarks/x1/reports/x1_1/calibration_report.json", help="报告路径")
    args = parser.parse_args()

    print("=== [Face Calibration] 正在执行人工真值校准流程 ===")
    annotated = load_and_verify_human_labels(args.labels_file, args.pairs_file)
    print(f"成功加载有效双类别真人标注: {len(annotated)} 条 (Reviewer: {annotated.meta.get('reviewer')})")

    report = calibrate_and_evaluate(annotated, metadata=annotated.meta)
    os.makedirs(os.path.dirname(args.out_report), exist_ok=True)
    with open(args.out_report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"校准完成！选定阈值: {report['chosen_threshold']} | 报告落盘至: {args.out_report}")

if __name__ == "__main__":
    main()
