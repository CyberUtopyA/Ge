type RendererFn = (blocks: any[] | null) => void;

class PortalRegistry {
  private renderers = new Map<string, RendererFn>();

  register(ns: string, fn: RendererFn) {
    this.renderers.set(ns, fn);
  }
  unregister(ns: string) {
    this.renderers.delete(ns);
  }
  has(ns: string) {
    return this.renderers.has(ns);
  }
  mount(blocks: any[] | null, ns: string = "default") {
    const r = this.renderers.get(ns);
    if (r) r(blocks || []);
    else console.log("[UPortal] no renderer for ns:", ns, "blocks:", blocks);
  }
}

export const UPortal = new PortalRegistry();

