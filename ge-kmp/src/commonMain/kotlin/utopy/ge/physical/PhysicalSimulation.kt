package utopy.ge.physical

import kotlin.math.min
import kotlin.math.round

enum class ElectricalScenario(val wire: String) {
    NORMAL("normal"), MOTOR_BLOCKED("motor_bloqueado"), PHASE_LOST("fase_perdida"),
    SENSOR_MISSING("sensor_ausente"), OVERLOAD("sobrecarga"), CIRCUIT_OPEN("circuito_abierto");

    companion object {
        fun fromWire(value: String): ElectricalScenario? = entries.firstOrNull { it.wire == value }
    }
}
data class SimulatedCircuitEvent(
    val reference: String, val state: String, val detail: String,
    val epistemic: Epistemic = Epistemic.SIMULATED,
)
data class SimulatedElementState(
    val id: String, val label: String, val state: String, val detail: String,
    val epistemic: Epistemic = Epistemic.SIMULATED,
)

private fun faultFactor(row: CircuitRow, scenario: ElectricalScenario): Double? = when (scenario) {
    ElectricalScenario.OVERLOAD -> row.circuit.params.number("overloadFactor")?.takeIf { it > 1 }
    ElectricalScenario.MOTOR_BLOCKED -> {
        val motor = row.loads.firstOrNull { it.kind in setOf("motor", "bomba", "aire") }
        if (motor == null) 1.0 else motor.params.number("blockMultiplier")?.takeIf { it > 1 }
    }
    else -> 1.0
}

fun simulatePhysical(project: PhysicalProject, scenario: ElectricalScenario): List<SimulatedCircuitEvent> {
    val projection = electricalProjection(project)
    val events = mutableListOf<SimulatedCircuitEvent>()
    for (row in projection.rows) {
        val ref = row.circuit.name ?: row.circuit.id
        val rated = row.protection?.params?.number("amperes")
        if (projection.boards.firstOrNull()?.params?.flag("sourceReady") != true || row.voltage == null ||
            row.protection == null || row.amperes == null || rated == null || rated <= 0 ||
            row.loads.any { (it.params.number("watts") ?: 0.0) <= 0 }) {
            events += SimulatedCircuitEvent(ref, "Parámetros insuficientes", "Definí fuente, tensión, potencia de cada carga y protección.")
            continue
        }
        val contactors = project.comps.filter { it.kind == "contacto" && it.params.text("circuitId") == row.circuit.id }
        if (contactors.any { it.params.flag("closed") == null }) {
            events += SimulatedCircuitEvent(ref, "Parámetros insuficientes", "Falta el estado propuesto de un contactor.")
            continue
        }
        val factor = faultFactor(row, scenario)
        if (factor == null) {
            events += SimulatedCircuitEvent(ref, "Parámetros insuficientes", "Falta el factor de falla declarado para este escenario.")
            continue
        }
        val estimated = row.amperes * factor
        val open = scenario == ElectricalScenario.CIRCUIT_OPEN || contactors.any { it.params.flag("closed") == false }
        val state = when { open -> "Sin flujo"; estimated > rated -> "Corriente sobre nominal"; else -> "Flujo estimado" }
        val detail = if (open) "Circuito interrumpido."
            else "${oneDecimal(estimated)} A estimados · protección nominal $rated A. La actuación real requiere curva y condiciones verificadas."
        events += SimulatedCircuitEvent(ref, state, detail)
    }
    if (scenario == ElectricalScenario.PHASE_LOST || scenario == ElectricalScenario.SENSOR_MISSING)
        events += SimulatedCircuitEvent("Sistema", "Estado incierto", if (scenario == ElectricalScenario.PHASE_LOST)
            "Faltan fases y topología para calcular efectos." else "La señal ausente no confirma el estado físico.")
    if (projection.rows.isEmpty()) events += SimulatedCircuitEvent("Instalación", "Sin circuitos", "Agregá un circuito para explorar el flujo.")
    return events
}

