package utopy.ge.physical

data class ProtectionInput(val currentA: Double, val ratedA: Double, val circuitId: String)
enum class ProtectionVerdict { COMPATIBLE, REVIEW, INCOMPATIBLE, INCOMPLETE }
data class ElectricalCalculationPolicy(
    val id: String, val resistivityOhmMm2PerM: Double? = null,
    val loopFactor: Double? = null, val maxVoltageDropPct: Double? = null,
    val conductorAllowancePct: Double? = null,
    val evaluateProtection: ((ProtectionInput) -> ProtectionVerdict)? = null,
)
data class CircuitCalculation(
    val circuitId: String, val name: String, val loadCount: Int,
    val declaredPowerW: Double?, val voltageV: Double?, val currentA: Double?,
    val routeLengthM: Double?, val routeBasis: MeasureBasis,
    val conduitLengthM: Double?, val conductorLengthM: Double?,
    val voltageDropV: Double?, val voltageDropPct: Double?,
    val protection: ProtectionVerdict, val phase: String?,
    val missing: List<String>, val policyId: String?,
)
data class ElectricalCalculationReport(
    val circuits: List<CircuitCalculation>, val knownPowerW: Double,
    val completePower: Boolean, val unassignedCount: Int,
    val phaseTotals: Map<String, Double>, val phaseImbalancePct: Double?,
    val policyId: String?,
)

fun calculateElectrical(project: PhysicalProject, policy: ElectricalCalculationPolicy? = null): ElectricalCalculationReport {
    val projection = electricalProjection(project)
    val circuits = projection.rows.map { row ->
        val missing = mutableListOf<String>()
        val powers = row.loads.map { it.params.number("watts") }
        val declaredPowerW = if (powers.isNotEmpty() && powers.all { it != null && it.isFinite() && it >= 0 })
            powers.sumOf { it!! } else null
        if (declaredPowerW == null) missing += "potencia de cada carga"
        val voltageV = row.circuit.params.number("voltage")?.takeIf { it.isFinite() && it > 0 }
        if (voltageV == null) missing += "tensión"
        val currentA = if (declaredPowerW != null && voltageV != null) declaredPowerW / voltageV else null
        val routes = project.routes.filter { it.circuitId == row.circuit.id && it.kind == "conduit" && it.board == null }
        val measuredRoutes = mutableSetOf<String>()
        val routeLengthM = if (routes.isEmpty()) null else routes.sumOf { route ->
            val measure = project.measurements.asReversed().firstOrNull {
                it.reference == route.id && it.unit == "m" && it.basis == MeasureBasis.MEASURED
            }
            if (measure != null) measuredRoutes += route.id
            measure?.value ?: pathLength(route)
        }
        if (routeLengthM == null) missing += "recorrido"
        val conductors = row.circuit.params.number("conductors")
        val validConductors = conductors != null && conductors.isFinite() && conductors > 0 && conductors % 1.0 == 0.0
        if (!validConductors) missing += "cantidad de conductores"
        val allowance = policy?.conductorAllowancePct
        val conductorLengthM = if (routeLengthM != null && validConductors && allowance != null && allowance.isFinite() && allowance >= 0)
            routeLengthM * conductors!! * (1 + allowance / 100) else null
        if (conductorLengthM == null && routeLengthM != null && conductors != null && conductors > 0)
            missing += "margen de conductor (provider)"
        val area = row.circuit.params.number("conductorAreaMm2")
        if (area == null || !area.isFinite() || area <= 0) missing += "sección de conductor"
        val rho = policy?.resistivityOhmMm2PerM
        val factor = policy?.loopFactor
        val voltageDropV = if (currentA != null && routeLengthM != null && area != null && area > 0 &&
            rho != null && rho > 0 && factor != null && factor > 0)
            currentA * routeLengthM * factor * rho / area else null
        if (voltageDropV == null) missing += "provider de caída de tensión"
        val voltageDropPct = if (voltageDropV != null && voltageV != null) voltageDropV / voltageV * 100 else null
        val ratedA = row.protection?.params?.number("amperes")
        if (ratedA == null || ratedA <= 0) missing += "protección"
        val protection = if (currentA != null && ratedA != null && ratedA > 0 && policy?.evaluateProtection != null)
            policy.evaluateProtection.invoke(ProtectionInput(currentA, ratedA, row.circuit.id)) else ProtectionVerdict.INCOMPLETE
        if (protection == ProtectionVerdict.INCOMPLETE) missing += "policy de protección"
        CircuitCalculation(
            circuitId = row.circuit.id, name = row.circuit.name ?: row.circuit.id,
            loadCount = row.loads.size, declaredPowerW = declaredPowerW, voltageV = voltageV,
            currentA = currentA, routeLengthM = routeLengthM,
            routeBasis = if (routes.isNotEmpty() && measuredRoutes.size == routes.size) MeasureBasis.MEASURED else MeasureBasis.CALCULATED,
            conduitLengthM = routeLengthM, conductorLengthM = conductorLengthM,
            voltageDropV = voltageDropV, voltageDropPct = voltageDropPct,
            protection = protection, phase = row.circuit.params.text("phase"),
            missing = missing.distinct(), policyId = policy?.id,
        )
    }
    val phaseTotals = circuits.filter { it.phase != null && it.declaredPowerW != null }
        .groupBy { it.phase!! }.mapValues { (_, rows) -> rows.sumOf { it.declaredPowerW!! } }
    val values = phaseTotals.values.toList()
    val average = if (values.isEmpty()) Double.NaN else values.average()
    val phaseImbalance = if (values.size > 1 && average > 0 && circuits.all { it.phase != null && it.declaredPowerW != null })
        ((values.maxOrNull()!! - values.minOrNull()!!) / average) * 100 else null
    return ElectricalCalculationReport(
        circuits, circuits.sumOf { it.declaredPowerW ?: 0.0 },
        circuits.all { it.declaredPowerW != null } && projection.unassigned.isEmpty(),
        projection.unassigned.size, phaseTotals, phaseImbalance, policy?.id,
    )
}
