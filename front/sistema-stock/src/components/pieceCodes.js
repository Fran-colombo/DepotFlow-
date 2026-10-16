import { useEffect, useState } from "react";
import { getNextCodes } from "../api/items";

const PREFIX_PATTERN = /^[A-Z](?:[A-Z0-9]|-(?=[A-Z0-9])){0,11}$/;

export function cleanPrefix(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function prefixProblem(raw) {
  const prefix = cleanPrefix(raw);
  if (!prefix) return "Escribí el tipo, por ejemplo AM-B";
  if (/-\d{2}-\d+$/.test(prefix)) {
    return "Escribí solo el tipo, por ejemplo AM-B. El año y el número se ponen solos";
  }
  if (!PREFIX_PATTERN.test(prefix)) return "Letras, números y guiones, por ejemplo AM-B";
  return "";
}

export function useCodePreview(prefixes, revision = 0) {
  const key = prefixes.map(cleanPrefix).join("|");
  const size = prefixes.length;
  const [codes, setCodes] = useState([]);

  useEffect(() => {
    const list = size ? key.split("|") : [];
    const counts = {};
    list.forEach((prefix) => {
      if (!prefixProblem(prefix)) counts[prefix] = (counts[prefix] || 0) + 1;
    });
    if (!Object.keys(counts).length) {
      setCodes(list.map(() => ""));
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const pools = {};
        await Promise.all(
          Object.entries(counts).map(async ([prefix, count]) => {
            const data = await getNextCodes(count, prefix);
            pools[prefix] = [...(data.codes || [])];
          })
        );
        if (!cancelled) setCodes(list.map((prefix) => pools[prefix]?.shift() || ""));
      } catch {
        if (!cancelled) setCodes(list.map(() => ""));
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, size, revision]);

  return codes;
}
