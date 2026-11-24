# GE físico en el código actual

La nueva entrada de GE usa el mismo `energy:core`, `GoodEnergySurface`, editor isométrico, MMKV y Micelio. La topología existente (`rooms` y `comps`) conserva sus IDs; `routes`, `measurements` y `meta` agregan significado físico sin duplicar proyectos. La vista anterior sigue en **Más**.

## Modelo y proyecciones

- `physical.model.ts` define medidas con origen, tiempo, unidad, referencia, incertidumbre y estado epistemológico. `electricalProjection` deriva unifilar y cuadro de cargas desde circuitos, cargas y protecciones vinculadas. `simulatePhysical` produce resultados **simulados** y declara parámetros insuficientes.
- `physical.capabilities.ts` define capacidades, garantías de disponibilidad, manifests de adapter y emergencia de nodo por identidad, provenance, authority, estado, capabilities, relaciones y evidencia. No requiere un registro central.
- `physical.interaction.ts` acepta un adapter opcional de voz. El texto reconocido debe revisarse y confirmarse en la interfaz; no genera acciones físicas.
- El croquis se guarda en `ge:physical:${ns}`. Al abrir por primera vez, se lee `ge:scene:${ns}` para migrar escenas anteriores. El editor 2.5D mantiene `routes`, `measurements` y `meta` al guardar.

## Compatibilidad y migración

- `energy.telemetry` sigue como **alias heredado** de estado resumido. `telemetry.update` mantiene las muestras en el bus; las transiciones de estado producen el DV heredado. Los consumidores nuevos deben usar señales para series de alta frecuencia y DVs para cambios, evidencia y outcomes.
- `plc.telemetry` es un **kind heredado**. El runtime PLC deja las muestras en `telemetry.update` y `plc.telemetry.result`, mientras las alarmas y capabilities siguen como DVs.
- Las carpetas `hardware`, `plc` y `registry` conservan sus nombres para compatibilidad. Describen implementaciones disponibles, no propiedades canónicas de GE.
- Un adapter físico que escriba debe pasar `authorizeWrite` a `bootstrapPlcRuntime`; el host verifica Authority/Mandate y devuelve `true` únicamente para una acción autorizada. Sin verificador se rechaza la escritura. El mock puede ejecutar acciones de demostración sin tocar infraestructura real. `approval.approvedBy` por sí solo no autoriza un dispositivo físico.
- Persistencia y transporte se describen mediante garantías y capabilities. MMKV y los bridges actuales son providers concretos. La continuidad offline depende de las capabilities disponibles, no de una LAN.

## Límites actuales

El tablero es una proyección conceptual de gabinete y riel. Faltan montaje espacial completo, catálogo de dispositivos, cálculo normativo de conductores y protecciones, importadores DXF/DWG/PDF/SVG/imagen, captura real por cámara/sensor/láser y un adapter de voz instalado. Fuerza, mando y automatización ya comparten el proyecto, pero necesitan reglas eléctricas y simuladores específicos antes de usarse para decisiones de obra. MO, MT y FEDA siguen como sistemas relacionados, sin convertirse en controladores de GE.
