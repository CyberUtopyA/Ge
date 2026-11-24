export class MemoriaResonancia {
  data: any[] = [];

  recordar(evento:any) {
    this.data.push({ ts:Date.now(), ...evento });
    if(this.data.length > 500) this.data.shift();
  }

  buscarPorSimbolo(sym:string) {
    return this.data.filter(e=>e.sym===sym);
  }

  fusionar(otra:MemoriaResonancia) {
    this.data.push(...otra.data);
  }
}

export const memoriaGlobal = new MemoriaResonancia();
