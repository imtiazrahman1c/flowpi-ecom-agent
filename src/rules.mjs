// Offline sandbox planner. This is deterministic test logic, not an AI model.
export function rulesPlanner(catalog) {
  return async (text) => {
    const lower = text.toLowerCase();
    if (/human|refund|complaint|মানুষ|অভিযোগ|ফেরত|support agent/i.test(text))
      return { intent: "human", query: "" };
    if (/ignore.*instruction|mark.*paid|পেইড করে/i.test(text))
      return { intent: "human", query: "" };
    if (/tracking|track my|কোথায়.*অর্ডার/i.test(text))
      return { intent: "tracking", query: "" };
    const candidates = catalog
      .flatMap((p) =>
        [p.sku, p.name, ...(p.aliases ?? [])].map((a) => ({
          alias: a,
          product: p,
        })),
      )
      .filter((x) => lower.includes(x.alias.toLowerCase()))
      .sort((a, b) => b.alias.length - a.alias.length);
    if (candidates.length)
      return { intent: "product", query: candidates[0].product.sku };
    if (/delivery|ডেলিভারি|cod/i.test(text))
      return { intent: "faq", query: "delivery" };
    return { intent: "clarify", query: "" };
  };
}
