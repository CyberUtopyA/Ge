// src/goodenergy/core/mmkv.ts
export type KV = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
};

let geStorage: KV;

try {
  // require evita que TS intente tratar MMKV como type-only
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("react-native-mmkv");
  const MMKV = (mod?.MMKV ?? mod?.default?.MMKV ?? mod?.default) as any;

  geStorage = new MMKV({ id: "ge-mmkv" });
} catch {
  // fallback (web/test)
  geStorage = {
    getString: () => undefined,
    set: () => {},
    delete: () => {},
  };
}

export { geStorage };