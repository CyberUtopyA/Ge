import { PX_PER_M, Secretion, Signal, Tissue, TissueCtx, UScene } from "./genome";

export class LivingModeler {
  private scene: UScene | null = null;
  private tissues = new Map<string, Tissue>();
  private inbox: Signal[] = [];
  private outbox: Secretion[] = [];
  readonly genome = { pxPerM: PX_PER_M };

  constructor(scene?: UScene) { if (scene) this.scene = scene; }
  grow(scene: UScene) { this.scene = scene; }
  readScene() { return this.scene; }

  async graft(t: Tissue) { this.tissues.set(t.name, t); if (t.onGraft) await t.onGraft(this.ctx()); }
  async ungraft(name: string) { const t=this.tissues.get(name); if(!t) return; if(t.onUngraft) await t.onUngraft(this.ctx()); this.tissues.delete(name); }

  receive(s: Signal) { this.inbox.push(s); }
  secrete(sec: Secretion) { this.outbox.push(sec); }
  harvest(): Secretion[] { const out=[...this.outbox]; this.outbox.length=0; return out; }

  async metabolize() {
    while (this.inbox.length) {
      const s = this.inbox.shift()!;
      for (const t of this.tissues.values()) {
        const r = t.receptors.find(r => r.when(s));
        if (r) await r.react(this.ctx(s));
      }
    }
  }

  private ctx(_s?: Signal): TissueCtx {
    return {
      readScene: () => this.scene,
      mutateScene: (mut) => { if (this.scene) mut(this.scene); },
      secrete: (sec) => this.secrete(sec),
      genome: this.genome,
    };
  }
}

export const Sig = {
  addNode: (sceneId: string, node: any): Signal => ({ ns:"modeler", type:"model.node.add", payload:{ sceneId, node } }),
  updateNode: (sceneId: string, id: string, patch: any): Signal => ({ ns:"modeler", type:"model.node.update", payload:{ sceneId, id, patch } }),
  removeNode: (sceneId: string, id: string): Signal => ({ ns:"modeler", type:"model.node.remove", payload:{ sceneId, id } }),
  addEdge: (sceneId: string, edge: any): Signal => ({ ns:"modeler", type:"model.edge.add", payload:{ sceneId, edge } }),
  splitEdge: (sceneId: string, edgeId: string, newNode: any): Signal => ({ ns:"modeler", type:"model.edge.split", payload:{ sceneId, edgeId, newNode } }),
  export: (format:"stl"|"step"|"ifc"): Signal => ({ ns:"modeler", type:"export", payload:{ format } }),
  toolpath: (): Signal => ({ ns:"modeler", type:"toolpath", payload:{ mode:"cnc" } }),
  plan: (): Signal => ({ ns:"modeler", type:"plan", payload:{ kind:"mason" } }),
  simulate: (domain:"energy"|"struct"): Signal => ({ ns:"modeler", type:"simulate", payload:{ domain } }),
};
