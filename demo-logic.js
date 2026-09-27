(function exposeDemoLogic(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DemoLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createDemoLogic() {
  "use strict";

  function buildBloggerMetrics({ assets = [], items = [], isManualNew = false }) {
    const keys = new Set(assets.flatMap((asset) => (asset.highlights || []).map((highlight) => `${asset.id}:${highlight.id}`)));
    const used = new Set();
    const outside = new Set();
    for (const item of items) {
      const key = `${item.assetId}:${item.highlightId}`;
      if (!keys.has(key) || used.has(key)) outside.add(item.id || key);
      used.add(key);
    }
    const usedAvailable = [...used].filter((key) => keys.has(key)).length;
    const seed = Math.max(1, assets.length);
    const isEmptyNewCreator = isManualNew && items.length === 0;
    const generated = isEmptyNewCreator ? 0 : items.length || seed * 4 + 2;
    return {
      programs: assets.length,
      availableHighlights: Math.max(0, keys.size - usedAvailable),
      generated,
      approved: isEmptyNewCreator ? 0 : items.length ? items.filter((item) => item.status === "approved").length : Math.max(1, generated - 2),
      pending: isEmptyNewCreator ? 0 : items.length ? items.filter((item) => item.status === "pending").length : 2,
      followers: isEmptyNewCreator ? null : seed * 12860 + 3860,
      views: isEmptyNewCreator ? null : seed * 186400 + 52800,
      likes: isEmptyNewCreator ? null : seed * 9600 + 2800,
      outsideCurrentPool: outside.size,
    };
  }

  function prepareTopicBatch(selectedTopics = []) {
    const topics = selectedTopics.map((topic) => ({
      ...topic,
      duration: Math.min(300, Math.max(90, Number(topic.duration) || 120)),
      relatedIds: [...new Set(topic.relatedIds || [])],
    }));
    return { count: topics.length, ratio: "16:9", selectedTopics: topics };
  }

  function reviewDraft(drafts = [], id, approved = true) {
    const next = drafts.map((draft) => draft.id === id ? { ...draft, approved } : draft);
    return { drafts: next, allApproved: next.length > 0 && next.every((draft) => draft.approved) };
  }

  function remapTopicBatchForPool(settings = {}, poolIds = []) {
    const allowed = new Set(poolIds);
    const fallback = poolIds.slice(0, 3);
    const selectedTopics = (settings.selectedTopics || []).map((topic) => {
      const retained = (topic.relatedIds || []).filter((id) => allowed.has(id));
      return { ...topic, relatedIds: retained.length ? retained : [...fallback] };
    });
    return { ...settings, count: selectedTopics.length, selectedTopics };
  }

  function assignUniqueClips(selectedTopics = [], clips = []) {
    const rows = selectedTopics.map((topic, index) => ({
      index,
      candidates: clips.map((clip, clipIndex) => ({ clip, clipIndex })).filter(({ clip }) => {
        const assetId = clip.assetId || clip.asset?.id;
        return (topic.relatedIds || []).includes(assetId);
      }),
    })).sort((a, b) => a.candidates.length - b.candidates.length || a.index - b.index);
    const assigned = new Array(selectedTopics.length);
    const used = new Set();
    function visit(position) {
      if (position >= rows.length) return true;
      const row = rows[position];
      for (const candidate of row.candidates) {
        if (used.has(candidate.clipIndex)) continue;
        used.add(candidate.clipIndex);
        assigned[row.index] = candidate.clip;
        if (visit(position + 1)) return true;
        used.delete(candidate.clipIndex);
        assigned[row.index] = undefined;
      }
      return false;
    }
    return visit(0) ? assigned : null;
  }

  function buildProductionMonitorSummary({ workspace = {}, bulkProduction = null, now = Date.now(), durationMs = 7500 } = {}) {
    const job = workspace.job;
    const drafts = job?.drafts || workspace.topicDrafts || [];
    const progress = job?.startedAt ? Math.min(99, Math.max(0, Math.floor((now - job.startedAt) / durationMs * 100))) : 0;
    const waiting = (workspace.topicDrafts || []).filter((draft) => !draft.approved).map((draft) => ({ id: draft.id, title: draft.title, status: "待生产 · 脚本待审核" }));
    if (bulkProduction) {
      const index = bulkProduction.bloggerIds?.indexOf(workspace.blogger?.id) ?? -1;
      if (index >= bulkProduction.nextIndex && index >= 0) {
        for (const [topicIndex, topic] of (bulkProduction.settings?.selectedTopics || []).entries()) waiting.push({ id: `queue-${index}-${topicIndex}`, title: topic.title, status: "排队待生产" });
      }
    }
    const producing = ["video", "batch"].includes(job?.kind) ? drafts.map((draft) => ({ id: draft.id, title: draft.title, progress, status: "生产中" })) : [];
    return { waiting, producing, waitingCount: waiting.length, producingCount: producing.length };
  }

  function mergeBulkProductionRoster(run, selectedIds = [], max = 5) {
    if (!run) return run;
    const startedIds = (run.bloggerIds || []).slice(0, Math.max(0, run.nextIndex || 0));
    const bloggerIds = [...new Set([...startedIds, ...selectedIds])].slice(0, max);
    return { ...run, bloggerIds, total: bloggerIds.length };
  }

  function collectCreatorContent(workspaces = [], blogger = null, items = []) {
    const saved = workspaces.flatMap((workspace) => (workspace.items || []).map((item) => ({ ...item, libraryOwnerId: workspace.blogger?.id || item.bloggerId || "" })));
    const active = items.map((item) => ({ ...item, libraryOwnerId: blogger?.id || item.bloggerId || "" }));
    return [...saved, ...active];
  }

  function listApprovedContentItems(items = []) {
    const timestamp = (value) => Number(value) || Date.parse(value) || 0;
    return items.filter((item) => item.status === "approved").sort((a, b) => timestamp(b.approvedAt) - timestamp(a.approvedAt));
  }

  function setContentOnline(items = [], id, online) {
    return items.map((item) => item.id === id ? { ...item, online: Boolean(online) } : item);
  }

  return { buildBloggerMetrics, prepareTopicBatch, reviewDraft, remapTopicBatchForPool, assignUniqueClips, buildProductionMonitorSummary, mergeBulkProductionRoster, collectCreatorContent, listApprovedContentItems, setContentOnline };
});
