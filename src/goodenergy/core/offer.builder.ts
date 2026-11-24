import type {
  EnergyContext,
  EnergyOfferAttrs,
  EnergyPlanAttrs,
  MaterialLine,
  Phase1Seller,
} from "./energy.phase1.types";

const round0 = (n: number) => Math.round(n);

function sumMaterials(materials: MaterialLine[]) {
  return materials.reduce((sum, m) => sum + Number(m.priceHint || 0), 0);
}

function locationText(ctx: EnergyContext, seller?: Phase1Seller) {
  const geo = seller?.location || ctx.geo;
  if (!geo) return "sin geo";
  const r = seller?.serviceAreaKm ?? ctx.geo?.radius_km ?? 15;
  return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)} · ${r}km`;
}

export function buildEnergyOffers(
  plan: EnergyPlanAttrs,
  ctx: EnergyContext,
  seller?: Phase1Seller
): EnergyOfferAttrs[] {
  const sellerId = seller?.id || ctx.siteId;
  const sellerName = seller?.name || "GoodEnergy";
  const materialsTotal = sumMaterials(plan.materials);

  const installationBase = round0(
    350000 +
      plan.circuits.length * 90000 +
      plan.sensors.reduce((sum, s) => sum + s.qty * 45000, 0)
  );

  const monitoringBase = round0(
    180000 + ctx.sensorCount * 35000 + ctx.relayCount * 25000
  );

  return [
    {
      sellerId,
      sellerName,
      offerType: "materiales",
      items: plan.materials.map((m) => ({
        name: m.name,
        qty: m.qty,
        unit: m.unit,
        priceHint: m.priceHint,
        currency: m.currency || "PYG",
      })),
      serviceArea: locationText(ctx, seller),
      leadTimeDays: 3,
      notes: `Kit base para ${ctx.siteType}. Total heurístico: ${materialsTotal.toLocaleString("es-PY")} PYG.`,
    },
    {
      sellerId,
      sellerName,
      offerType: "instalacion",
      items: [
        {
          name: "Instalación y puesta en marcha",
          qty: 1,
          unit: "servicio",
          priceHint: installationBase,
          currency: "PYG",
        },
        {
          name: "Configuración de tablero / gabinete",
          qty: 1,
          unit: "servicio",
          priceHint: round0(220000 + plan.circuits.length * 30000),
          currency: "PYG",
        },
      ],
      serviceArea: locationText(ctx, seller),
      leadTimeDays: ctx.siteType === "fabrica" ? 7 : 4,
      notes: `Incluye separación por circuitos, protecciones y pruebas básicas.`,
    },
    {
      sellerId,
      sellerName,
      offerType: "monitoreo",
      items: [
        {
          name: "Monitoreo energético base",
          qty: 1,
          unit: "mensual",
          priceHint: monitoringBase,
          currency: "PYG",
        },
        {
          name: "Mantenimiento preventivo",
          qty: 1,
          unit: "visita",
          priceHint: round0(140000 + plan.board.mainBreakerAmp! * 1200),
          currency: "PYG",
        },
      ],
      serviceArea: locationText(ctx, seller),
      leadTimeDays: 1,
      notes: `Monitoreo orientado a telemetría, alarmas y seguimiento del plan energético.`,
    },
  ];
}