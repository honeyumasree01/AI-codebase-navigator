/** First leaf file path in nested tree object (dirs are objects, files are null). */
export function firstFilePathInTree(tree, prefix = "") {
  if (!tree || typeof tree !== "object") return null;
  const keys = Object.keys(tree).sort();
  for (const key of keys) {
    const full = prefix ? `${prefix}/${key}` : key;
    const v = tree[key];
    if (v === null || v === undefined) return full;
    if (typeof v === "object") {
      const inner = firstFilePathInTree(v, full);
      if (inner) return inner;
    }
  }
  return null;
}