fun simulateFlow(project: PhysicalProject, scenario: ElectricalScenario): List<SimulatedElementState> {
    val projection = electricalProjection(project)
    val states = mutableListOf<SimulatedElementState>()
    val board = projection.boards.firstOrNull()
    if (board != null) states += SimulatedElementState(board.id, board.name ?: "Tablero",
        if (scenario == ElectricalScenario.PHASE_LOST || board.params.flag("sourceReady") != true) "indeterminado" else "energizado",
        if (board.params.flag("sourceReady") == true) "Fuente declarada para el modelo." else "Fuente sin declarar.")
    for (row in projection.rows) {
        val hasPower = row.voltage != null && row.loads.isNotEmpty() && row.loads.all { (it.params.number("watts") ?: 0.0) > 0 }
        val complete = board != null && board.params.flag("sourceReady") == true && row.protection != null &&
            (row.protection.params.number("amperes") ?: 0.0) > 0 && hasPower
        val opened = scenario == ElectricalScenario.CIRCUIT_OPEN
        val contactors = project.comps.filter { it.kind == "contacto" && it.params.text("circuitId") == row.circuit.id }
        val contactUnknown = contactors.any { it.params.flag("closed") == null }
        val contactOpen = contactors.any { it.params.flag("closed") == false }
        val factor = faultFactor(row, scenario)
        val possibleTrip = complete && factor != null && row.amperes != null &&
            row.amperes * factor > (row.protection?.params?.number("amperes") ?: Double.POSITIVE_INFINITY)
        row.protection?.let { protection ->
            val state = when {
                !complete || factor == null -> "indeterminado"
                possibleTrip -> "proteccion_posible"
                opened -> "abierto"
                else -> "cerrado"
            }
            states += SimulatedElementState(protection.id, protection.name ?: "Protección", state,
                if (possibleTrip) "Posible actuación; faltan curva y condiciones reales."
                else if (!complete || factor == null) "Parámetros insuficientes." else "Estado derivado del escenario.")
        }
        val circuitState = when {
            !complete || factor == null || contactUnknown -> "indeterminado"
            opened || contactOpen -> "desenergizado"
            possibleTrip -> "proteccion_posible"
            scenario == ElectricalScenario.PHASE_LOST -> "indeterminado"
            else -> "energizado"
        }
        states += SimulatedElementState(row.circuit.id, row.circuit.name ?: "Circuito", circuitState,
            if (contactUnknown) "Falta estado propuesto del contactor."
            else if (complete) "Flujo de escenario." else "Faltan fuente, protección, tensión o potencia.")
        for (load in row.loads) {
            val state = if (load.kind in setOf("motor", "bomba", "aire")) when (circuitState) {
                "energizado" -> when (load.params.flag("runCommand")) { true -> "operando"; false -> "detenido"; null -> "indeterminado" }
                "desenergizado" -> "detenido"
                else -> "indeterminado"
            } else circuitState
            states += SimulatedElementState(load.id, load.name ?: load.kind, state,
                if (state == "indeterminado") "Falta estado de mando o parámetros." else "Resultado del escenario.")
        }
    }
    for (component in project.comps.filter { it.kind in setOf("contacto", "rele", "sensor", "actuador") }) {
        if (states.any { it.id == component.id }) continue
        val state = when (component.kind) {
            "sensor" -> if (scenario == ElectricalScenario.SENSOR_MISSING) "indeterminado"
                else if (component.params.flag("active") == true) "entrada_activa" else "indeterminado"
            "actuador" -> if (component.params.flag("active") == true) "salida_activa" else "indeterminado"
            else -> when (component.params.flag("closed")) { true -> "cerrado"; false -> "abierto"; null -> "indeterminado" }
        }
        states += SimulatedElementState(component.id, component.name ?: component.kind, state, "Estado de mando propuesto para el escenario.")
    }
    return states
}

data class PhysicalSimulationEvent(
    val reference: String, val state: String, val detail: String, val missing: List<String>,
    val epistemic: Epistemic = Epistemic.SIMULATED,
)
interface PhysicalSimulationProvider {
    val id: String
    val contextId: String
    fun simulate(project: PhysicalProject, hours: Double): List<PhysicalSimulationEvent>
}
class PhysicalSimulationRegistry(providers: List<PhysicalSimulationProvider> = emptyList()) {
    private val providers = providers.associateBy { it.contextId }.toMutableMap()
    fun register(provider: PhysicalSimulationProvider) { providers[provider.contextId] = provider }
    fun simulate(project: PhysicalProject, contextId: String, hours: Double): List<PhysicalSimulationEvent> {
        if (!hours.isFinite() || hours <= 0) return listOf(PhysicalSimulationEvent(contextId, "incompleto", "Definí una duración válida.", listOf("duración")))
        val provider = providers[contextId] ?: return listOf(PhysicalSimulationEvent(contextId, "incompleto",
            "Este contexto necesita un provider de simulación.", listOf("provider de simulación")))
        return provider.simulate(project, hours)
    }
}

