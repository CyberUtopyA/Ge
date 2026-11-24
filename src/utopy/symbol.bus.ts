type Handler = (intent:any, ctx:any) => void | Promise<void>;
const table = new Map<string, Handler[]>();

function key(sym:string, say:string) { return `${sym}::${say}`; }

export function hear(sym:string, say:string, fn: Handler) {
  const k = key(sym,say);
  if (!table.has(k)) table.set(k, []);
  table.get(k)!.push(fn);
}

export async function dispatch(i:any, ctx:any) {
  const k = key(i.sym, i.say);
  const hs = table.get(k) || [];
  for (const h of hs) await h(i, ctx);
  const stars = table.get("*::*") || [];
  for (const h of stars) await h(i, ctx);
}