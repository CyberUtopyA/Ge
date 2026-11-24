package utopy.ge.physical

interface PhysicalClock { fun nowMillis(): Long }
interface PhysicalIds { fun newId(prefix: String): String }

data class CapabilityGuarantees(
    val available: Boolean, val localContinuity: Boolean? = null,
    val durability: String? = null, val latencyMs: Long? = null, val provenance: String? = null,
)
data class PhysicalAdapterManifest(
    val id: String, val version: String, val capabilities: Map<String, CapabilityGuarantees>,
    val conformance: List<String> = emptyList(), val wireProtocol: String? = null,
)
data class MeasurementReading(
    val value: Double, val unit: String, val ts: Long, val uncertainty: Double? = null,
    val evidence: String? = null, val property: String? = null,
)
interface MeasurementProvider {
    val id: String
    val origin: String
    suspend fun measure(reference: String): MeasurementReading?
}
interface SpeechProvider { suspend fun listen(): String }
interface ReferenceImportProvider {
    val id: String
    suspend fun pickReference(): PhysicalReferenceAsset?
}
interface PhysicalProjectStore {
    suspend fun load(reference: String): PhysicalProject?
    suspend fun save(reference: String, project: PhysicalProject)
}
interface PhysicalDvTransport { suspend fun publish(significantDv: PhysicalSignificantDv): Boolean }
data class PhysicalSignificantDv(
    val id: String, val kind: String, val reference: String,
    val epistemic: Epistemic, val evidence: List<String>, val attrs: PhysicalAttributes,
)
interface PhysicalAuthorityVerifier {
    suspend fun verify(reference: String, action: String, evidence: List<String>): Boolean
}
data class PhysicalSignalSample(
    val reference: String, val source: String, val ts: Long, val value: PhysicalValue,
    val unit: String? = null, val context: String? = null,
    val evidence: String? = null, val epistemic: Epistemic,
)
