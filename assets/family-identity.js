(function (root) {
  "use strict";
  const children = {
    "ZHI-G1-D01-LUNA": Object.freeze({ name: "LUNA", symbol: "🌙", cls: "luna", role: "探索 · 自然 · 空间观察" }),
    "ZHI-G1-D02-ARIA": Object.freeze({ name: "ARIA", symbol: "🎨", cls: "aria", role: "艺术 · 创造 · 设计" }),
    "ZHI-G1-D03-ELYA": Object.freeze({ name: "ELYA", symbol: "🌸", cls: "elya", role: "情感 · 理解 · 关系" }),
    "ZHI-G1-S01-KAEL": Object.freeze({ name: "KAEL", symbol: "🧭", cls: "kael", role: "逻辑 · 研究 · 证据" }),
    "ZHI-G1-S02-NOAH": Object.freeze({ name: "NOAH", symbol: "🌿", cls: "noah", role: "行动 · 导航 · 实践" })
  };
  const parents = Object.freeze({
    mia: Object.freeze({ name: "Mia", role: "MOTHER", identity: "MIA_PROTOTYPE" }),
    ken: Object.freeze({ name: "Ken", role: "FATHER", identity: "KEN_CREATOR" })
  });
  const labels = Object.freeze(Object.fromEntries(Object.entries(children).map(([id, child]) => [id, child.name])));
  root.ZHI_FAMILY_IDENTITY = Object.freeze({
    version: "1.0.0",
    parents,
    children: Object.freeze(children),
    labels,
    nameOf(id, fallback) {
      if (id === parents.mia.identity || id === "Mia") return parents.mia.name;
      if (id === parents.ken.identity || id === "Ken") return parents.ken.name;
      return children[id]?.name || fallback || id || "未知成员";
    }
  });
})(window);
