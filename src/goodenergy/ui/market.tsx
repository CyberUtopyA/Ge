// ==============================
// File: src/goodenergy/ui/market.tsx
// GoodEnergy — Mercado P2P (Comprar / Vender)
// ✅ FIXES (2026-01):
// - Normaliza ns (trim) SIEMPRE (evita "public " con espacio)
// - Soporta DV en dos formatos:
//    A) dv.upsert → with.dv directo
//    B) dv.upsert → dv.attrs.offer (como en tus logs: ge:market_signal + energy.offer)
// - Publica DV de oferta con schema consistente (amount_kwh / price_per_kwh / location.lat,lng)
// - Dedup + merge de ofertas por id
// - Query de ofertas por intent + escucha DV stream para que aparezcan aunque no haya offers.result
// ==============================

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from "./mapadapter";
import Geolocation from "react-native-geolocation-service";
import { spore, sporeMT } from "../../utopy/spore";
import { ensureLocationPermission } from "../../utils/geo";
import type { PhysicalAvailability, PhysicalProject } from "../physical.model";
import { availabilityIssues } from "../physical.system";
import { getPhysicalAvailabilityAuthorityProvider, verifyPhysicalAvailabilityAuthority } from "../physical.capabilities";

// -------- Tipos --------
type LatLng = { latitude: number; longitude: number };
type OfferPin = { id: string; lat: number; lng: number; price: number; amount_kwh: number; seller?: string; ts?: number };

type BaseProps = {
  ns: string;
  onEmit: (sym: string, say: string, withData?: any) => Promise<void>;
  onClose: () => void;
  telemetry?: { pv_kw?: number; load_kw?: number; soc?: number; price_buy?: number; price_sell?: number };
  physicalAvailability?: PhysicalAvailability | null;
  physicalProject?: PhysicalProject;
};

const normNs = (x: any) => String(x ?? "").trim() ;
const now = () => Date.now();

// --- traits helpers ---
function hasOfferTraits(dv: any) {
  const t = Array.isArray(dv?.traits) ? dv.traits.map(String) : [];
  return t.includes("mt:market.offer") || t.includes("mt:energy.offer") || t.includes("ge:market.offer") || t.includes("mt:offer");
}

// Extrae oferta desde DV en formato directo o signal
function extractOfferFromDV(dv: any): any | null {
  if (!dv) return null;

  // A) DV directo: attrs.amount_kwh / price_per_kwh / location
  const a = dv?.attrs || {};
  if (a?.amount_kwh && a?.price_per_kwh && a?.location?.lat && a?.location?.lng) return a;

  // B) DV signal: attrs.offer (como en tus logs)
  if (a?.offer?.amount_kwh && a?.offer?.price_per_kwh && a?.offer?.location?.lat && a?.offer?.location?.lng) {
    return a.offer;
  }

  // C) variaciones legacy (por si llega algo viejo)
  if (a?.cantidad && a?.precio && a?.location?.lat && a?.location?.lng) {
    return { amount_kwh: a.cantidad, price_per_kwh: a.precio, location: a.location, seller: a.seller, ts: a.ts, visibility: a.visibility };
  }

  return null;
}

function dvToOfferPin(dv: any): OfferPin | null {
  const offer = extractOfferFromDV(dv);
  if (!offer) return null;

  const lat = Number(offer?.location?.lat);
  const lng = Number(offer?.location?.lng);
  if (!lat || !lng) return null;

  const price = Number(offer?.price_per_kwh ?? offer?.price ?? 0);
  const amount = Number(offer?.amount_kwh ?? offer?.kwh ?? 0);
  if (!price || !amount) return null;

  const id =
    String(dv?.id) ||
    String(offer?.id) ||
    `offer:${lat}:${lng}:${price}:${amount}:${offer?.seller || "?"}:${offer?.ts || 0}`;

  return { id, lat, lng, price, amount_kwh: amount, seller: offer?.seller, ts: offer?.ts };
}

// ====== helpers ======
function haversineKm(a: LatLng, b: LatLng) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const fmt = (n: number, d = 3) => Number(n).toFixed(d);

