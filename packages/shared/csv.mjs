// RFC4180-style quoted fields. Reject malformed input instead of partially importing it.
export function parseCatalogCSV(text) {
  if (typeof text !== "string" || text.length > 60000)
    throw Error("CSV exceeds 60 KB");
  const rows = [];
  let row = [],
    field = "",
    quoted = false,
    closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else if (c === undefined) throw Error("Unclosed CSV quote");
      else field += c;
      continue;
    }
    if (c === '"') {
      if (field || closed) throw Error("Unexpected quote");
      quoted = true;
      continue;
    }
    if (c === "," || c === "\n" || c === "\r" || c === undefined) {
      row.push(field);
      field = "";
      closed = false;
      if (c !== ",") {
        if (row.some((x) => x.trim())) rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
      continue;
    }
    if (closed) throw Error("Unexpected text after quote");
    field += c;
  }
  const headers = rows.shift();
  if (headers?.join(",") !== "sku,name,label,price_bdt,stock")
    throw Error("Use headers: sku,name,label,price_bdt,stock");
  if (!rows.length || rows.length > 200) throw Error("Import 1–200 rows");
  return rows.map((r) => {
    if (
      r.length !== 5 ||
      !/^\d+(\.\d{1,2})?$/.test(r[3]) ||
      !/^\d+$/.test(r[4])
    )
      throw Error("Invalid catalog row");
    const [whole, decimal = ""] = r[3].split(".");
    return {
      sku: r[0].trim(),
      name: r[1].trim(),
      label: r[2].trim(),
      price_minor: Number(whole) * 100 + Number(decimal.padEnd(2, "0")),
      stock: Number(r[4]),
    };
  });
}
