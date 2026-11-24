import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { spore } from "../../utopy/spore";

type NumFieldProps = { label: string; value: number; onChange: (v:number)=>void; step?: number; };
const NumField = ({label, value, onChange, step=0.1}: NumFieldProps) => {
  const [txt, setTxt] = useState(String(value));
  return (
    <View style={s.row}>
      <Text style={s.lab}>{label}</Text>
      <TextInput
        style={s.in}
        keyboardType="numeric"
        value={txt}
        onChangeText={setTxt}
        onBlur={()=> {
          const v = Number(txt);
          if (!Number.isNaN(v)) onChange(v);
          else setTxt(String(value));
        }}
      />
      <Pressable style={s.bump} onPress={()=>onChange(Number((value+step).toFixed(3))) }><Text>＋</Text></Pressable>
      <Pressable style={s.bump} onPress={()=>onChange(Number((value-step).toFixed(3))) }><Text>－</Text></Pressable>
    </View>
  );
};

export default function InspectorPanel({ node }:{ node:any }) {
  if (!node) return null;
  const setP = (k:string, v:any)=>
    spore.sayIntent({ sym:"⚡", say:"set-param", ns:"energy:modeler", with:{ nodeId: node.id, key:k, value:v } });

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Editar</Text>
      <Text style={s.sub}>{node.name} · {node.kind}</Text>

      {node.kind === "floor" && (
        <>
          <NumField label="Ancho (w, m)" value={Number(node.params?.w??6)} onChange={(v)=>setP("w", v)} step={0.1}/>
          <NumField label="Largo (d, m)" value={Number(node.params?.d??4)} onChange={(v)=>setP("d", v)} step={0.1}/>
        </>
      )}

      {node.kind === "roof.gable" && (
        <>
          <NumField label="Ancho (w, m)" value={Number(node.params?.w??6)} onChange={(v)=>setP("w", v)} step={0.1}/>
          <NumField label="Largo (d, m)" value={Number(node.params?.d??4)} onChange={(v)=>setP("d", v)} step={0.1}/>
          <NumField label="Inclinación (tilt °)" value={Number(node.params?.tilt??22.5)} onChange={(v)=>setP("tilt", v)} step={1}/>
        </>
      )}

      {node.kind === "wall" && (
        <>
          <NumField label="Largo (m)" value={Number(node.params?.len??3)} onChange={(v)=>setP("len", v)} step={0.1}/>
          <NumField label="Altura (m)" value={Number(node.params?.h??2.4)} onChange={(v)=>setP("h", v)} step={0.1}/>
          <NumField label="Rotación (°)" value={Number(node.params?.rot??0)} onChange={(v)=>setP("rot", v)} step={1}/>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{ width:280, backgroundColor:"#fff", borderLeftWidth:1, borderLeftColor:"#e5e7eb", padding:12 },
  title:{ fontWeight:"800", color:"#111827", fontSize:16 },
  sub:{ color:"#64748b", marginBottom:8 },
  row:{ flexDirection:"row", alignItems:"center", gap:8, marginBottom:8 },
  lab:{ width:130, color:"#111827" },
  in:{ flex:1, borderWidth:1, borderColor:"#e5e7eb", borderRadius:8, paddingHorizontal:8, height:36, color:"#111827" },
  bump:{ width:32, height:32, borderWidth:1, borderColor:"#e5e7eb", borderRadius:8, alignItems:"center", justifyContent:"center" },
});
