/** Optional input adapter. Speech returns intent text; it never calls an actuator. */
export type SpeechIntentAdapter = {
  id: string;
  listen: () => Promise<{text: string; confidence?: number; source: string}>;
};
let speechAdapter: SpeechIntentAdapter | null = null;
export function setPhysicalSpeechAdapter(adapter: SpeechIntentAdapter | null) {
  speechAdapter = adapter;
}
export function getPhysicalSpeechAdapter() {
  return speechAdapter;
}
