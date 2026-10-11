# 本地节目资产登记（2026-10-11）

## 红楼梦

- 来源：https://www.youtube.com/watch?v=w5TKbKBiZKc
- 上传频道：China Zone 剧乐部
- 来源标题：87版《红楼梦》第28集 开夜宴异兆发悲音
- 版本/集数：1987版，第28集；以上由下载元数据识别。
- 元数据时长：2999秒（49分59秒）。
- 下载目标：父项目 `source-media/hongloumeng/w5TKbKBiZKc.mp4`；720p AVC + AAC。
- 当前状态：**视频下载完成。** 本地ffprobe读取到1280×720、25fps、H.264视频及AAC音轨，实际时长2999.414422秒，文件493420140字节（约470.6MiB）。已抽取130秒处画面并查看，片尾2989–2997秒音视频解码无报错；未进行全片逐帧内容验收。
- SHA-256：`aded1aceaf2ad34ca94d551030aadc8f030ccb48e509291f10728fa133c44c3e`。
- 本地视频：`/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/source-media/hongloumeng/w5TKbKBiZKc.mp4`。
- 已下载中文字幕：父项目 `source-media/hongloumeng/w5TKbKBiZKc.zh-CN.vtt`（603条，覆盖00:00:26.280–00:49:58.080）；另有繁体字幕。
- 可用于模型输入的带时间文本：父项目 `source-media/hongloumeng/w5TKbKBiZKc.zh-CN.transcript.txt`。这份文本由源字幕提取，未逐条对照原片审核；可作为未审核节目事实资料，必须保留来源及状态。
- 该集只使用本集字幕，不能让模型凭全书知识填补画面或剧情。
- 视频、字幕、原始元数据均保存在本地忽略目录，不走 Git。

## 潜伏

- 用户提供原片：`/Users/yoyotaozhou/Desktop/qianfu_ep18.mp4`。
- 2026-10-11 独立核验：文件209667467字节，1280×720，H.264 + AAC，2702.013243秒（45分02秒）；ffprobe成功。
- SHA-256：`7987a13f4df2403d0eb3927a9c1f6b170821077e171afc72df4c95d935f17c9c`。
- 35分20秒抽帧可见翠平及“念过书 有文化 很进步”，与既有OCR第656条（2120–2122秒）对应。确认它与本次使用的单集资料相匹配；未进行全片逐帧或857条OCR逐条画面对照验收。
- 通过实际本地API登记，资产 `asset-qianfu-18` 版本2，`video_status=ready`，元数据读取确认；来源URL未知，保留null。
- 本轮模型使用既有857条完整OCR，事实资料仍待校对，不因视频登记自动升级为已审核事实。
- 原片位于桌面，不走Git。登记读回与抽帧证据保存在 `.local-data/evidence/`。

## 交接的原片定位

5份已审核交接包保留生成当时的不可变 `input_snapshot`，不通过覆盖历史快照伪造模型看过新路径。下一阶段应以包内asset_id关联当前资产登记；本地 `.local-data/exports/media-manifest.json` 包含两份已核验原片的路径、当前资产版本、元数据和SHA-256，可与5份 `*-handoff-latest.json` 一并交接。此登记只证明原片可用，不证明素材需求已命中。
