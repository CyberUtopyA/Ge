package utopy.ge.physical

fun addManualMeasure(
    project: PhysicalProject, value: Double, unit: String, reference: String,
    ids: PhysicalIds, clock: PhysicalClock, uncertainty: Double? = null,
    property: String? = null,
): PhysicalProject {
    if (!value.isFinite() || value < 0 || unit.isBlank() || reference.isBlank() ||
        (uncertainty != null && (!uncertainty.isFinite() || uncertainty < 0))) return project
    val measure = PhysicalMeasure(
        id = ids.newId("measure"), value = value, unit = unit.trim(), origin = "manual",
        ts = clock.nowMillis(), reference = reference.trim(),
        property = property?.trim()?.takeIf { it.isNotEmpty() }, uncertainty = uncertainty,
    )
    return project.copy(measurements = project.measurements + measure)
}

fun recordProviderMeasure(
    project: PhysicalProject, provider: MeasurementProvider, reference: String,
    reading: MeasurementReading, ids: PhysicalIds,
): PhysicalProject {
    if (reference.isBlank() || !reading.value.isFinite() || reading.value < 0 || reading.unit.isBlank() ||
        (reading.uncertainty != null && (!reading.uncertainty.isFinite() || reading.uncertainty < 0))) return project
    val measure = PhysicalMeasure(
        id = ids.newId("measure"), value = reading.value, unit = reading.unit.trim(),
        origin = provider.origin, ts = reading.ts, reference = reference.trim(),
        property = reading.property?.trim()?.takeIf { it.isNotEmpty() },
        uncertainty = reading.uncertainty, evidence = reading.evidence,
    )
    return project.copy(measurements = project.measurements + measure)
}

suspend fun measureWithProvider(
    project: PhysicalProject, provider: MeasurementProvider, reference: String, ids: PhysicalIds,
): PhysicalProject {
    val reading = provider.measure(reference) ?: return project
    return recordProviderMeasure(project, provider, reference, reading, ids)
}

fun significantMeasurement(siteId: String, measure: PhysicalMeasure): PhysicalSignificantDv? {
    if (siteId.isBlank() || measure.reference.isBlank() || !measure.value.isFinite() ||
        measure.unit.isBlank() || measure.origin.isBlank() || measure.ts <= 0) return null
    return PhysicalSignificantDv(
        id = "dv:ge:physical.measurement:$siteId:${measure.id}", kind = "ge.physical.measurement",
        reference = measure.reference, epistemic = measure.epistemic,
        evidence = listOfNotNull(measure.evidence),
        attrs = mapOf(
            "value" to PhysicalValue.Number(measure.value),
            "unit" to PhysicalValue.Text(measure.unit),
            "origin" to PhysicalValue.Text(measure.origin),
            "ts" to PhysicalValue.Number(measure.ts.toDouble()),
            "reference" to PhysicalValue.Text(measure.reference),
            "basis" to PhysicalValue.Text(measure.basis.wire),
        ) + (measure.property?.let { mapOf("property" to PhysicalValue.Text(it)) } ?: emptyMap()),
    )
}
