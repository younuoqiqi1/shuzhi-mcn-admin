# Human Anchor 标注规范（通用版）

## 目的与边界

Human Anchor 用于一次性 POC / 系统能力校准，不参与任何单集素材 Ingest，也不是日常生产步骤。当前只使用已存在的 X1.2 Blind Shots 做 Development Calibration，不增加样本。

标注员直接看原始片段和原始帧，需要对白时听原声。先独立完成并锁定标注；不得查看任何模型预测、Evidence、AI Judge 或 Codex Review。不得推断剧情、真实人物身份、关系、动机、情绪或叙事意义。

## 字段

- **镜头边界可用性**：可用 / 不可用 / 不确定。
- **可见人物数量**：填写能直接确认的人数；遮挡等原因无法确认时标 unknown。
- **匿名人物对应关系**：使用 P01、P02 等匿名 ID，仅按可见特征描述。只有直接观察足以确认同一人时才跨 Shot 复用 ID，否则写 unknown。禁止姓名、剧情身份或关系。
- **场景/环境**：仅描述可见空间、布局、光照等。
- **直接可观察动作**：只写画面中正在发生的动作，不解释原因。
- **关键可见物体**：列出直接可见且与画面相关的物体。
- **对白及 speaker**：逐字记录可听清对白；明确区分无可辨对白与无法判断。speaker 只关联匿名 P ID；不确定时 unknown。speaker_confidence 选高/中/低/unknown。
- **Unknown / 无法确定**：列出不确定字段和直接观察到的原因（遮挡、模糊、过暗、音频不清等）。

空白不表示“没有”。请给每个必填项明确标签或 unknown；不得为了填满字段猜测。

## 隔离与隐私

页面不保存本地记录、不联网。导出时以标注员自设口令通过 PBKDF2-SHA256 + AES-256-GCM 加密，页面仅下载密文；口令不写入文件、不进入 Git。密文放在本仓库外。答案明文不得复制、截图或传入 Agent 可读目录。答案 SHA256 commitment 在标注结束后、Judge 读取前由标注员本地生成并登记；本仓库不保存答案。

页面：`/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/human-anchor-calibration/annotation.html`。它依赖本机 `/private/tmp/x1_2` 下的既有原始素材。
