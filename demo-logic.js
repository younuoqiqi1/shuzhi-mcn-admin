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

  return { buildBloggerMetrics, prepareTopicBatch, reviewDraft };
});