// ====== UI BASICS ======
function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={s.header}>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      <TouchableOpacity onPress={onClose} style={s.hBtn}>
        <Text style={s.hBtnTxt}>Cerrar ✕</Text>
      </TouchableOpacity>
    </View>
  );
}
function Row({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>
        {value}
        {unit ? ` ${unit}` : ""}
      </Text>
    </View>
  );
}
function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  stepSize = 1,
  suffix = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  stepSize?: number;
  suffix?: string;
}) {
  return (
    <View style={s.stepper}>
      <TouchableOpacity style={s.stpBtn} onPress={() => onChange(Math.max(min, Number((value - stepSize).toFixed(3))))}>
        <Text style={s.stpTxt}>–</Text>
      </TouchableOpacity>
      <Text style={s.stpVal}>
        {value.toFixed(2)} {suffix}
      </Text>
      <TouchableOpacity style={s.stpBtn} onPress={() => onChange(Math.min(max, Number((value + stepSize).toFixed(3))))}>
        <Text style={s.stpTxt}>+</Text>
      </TouchableOpacity>
    </View>
  );
}
function MoneyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={s.money}>
      <TouchableOpacity style={s.stpBtnSmall} onPress={() => onChange(Math.max(0, Number((value - 0.005).toFixed(3))))}>
        <Text style={s.stpTxt}>–</Text>
      </TouchableOpacity>
      <Text style={s.moneyVal}>$ {value.toFixed(3)} / kWh</Text>
      <TouchableOpacity style={s.stpBtnSmall} onPress={() => onChange(Number((value + 0.005).toFixed(3)))}>
        <Text style={s.stpTxt}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ====== MAPA COMPARTIDO ======
