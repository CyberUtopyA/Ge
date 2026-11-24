package utopy.ge.physical

private val loadKinds = setOf("toma", "luz", "motor", "bomba", "aire", "carga")

data class CircuitRow(
    val circuit: PhysicalComp, val loads: List<PhysicalComp>, val watts: Double,
    val amperes: Double?, val protection: PhysicalComp?, val voltage: Double?,
)
data class ElectricalProjection(
    val boards: List<PhysicalComp>, val rows: List<CircuitRow>,
    val unassigned: List<PhysicalComp>, val connectedWatts: Double,
)

fun componentCircuitId(component: PhysicalComp): String =
    if (component.kind == "circuito") component.id else component.params.text("circuitId") ?: ""

fun electricalProjection(project: PhysicalProject): ElectricalProjection {
    fun electrical(comp: PhysicalComp) = comp.physical == null ||
        (comp.physical.sourceManifest == "electricidad" && comp.physical.resource == "electricity")
    val loads = project.comps.filter { electrical(it) && it.kind in loadKinds }
    val circuits = project.comps.filter { electrical(it) && it.kind == "circuito" }
    val boards = project.comps.filter { electrical(it) && it.kind == "tablero" }
    val protections = project.comps.filter { electrical(it) && it.kind == "proteccion" }
    val rows = circuits.map { circuit ->
        val circuitLoads = loads.filter { it.params.text("circuitId") == circuit.id }
        val watts = circuitLoads.sumOf { it.params.number("watts") ?: 0.0 }
        val voltage = circuit.params.number("voltage")?.takeIf { it > 0 }
        CircuitRow(circuit, circuitLoads, watts,
            if (voltage != null && watts > 0) watts / voltage else null,
            protections.firstOrNull { it.params.text("circuitId") == circuit.id }, voltage)
    }
    val ids = circuits.map { it.id }.toSet()
    return ElectricalProjection(boards, rows, loads.filter { it.params.text("circuitId") !in ids }, rows.sumOf { it.watts })
}
