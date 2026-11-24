package utopy.ge.physical

/** Open physical vocabulary: role, resource, kind, origin and capability IDs are strings. */
enum class Epistemic(val wire: String) {
    OBSERVED("observado"), CALCULATED("calculado"), SIMULATED("simulado"),
    INFERRED("inferido"), PROPOSED("propuesto"), EXECUTED("ejecutado");

    companion object {
        fun fromWire(value: String): Epistemic? = entries.firstOrNull { it.wire == value.lowercase() }
    }
}

enum class MeasureBasis(val wire: String) {
    MEASURED("medido"), CALCULATED("calculado"), ESTIMATED("estimado"), PROPOSED("propuesto");

    companion object {
        fun fromWire(value: String): MeasureBasis? = entries.firstOrNull { it.wire == value.lowercase() }
    }
}

sealed interface PhysicalValue {
    data class Number(val value: Double) : PhysicalValue
    data class Text(val value: String) : PhysicalValue
    data class Flag(val value: Boolean) : PhysicalValue
    data class Items(val value: List<PhysicalValue>) : PhysicalValue
    data class Fields(val value: Map<String, PhysicalValue>) : PhysicalValue
}

typealias PhysicalAttributes = Map<String, PhysicalValue>

fun PhysicalAttributes.number(key: String): Double? = when (val value = this[key]) {
    is PhysicalValue.Number -> value.value
    is PhysicalValue.Text -> value.value.toDoubleOrNull()
    else -> null
}
fun PhysicalAttributes.text(key: String): String? = when (val value = this[key]) {
    is PhysicalValue.Text -> value.value
    is PhysicalValue.Number -> value.value.toString()
    else -> null
}
fun PhysicalAttributes.flag(key: String): Boolean? = (this[key] as? PhysicalValue.Flag)?.value

data class Point(val x: Double, val y: Double)
data class PhysicalRoom(
    val id: String, val x: Double, val y: Double, val w: Double, val d: Double,
    val h: Double = 2.7, val roof: Boolean = true, val name: String? = null,
)
data class PhysicalSemantics(
    val role: String, val resource: String? = null, val capabilityIds: List<String> = emptyList(),
    val epistemic: Epistemic = Epistemic.PROPOSED, val evidence: List<String> = emptyList(),
    val sourceManifest: String? = null,
)
data class BoardPlacement(
    val boardId: String, val x: Double, val y: Double, val role: String? = null,
)
data class PhysicalComp(
    val id: String, val kind: String, val roomId: String = "", val attach: String = "floor",
    val x: Double = 0.0, val y: Double = 0.0, val params: PhysicalAttributes = emptyMap(),
    val name: String? = null, val rotation: Double? = null, val groupId: String? = null,
    val board: BoardPlacement? = null, val physical: PhysicalSemantics? = null,
)
data class PhysicalRelationSemantics(
    val resource: String? = null, val epistemic: Epistemic = Epistemic.PROPOSED,
    val evidence: List<String> = emptyList(),
)
data class BoardRoute(val boardId: String, val points: List<Point>)
data class PhysicalRoute(
    val id: String, val from: String, val to: String, val points: List<Point> = emptyList(),
    val circuitId: String? = null, val kind: String = "relation",
    val board: BoardRoute? = null, val physical: PhysicalRelationSemantics? = null,
)
data class PhysicalMeasure(
    val id: String, val value: Double, val unit: String, val origin: String,
    val ts: Long, val reference: String, val property: String? = null,
    val uncertainty: Double? = null, val evidence: String? = null,
    val epistemic: Epistemic = Epistemic.OBSERVED, val basis: MeasureBasis = MeasureBasis.MEASURED,
)
data class PhysicalReferenceAsset(
    val id: String, val uri: String, val format: String, val source: String,
    val importedAt: Long, val title: String? = null, val roomId: String? = null,
)
data class PhysicalFinding(
    val id: String, val text: String, val epistemic: Epistemic,
    val evidence: List<String>, val ts: Long,
)
data class PhysicalInvestigation(
    val id: String, val title: String, val hypothesis: String, val startedAt: Long,
    val conditions: String? = null, val componentIds: List<String> = emptyList(),
    val variableReferences: List<String> = emptyList(), val measurementIds: List<String> = emptyList(),
    val findings: List<PhysicalFinding> = emptyList(),
)
data class PhysicalAvailability(
    val id: String, val sourceId: String, val resource: String, val quantity: Double,
    val unit: String, val availableFrom: Long, val availableUntil: Long,
    val constraints: String? = null, val authority: String? = null,
    val evidence: List<String> = emptyList(), val measurementIds: List<String> = emptyList(),
    val locationReference: String? = null, val epistemic: Epistemic = Epistemic.PROPOSED,
    val createdAt: Long,
)
data class PhysicalFieldRecord(
    val id: String, val reference: String, val statement: String, val epistemic: Epistemic,
    val evidence: List<String>, val outcomeReference: String? = null, val ts: Long,
)
data class PhysicalComparison(
    val id: String, val beforeId: String, val afterId: String, val action: String,
    val evidence: List<String>, val outcomeReference: String? = null, val ts: Long,
)
data class PhysicalProject(
    val rooms: List<PhysicalRoom> = emptyList(), val comps: List<PhysicalComp> = emptyList(),
    val routes: List<PhysicalRoute> = emptyList(), val measurements: List<PhysicalMeasure> = emptyList(),
    val references: List<PhysicalReferenceAsset> = emptyList(),
    val investigations: List<PhysicalInvestigation> = emptyList(),
    val availabilities: List<PhysicalAvailability> = emptyList(),
    val fieldRecords: List<PhysicalFieldRecord> = emptyList(),
    val comparisons: List<PhysicalComparison> = emptyList(),
    val meta: PhysicalAttributes = mapOf("title" to PhysicalValue.Text("Mi instalación")),
)