function MapPicker({
  region,
  setRegion,
  radiusKm,
  setRadiusKm,
  myLoc,
  offers,
  selectableCenter = true,
  sellerPin = null,
}: {
  region: LatLng | null;
  setRegion: (c: LatLng) => void;
  radiusKm: number;
  setRadiusKm: (r: number) => void;
  myLoc: LatLng | null;
  offers: OfferPin[];
  selectableCenter?: boolean;
  sellerPin?: LatLng | null;
}) {
  const radiusMeters = Math.max(0.2, radiusKm) * 1000;

  return (
    <View style={s.mapWrap}>
      <MapView
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        initialRegion={
          region
            ? { latitude: region.latitude, longitude: region.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
            : { latitude: -34.6037, longitude: -58.3816, latitudeDelta: 0.2, longitudeDelta: 0.2 }
        }
        onRegionChangeComplete={(r) => {
          if (!selectableCenter) return;
          setRegion({ latitude: r.latitude, longitude: r.longitude });
        }}
      >
        {!!myLoc && <Marker coordinate={myLoc} title="Tú" description="Ubicación actual" />}

        {!!region && (
          <>
            <Circle center={region} radius={radiusMeters} strokeColor="rgba(100,160,255,0.9)" fillColor="rgba(120,170,255,0.15)" />
            {selectableCenter && <Marker coordinate={region} pinColor="#4c8df6" title="Centro de búsqueda" />}
          </>
        )}

        {!!sellerPin && <Marker coordinate={sellerPin} pinColor="#e67e22" title="Ubicación de venta" />}

        {(offers || []).map((o) => (
          <Marker
            key={o.id}
            coordinate={{ latitude: o.lat, longitude: o.lng }}
            pinColor="#1dd1a1"
            title={`Oferta ${o.amount_kwh.toFixed(1)} kWh`}
            description={`$ ${o.price.toFixed(3)} / kWh`}
          />
        ))}
      </MapView>

      <View style={s.mapHud}>
        <Text style={s.mapHudTitle}>Radio: {radiusKm.toFixed(1)} km</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TouchableOpacity style={s.stpBtn} onPress={() => setRadiusKm(Math.max(0.5, radiusKm - 0.5))}>
            <Text style={s.stpTxt}>–</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.stpBtn} onPress={() => setRadiusKm(Math.min(100, radiusKm + 0.5))}>
            <Text style={s.stpTxt}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ==============================
// COMPRAR ENERGÍA
// ==============================
export function BuyEnergyScreen({ ns, onEmit, onClose, telemetry }: BaseProps) {
  const nsClean = normNs(ns);
  const t = telemetry ?? {};
  const deficit_kw = Math.max(0, (t.load_kw ?? 0) - (t.pv_kw ?? 0));
  const suggest_kwh = Math.max(0.1, Math.min(50, deficit_kw * 1)); // 1h aprox

  const [kwh, setKwh] = useState<number>(suggest_kwh || 1);
  const [price, setPrice] = useState<number>(t.price_buy ?? 0.14);
  const [preferLocal, setPreferLocal] = useState(true);
  const [autoQty, setAutoQty] = useState(true);
  const [autoBuy, setAutoBuy] = useState(false);

  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  const [region, setRegion] = useState<LatLng | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [offers, setOffers] = useState<OfferPin[]>([]);
  const [sortBy, setSortBy] = useState<"price" | "distance">("price");

  useEffect(() => {
    if (autoQty) setKwh(Math.max(0.1, suggest_kwh));
  }, [deficit_kw]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      const ok = await ensureLocationPermission();
      if (!ok) {
        console.warn("geo: permiso no concedido");
        return;
      }
      Geolocation.getCurrentPosition(
        (pos) => {
          const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setMyLoc(c);
          setRegion(c);
        },
        (err) => console.warn("geo error", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    })();
  }, []);

  // query por intent (core puede responder market.offers.result)
  useEffect(() => {
    if (!region) return;
    onEmit("⚡", "market.offers.query", {
      near: { lat: region.latitude, lng: region.longitude, radius_km: radiusKm },
      ns: nsClean,
    });
  }, [region?.latitude, region?.longitude, radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // escucha: offers.result + DV stream
 useEffect(() => {
  const handler = (msg: any) => {
    const i = msg?.payload || msg;

    // 1) intents clásicos
    if (i?.sym === "⚡" && i?.say === "market.offers.result") {
      const list = (i?.with?.offers || []) as any[];
      const pins: OfferPin[] = list
        .map((o: any) => ({
          id: String(o.id),
          lat: Number(o.location?.lat ?? 0),
          lng: Number(o.location?.lng ?? 0),
          price: Number(o.price_per_kwh ?? 0),
          amount_kwh: Number(o.amount_kwh ?? 0),
          seller: o.seller,
          ts: o.ts,
        }))
        .filter((p) => p.lat && p.lng && p.price && p.amount_kwh);

      setOffers((prev) => {
        const map = new Map(prev.map((p) => [p.id, p]));
        for (const p of pins) map.set(p.id, p);
        return Array.from(map.values());
      });
      return;
    }

    // 2) DV stream
    if (i?.sym === "🧬" && i?.say === "dv.upsert") {
      const dv = i?.with?.dv;
      if (!dv || !hasOfferTraits(dv)) return;

      const pin = dvToOfferPin(dv);
      if (!pin) return;

      const center = region || myLoc;
      const myId = String(spore.getState?.().id || "");
const isMine = String(pin.seller || "") === myId;

if (!isMine && center) {
  const dist = haversineKm(center, { latitude: pin.lat, longitude: pin.lng });
  if (dist > radiusKm) {
    console.log("[BUY] DV offer fuera de radio", { dist, radiusKm, pin });
    return;
  }
}

      setOffers((prev) => {
        const map = new Map(prev.map((p) => [p.id, p]));
        map.set(pin.id, pin);
        return Array.from(map.values());
      });
    }
  };

  const off1 = spore.on("intent", handler);
  const off2 = sporeMT?.on?.("intent", handler);

  return () => {
    off1?.();
    off2?.();
  };
}, [region?.latitude, region?.longitude, myLoc?.latitude, myLoc?.longitude, radiusKm]);

  const offersWithDist = useMemo(() => {
    const center = region || myLoc;
    return (offers || [])
      .map((o) => {
        const dist = center ? haversineKm(center, { latitude: o.lat, longitude: o.lng }) : NaN;
        return { ...o, dist_km: dist };
      })
      .sort((a, b) => {
        if (sortBy === "price") return a.price - b.price || a.dist_km - b.dist_km;
        return a.dist_km - b.dist_km || a.price - b.price;
      });
  }, [offers, region?.latitude, region?.longitude, myLoc?.latitude, myLoc?.longitude, sortBy]);

  const onPickOffer = (o: { price: number; amount_kwh: number }) => {
    setPrice(Number(o.price.toFixed(3)));
    setKwh(Math.max(0.1, Number(o.amount_kwh.toFixed(2))));
  };

  const canBuy = kwh > 0.01 && price > 0;

  const sendOrder = () => {
    if (!canBuy) return;
    const center = region || myLoc;

    onEmit("⚡", "market.order.create", {
      amount_kwh: kwh,
      max_price_per_kwh: price,
      prefer_local: preferLocal,
      radius_km: preferLocal ? radiusKm : undefined,
      location: preferLocal && center ? { lat: center.latitude, lng: center.longitude, radius_km: radiusKm } : undefined,
      telemetry: { pv_kw: t.pv_kw, load_kw: t.load_kw, soc: t.soc },
      ns: nsClean,
    });

    onEmit("⚡", "render", { blocks: [{ kind: "note", text: "✅ Orden de compra publicada" }] } as any);
    onClose();
  };

  const toggleAutoBuy = () => {
    const next = !autoBuy;
    setAutoBuy(next);
    onEmit("⚡", "policy.auto.buy", {
      enabled: next,
      max_price_per_kwh: price,
      prefer_local: preferLocal,
      radius_km: preferLocal ? radiusKm : undefined,
      ns: nsClean,
    });
  };

  return (
    <View style={s.modal}>
      <View style={{ height: 60 }} />
      <Header title="⚡ Comprar energía" onClose={onClose} />
      <ScrollView contentContainerStyle={s.body}>
        <MapPicker region={region} setRegion={setRegion} radiusKm={radiusKm} setRadiusKm={setRadiusKm} myLoc={myLoc} offers={offers} selectableCenter />

        <View style={s.sortRow}>
          <Text style={s.sortTitle}>Ofertas cercanas</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => setSortBy("price")} style={[s.sortBtn, sortBy === "price" && s.sortOn]}>
              <Text style={s.sortTxt}>Precio</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSortBy("distance")} style={[s.sortBtn, sortBy === "distance" && s.sortOn]}>
              <Text style={s.sortTxt}>Distancia</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.listCard}>
          {offersWithDist.length === 0 ? (
            <Text style={s.empty}>No hay ofertas en el radio seleccionado.</Text>
          ) : (
            offersWithDist.map((o) => {
              const total = o.price * o.amount_kwh;
              return (
                <TouchableOpacity key={o.id} style={s.offerRow} onPress={() => onPickOffer(o)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.offerTitle}>
                      {o.amount_kwh.toFixed(1)} kWh · $ {o.price.toFixed(3)}/kWh
                    </Text>
                    <Text style={s.offerSub}>
                      Total $ {fmt(total, 2)} · {isNaN(o.dist_km) ? "—" : `${o.dist_km.toFixed(1)} km`}
                    </Text>
                  </View>
                  <Text style={s.offerTap}>Usar</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Demanda</Text>
          <Row label="Carga" value={(t.load_kw ?? 0).toFixed(2)} unit="kW" />
          <Row label="PV" value={(t.pv_kw ?? 0).toFixed(2)} unit="kW" />
          <Row label="Déficit aprox." value={deficit_kw.toFixed(2)} unit="kW" />
          <Row label="SOC batería" value={(t.soc ?? 0).toFixed(0)} unit="%" />
        </View>

        <View style={s.cardBig}>
          <Text style={s.cardTitle}>Tu orden</Text>

          <View style={s.switchRow}>
            <TouchableOpacity onPress={() => setAutoQty(!autoQty)} style={[s.switchBtn, autoQty && s.switchOn]}>
              <Text style={s.switchTxt}>{autoQty ? "Qty Auto" : "Qty Manual"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPreferLocal(!preferLocal)} style={[s.switchBtn, preferLocal && s.switchOn]}>
              <Text style={s.switchTxt}>{preferLocal ? "Preferir local" : "Cualquier origen"}</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.fieldLabel}>Cantidad</Text>
          <Stepper value={kwh} onChange={setKwh} min={0.1} max={100} stepSize={0.1} suffix="kWh" />

          <Text style={s.fieldLabel}>Precio máximo</Text>
          <MoneyInput value={price} onChange={setPrice} />

          <TouchableOpacity onPress={toggleAutoBuy} style={[s.secondary]}>
            <Text style={s.secondaryTxt}>{autoBuy ? "Desactivar auto-compra" : "Activar auto-compra"}</Text>
          </TouchableOpacity>

          <TouchableOpacity disabled={!canBuy} onPress={sendOrder} style={[s.primary, !canBuy && s.disabled]}>
            <Text style={s.primaryTxt}>Publicar orden</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ==============================
// VENDER EXCEDENTE
// ==============================
export function SellEnergyScreen({ ns, onEmit, onClose, telemetry, physicalAvailability, physicalProject }: BaseProps) {
  const nsClean = normNs(ns);
  const t = telemetry ?? {};
  const surplus_kw = Math.max(0, (t.pv_kw ?? 0) - (t.load_kw ?? 0));
  const suggest_kwh = physicalAvailability?.unit.toLowerCase() === 'kwh'
    ? physicalAvailability.quantity
    : Math.max(0.1, Math.min(100, surplus_kw * 1)); // 1h aprox

  const [kwh, setKwh] = useState<number>(suggest_kwh || 1);
  const [price, setPrice] = useState<number>(t.price_sell ?? 0.12);
  const [visibleLocal, setVisibleLocal] = useState(true);
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  const [autoSell, setAutoSell] = useState(false);

  useEffect(() => {
    (async () => {
      const ok = await ensureLocationPermission();
      if (!ok) {
        console.warn("geo: permiso no concedido");
        return;
      }
      Geolocation.getCurrentPosition(
        (pos) => setMyLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => console.warn("geo error", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    })();
  }, []);

  const physicalIssues = physicalAvailability && physicalProject
    ? availabilityIssues(physicalProject, physicalAvailability)
    : [];
  const physicalReady = !physicalAvailability || (
    physicalProject && physicalIssues.length === 0 &&
    physicalAvailability.unit.toLowerCase() === 'kwh' &&
    physicalAvailability.availableUntil > Date.now() &&
    kwh <= physicalAvailability.quantity
  );
  const canSell = kwh > 0.01 && price > 0 && !!physicalReady;

  const publishOffer = async () => {
    if (!canSell) return;

    if (physicalAvailability) {
      const authorized = physicalProject && await verifyPhysicalAvailabilityAuthority(physicalProject, physicalAvailability, 'offer');
      if (!authorized) {
        await onEmit("⚡", "render", {blocks: [{kind: "note", text: "Authority/Mandate no autorizó publicar esta disponibilidad."}]} as any);
        return;
      }
    }

    if (!myLoc?.latitude || !myLoc?.longitude) {
      await onEmit(
        "⚡",
        "render",
        { blocks: [{ kind: "note", text: "⚠️ Necesito ubicación (GPS) para publicar oferta." }] } as any
      );
      return;
    }

    const location = { lat: myLoc.latitude, lng: myLoc.longitude };
    const visibility = visibleLocal ? { radius_km: radiusKm } : { global: true };

    // 1) intent core (matching local en energycorecontroller)
    await onEmit("⚡", "market.offer.create", {
      amount_kwh: kwh,
      price_per_kwh: price,
      location,
      visibility,
      ...(physicalAvailability
        ? { physicalAvailabilityId: physicalAvailability.id, sourceId: physicalAvailability.sourceId,
            authorityReference: physicalAvailability.authority, evidence: physicalAvailability.evidence,
            availableFrom: physicalAvailability.availableFrom,
            availableUntil: physicalAvailability.availableUntil,
            constraints: physicalAvailability.constraints }
        : { telemetry: { pv_kw: t.pv_kw, load_kw: t.load_kw, soc: t.soc } }),
      ns: nsClean,
    });

    // 2) DV explícito para stream (Buy + MT + Micelio)
    const ts = now();

    // ✅ identidad del emisor (mejor: spore y sporeMT pueden tener ids distintos)
    const meGE = String(spore.getState?.().id || "peer:" + nsClean);
    const meMT = String(sporeMT.getState?.().id || meGE);

    // ✅ id estable (si apretás 2 veces rápido, cambia por ts)
    const dvId = `dv:mt:offer:energy:${nsClean}:${ts}`;

    const dv = {
      id: dvId,
      kind: "energy.offer",
      labels: ["Oferta de energía"],
      traits: ["mt:offer", "mt:market.offer", "mt:energy.offer", "ge:market.offer"],
      attrs: {
        kind: "sell",
        amount_kwh: Number(kwh),
        price_per_kwh: Number(price),
        location,
        visibility,
        siteId: "ge:site:default",
        ts,
        seller: meGE, // ✅ el seller que verá Buy (GE)
        ...(physicalAvailability ? {
          physicalAvailabilityId: physicalAvailability.id,
          sourceId: physicalAvailability.sourceId,
          authorityReference: physicalAvailability.authority,
          evidence: physicalAvailability.evidence,
          availableFrom: physicalAvailability.availableFrom,
          availableUntil: physicalAvailability.availableUntil,
          constraints: physicalAvailability.constraints,
          originEpistemic: physicalAvailability.epistemic,
        } : {}),
      },
      meta: {
        ns: "mt:market", // ✅ contexto semántico del DV
        scopes: ["public"],
        ts,
        source: "ge:ui",
        emitter: meGE,
      },
    };

    // ✅ A) Publicar a MT (para MT/Micelio)
    await sporeMT.sayIntent({
      sym: "🧬",
      say: "dv.upsert",
      ns: "mt", // envelope ns = mt
      with: { dv, ns: "mt:market" },
    });

    // ✅ B) Publicar también a GE (para que Buy lo vea INSTANTÁNEO sin cambiar Buy)
    await spore.sayIntent({
      sym: "🧬",
      say: "dv.upsert",
      ns: "energy:core", // envelope ns = energy:core
      with: { dv, ns: "mt:market" }, // mantiene el contexto semántico
    });

    await onEmit("⚡", "render", { blocks: [{ kind: "note", text: "✅ Oferta de venta publicada" }] } as any);
    onClose();
  };

  const toggleAutoSell = () => {
    const next = !autoSell;
    setAutoSell(next);
    onEmit("⚡", "policy.auto.sell", {
      enabled: next,
      price_per_kwh: price,
      visible_local: visibleLocal,
      radius_km: visibleLocal ? radiusKm : undefined,
      ns: nsClean,
    });
  };

  return (
    <View style={s.modal}>
      <View style={{ height: 60 }} />
      <Header title="🔆 Vender excedente" onClose={onClose} />
      <ScrollView contentContainerStyle={s.body}>
        <MapPicker
          region={myLoc}
          setRegion={() => {}}
          radiusKm={radiusKm}
          setRadiusKm={setRadiusKm}
          myLoc={myLoc}
          offers={[]}
          selectableCenter={false}
          sellerPin={myLoc}
        />

        {physicalAvailability ? <View style={s.card}>
          <Text style={s.cardTitle}>Capacidad física vinculada</Text>
          <Row label="Fuente" value={physicalProject?.comps.find(c => c.id === physicalAvailability.sourceId)?.name || physicalAvailability.sourceId} />
          <Row label="Disponible" value={physicalAvailability.quantity.toFixed(2)} unit={physicalAvailability.unit} />
          <Row label="Estado" value={physicalAvailability.epistemic.toUpperCase()} />
          <Text style={s.rowLabel}>Ventana: {new Date(physicalAvailability.availableFrom).toLocaleString()} → {new Date(physicalAvailability.availableUntil).toLocaleString()}</Text>
          {!!physicalIssues.length && <Text style={s.rowLabel}>Pendiente: {physicalIssues.join(', ')}</Text>}
          {!getPhysicalAvailabilityAuthorityProvider() && <Text style={s.rowLabel}>Para publicar, conectá un provider de Authority/Mandate del nodo.</Text>}
        </View> : <View style={s.card}>
          <Text style={s.cardTitle}>Estado</Text>
          <Row label="PV" value={(t.pv_kw ?? 0).toFixed(2)} unit="kW" />
          <Row label="Carga" value={(t.load_kw ?? 0).toFixed(2)} unit="kW" />
          <Row label="Excedente aprox." value={surplus_kw.toFixed(2)} unit="kW" />
          <Row label="SOC batería" value={(t.soc ?? 0).toFixed(0)} unit="%" />
        </View>}

        <View style={s.cardBig}>
          <Text style={s.cardTitle}>Tu oferta</Text>

          <View style={s.switchRow}>
            <TouchableOpacity onPress={() => setVisibleLocal(!visibleLocal)} style={[s.switchBtn, visibleLocal && s.switchOn]}>
              <Text style={s.switchTxt}>{visibleLocal ? "Visible por radio" : "Visible global"}</Text>
            </TouchableOpacity>
          </View>

          {visibleLocal && (
            <>
              <Text style={s.fieldLabel}>Radio de visibilidad</Text>
              <Stepper value={radiusKm} onChange={setRadiusKm} min={1} max={200} stepSize={1} suffix="km" />
            </>
          )}

          <Text style={s.fieldLabel}>Stock disponible</Text>
          <Stepper value={kwh} onChange={setKwh} min={0.1} max={1000} stepSize={0.1} suffix="kWh" />

          <Text style={s.fieldLabel}>Precio</Text>
          <MoneyInput value={price} onChange={setPrice} />

          {!physicalAvailability && <TouchableOpacity onPress={toggleAutoSell} style={s.secondary}>
            <Text style={s.secondaryTxt}>{autoSell ? "Desactivar auto-venta" : "Activar auto-venta"}</Text>
          </TouchableOpacity>}

          <TouchableOpacity disabled={!canSell} onPress={publishOffer} style={[s.primary, !canSell && s.disabled]}>
            <Text style={s.primaryTxt}>Publicar oferta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ========= Estilos =========
const s = StyleSheet.create({
  modal: { flex: 1, backgroundColor: "#0c1119" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#243041",
    backgroundColor: "#0e1521",
  },
  headerTitle: { color: "#eaf2ff", fontWeight: "800", fontSize: 16 },
  hBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#19324a" },
  hBtnTxt: { color: "#d2f", fontWeight: "700" },

  body: { padding: 12, gap: 10 },

  card: { backgroundColor: "#0f1520", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#1c2533" },
  cardBig: { backgroundColor: "#0f1520", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#1c2533" },
  cardTitle: { color: "#eaf2ff", fontSize: 15, fontWeight: "800", marginBottom: 8 },

  row: { flexDirection: "row", justifyContent: "space-between", marginVertical: 4 },
  rowLabel: { color: "#b9cede" },
  rowValue: { color: "#eaf2ff", fontWeight: "700" },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#121a26",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#223347",
    marginBottom: 8,
  },
  stpBtn: { backgroundColor: "#172233", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#24374f" },
  stpBtnSmall: { backgroundColor: "#172233", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#24374f" },
  stpTxt: { color: "#eaf2ff", fontWeight: "900", fontSize: 16 },
  stpVal: { color: "#eaf2ff", fontWeight: "700", fontSize: 14 },

  money: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#121a26",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#223347",
    marginBottom: 8,
  },
  moneyVal: { color: "#eaf2ff", fontWeight: "700", fontSize: 14 },

  switchRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  switchBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#29405a", backgroundColor: "#121a26" },
  switchOn: { backgroundColor: "#182537" },
  switchTxt: { color: "#eaf2ff", fontWeight: "700" },

  primary: { marginTop: 6, backgroundColor: "#235", paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  primaryTxt: { color: "#fff", fontWeight: "800" },
  secondary: { marginTop: 6, backgroundColor: "#1a2432", paddingVertical: 10, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: "#2a3b55" },
  secondaryTxt: { color: "#cde7ff", fontWeight: "800" },
  disabled: { opacity: 0.5 },

  mapWrap: { height: 300, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#1c2533", backgroundColor: "#0b0f14" },
  mapHud: { position: "absolute", left: 10, right: 10, bottom: 10, backgroundColor: "rgba(16,22,32,0.92)", borderColor: "rgba(150,200,255,0.18)", borderWidth: 1, borderRadius: 12, padding: 10 },
  mapHudTitle: { color: "#dfe7f3", fontWeight: "800", marginBottom: 6 },

  sortRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  sortTitle: { color: "#eaf2ff", fontWeight: "800", fontSize: 14 },
  sortBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: "#29405a", backgroundColor: "#121a26" },
  sortOn: { backgroundColor: "#182537" },
  sortTxt: { color: "#eaf2ff", fontWeight: "700" },

  listCard: { backgroundColor: "#0f1520", borderRadius: 12, borderWidth: 1, borderColor: "#1c2533", marginTop: 6, overflow: "hidden" },
  offerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#1c2533" },
  offerTitle: { color: "#eaf2ff", fontWeight: "800" },
  offerSub: { color: "#9bb" },
  offerTap: { color: "#8ce", fontWeight: "800" },

  fieldLabel: { color: "#b9cede", marginTop: 8, marginBottom: 4 },
  empty: { color: "#9bb", padding: 12, textAlign: "center" },
});