object HvacSimulationProvider : PhysicalSimulationProvider {
    override val id = "ge.hvac.thermal.basic"
    override val contextId = "refrigeracion"
    override fun simulate(project: PhysicalProject, hours: Double): List<PhysicalSimulationEvent> {
        val camera = project.comps.firstOrNull { it.kind == "camara.frio" }
        val compressor = project.comps.firstOrNull { it.kind == "compresor" }
        val temp = camera?.let { c -> project.measurements.filter { it.reference == c.id && it.property == "temperature" && it.epistemic == Epistemic.OBSERVED }.maxByOrNull { it.ts } }
        val rate = compressor?.params?.number("coolingRateCPerHour")
        val missing = listOfNotNull(
            if (camera == null) "cámara" else null,
            if (temp == null || temp.unit.lowercase() !in setOf("°c", "c", "celsius")) "temperatura observada" else null,
            if (compressor?.physical?.epistemic != Epistemic.OBSERVED || compressor.params.text("operatingState") != "running") "compresor observado en operación" else null,
            if (rate == null || !rate.isFinite() || rate <= 0) "tasa térmica declarada" else null,
        )
        if (missing.isNotEmpty()) return listOf(PhysicalSimulationEvent(camera?.name ?: "Cámara", "incompleto", "Faltan parámetros para simular el cambio térmico.", missing))
        val projected = temp!!.value - rate!! * hours
        return listOf(PhysicalSimulationEvent(camera!!.name ?: camera.id, "calculable",
            "${oneDecimal(temp.value)} → ${oneDecimal(projected)} °C en $hours h, según tasa declarada. Sin modelar pérdidas ni aperturas.",
            listOf("pérdidas térmicas", "aperturas", "curva real del equipo")))
    }
}

object AgricultureSimulationProvider : PhysicalSimulationProvider {
    override val id = "ge.agro.irrigation.basic"
    override val contextId = "agricultura"
    override fun simulate(project: PhysicalProject, hours: Double): List<PhysicalSimulationEvent> {
        val soil = project.comps.firstOrNull { it.kind == "suelo" }
        val irrigation = project.comps.firstOrNull { it.kind == "riego" }
        val pump = project.comps.firstOrNull { it.kind == "bomba" && it.physical?.sourceManifest == "agricultura" }
        val humidity = soil?.let { s -> project.measurements.filter { it.reference == s.id && it.property == "humidity" && it.epistemic == Epistemic.OBSERVED }.maxByOrNull { it.ts } }
        val rate = irrigation?.params?.number("moistureGainPctPerHour")
        val hasWater = project.measurements.any { measure -> measure.property == "available" && measure.epistemic == Epistemic.OBSERVED &&
            measure.unit == "L" && project.comps.any { it.id == measure.reference && it.kind == "reservorio" } }
        val missing = listOfNotNull(
            if (soil == null) "suelo" else null,
            if (humidity?.unit != "%") "humedad observada" else null,
            if (rate == null || !rate.isFinite() || rate <= 0) "tasa de riego declarada" else null,
            if (pump?.physical?.epistemic != Epistemic.OBSERVED || pump.params.text("operatingState") != "running") "bomba observada en operación" else null,
            if (!hasWater) "agua observada en reservorio" else null,
        )
        if (missing.isNotEmpty()) return listOf(PhysicalSimulationEvent(soil?.name ?: "Suelo", "incompleto", "Faltan parámetros para simular riego.", missing))
        val projected = min(100.0, humidity!!.value + rate!! * hours)
        return listOf(PhysicalSimulationEvent(soil!!.name ?: soil.id, "calculable",
            "${oneDecimal(humidity.value)} → ${oneDecimal(projected)} % en $hours h, según tasa declarada. No ejecuta la bomba.",
            listOf("infiltración", "evaporación", "calibración de riego")))
    }
}

fun defaultPhysicalSimulationRegistry(): PhysicalSimulationRegistry =
    PhysicalSimulationRegistry(listOf(HvacSimulationProvider, AgricultureSimulationProvider))

private fun oneDecimal(value: Double): Double = round(value * 10) / 10
