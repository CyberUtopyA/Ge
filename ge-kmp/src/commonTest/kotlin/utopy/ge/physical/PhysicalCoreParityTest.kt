package utopy.ge.physical

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private class TestIds : PhysicalIds {
    private var next = 0
    override fun newId(prefix: String): String = "$prefix:${++next}"
}
private class TestClock(private val fixed: Long = 1_700_000_000_000L) : PhysicalClock {
    override fun nowMillis(): Long = fixed
}
private fun num(value: Double) = PhysicalValue.Number(value)
private fun txt(value: String) = PhysicalValue.Text(value)
private fun flag(value: Boolean) = PhysicalValue.Flag(value)

private fun electricFixture(): PhysicalProject = PhysicalProject(
    rooms = listOf(PhysicalRoom("R1", 0.0, 0.0, 6.0, 4.0, 3.0, false)),
    comps = listOf(
        PhysicalComp("TD1", "tablero", "R1", "wall", 0.0, 1.0, params = mapOf("sourceReady" to flag(true))),
        PhysicalComp("C1", "circuito", "R1", "wall", 1.0, 1.0,
            params = mapOf("voltage" to num(230.0), "conductors" to num(3.0), "conductorAreaMm2" to num(2.5))),
        PhysicalComp("Q1", "proteccion", "R1", "wall", 2.0, 1.0,
            params = mapOf("circuitId" to txt("C1"), "amperes" to num(10.0))),
        PhysicalComp("M1", "motor", "R1", "floor", 4.0, 1.0,
            params = mapOf("circuitId" to txt("C1"), "watts" to num(1150.0), "runCommand" to flag(true))),
    ),
    routes = listOf(PhysicalRoute("route:1", "Q1", "M1",
        points = listOf(Point(2.0, 1.0), Point(3.0, 1.0), Point(4.0, 1.0)),
        circuitId = "C1", kind = "conduit")),
)

class PhysicalCoreParityTest {
    @Test fun epistemicAndOpenModel() {
        assertEquals(Epistemic.OBSERVED, Epistemic.fromWire("observado"))
        assertEquals(Epistemic.SIMULATED, Epistemic.fromWire("simulado"))
        val future = PhysicalComp("X", "future.energy.receiver", physical = PhysicalSemantics(
            role = "source", resource = "unknown-resource", capabilityIds = listOf("produce", "capability.future")))
        assertEquals("unknown-resource", future.physical?.resource)
        assertTrue(electricalProjection(PhysicalProject(comps = listOf(future))).unassigned.isEmpty())
    }

    @Test fun routeMoveWaypointAndSemanticCopyMirrorTypeScript() {
        val project = electricFixture()
        val moved = moveComponents(project, setOf("M1"), 0.0, 1.0)
        assertEquals(Point(4.0, 2.0), moved.routes[0].points.last())
        val inserted = insertRouteWaypoint(moved, "route:1", 0)
        assertEquals(4, inserted.routes[0].points.size)
        val edited = updateRouteWaypoint(inserted, "route:1", 1, Point(2.7, 1.3))
        assertEquals(Point(2.75, 1.25), edited.routes[0].points[1])
        val copied = duplicateComponents(project, setOf("C1", "M1"), TestIds())
        val circuit = copied.comps.first { it.kind == "circuito" && it.id != "C1" }
        val motor = copied.comps.first { it.kind == "motor" && it.id != "M1" }
        assertEquals(circuit.id, motor.params.text("circuitId"))
    }

    @Test fun measuredLengthAndProviderCalculationMirrorTypeScript() {
        val project = electricFixture()
        val raw = calculateElectrical(project).circuits.single()
        assertEquals(5.0, raw.currentA)
        assertNull(raw.voltageDropPct)
        assertNull(raw.conductorLengthM)
        val measured = addManualMeasure(project, 8.2, "m", "route:1", TestIds(), TestClock())
        val calculated = calculateElectrical(measured, ElectricalCalculationPolicy(
            id = "local:example", resistivityOhmMm2PerM = 0.0175, loopFactor = 2.0,
            conductorAllowancePct = 10.0, evaluateProtection = { ProtectionVerdict.REVIEW },
        )).circuits.single()
        assertEquals(8.2, calculated.routeLengthM)
        assertEquals(MeasureBasis.MEASURED, calculated.routeBasis)
        assertEquals(27.06, calculated.conductorLengthM!!, 1e-8)
        assertTrue(calculated.voltageDropPct!! > 0)
        assertEquals(ProtectionVerdict.REVIEW, calculated.protection)
    }

    @Test fun measurementProvenanceAndValidationMirrorTypeScript() {
        val project = electricFixture()
        val measured = addManualMeasure(project, 3.5, "m", "R1", TestIds(), TestClock(), 0.02)
        val measure = measured.measurements.single()
        assertEquals("manual", measure.origin)
        assertEquals(Epistemic.OBSERVED, measure.epistemic)
        assertEquals(0.02, measure.uncertainty)
        assertEquals("R1", significantMeasurement("site:1", measure)?.reference)
        assertEquals(project, addManualMeasure(project, Double.NaN, "m", "missing", TestIds(), TestClock()))
    }

    @Test fun intentProposesWithoutExecutionAndParsesNewContexts() {
        val project = electricFixture()
        val ids = TestIds()
        val placed = proposeIntent(project, parsePhysicalIntent("Poné tres tomas acá"), ids)
        assertEquals(3, placed.comps.count { it.kind == "toma" })
        assertEquals("propuesto", placed.comps.last().params.text("epistemic"))
        val air = proposeIntent(project, parsePhysicalIntent("Hacé un circuito para el aire"), TestIds())
        val circuit = air.comps.first { it.kind == "circuito" && it.id != "C1" }
        assertEquals(circuit.id, air.comps.first { it.kind == "aire" }.params.text("circuitId"))
        assertEquals(3.6, parsePhysicalIntent("esta pared mide 3,60 m").value)
        assertEquals("agricultura", parsePhysicalIntent("Quiero automatizar el riego").experience)
        assertEquals("refrigeracion", parsePhysicalIntent("Esta cámara debería estar a 2 grados").experience)
        assertEquals("investigacion", parsePhysicalIntent("Investigo generación mediante plantas").experience)
    }

    @Test fun electricalSimulationMarksUnknownFaultAndOpenContactor() {
        val project = electricFixture()
        assertEquals("Parámetros insuficientes", simulatePhysical(project, ElectricalScenario.MOTOR_BLOCKED).first().state)
        assertEquals("operando", simulateFlow(project, ElectricalScenario.NORMAL).first { it.id == "M1" }.state)
        val factor = project.copy(comps = project.comps.map {
            if (it.id == "M1") it.copy(params = it.params + ("blockMultiplier" to num(3.0))) else it
        })
        assertEquals("Corriente sobre nominal", simulatePhysical(factor, ElectricalScenario.MOTOR_BLOCKED).first().state)
        val contact = project.copy(comps = project.comps + PhysicalComp("K1", "contacto", "R1", "wall", 2.0, 2.0,
            params = mapOf("circuitId" to txt("C1"), "closed" to flag(false))))
        assertEquals("Sin flujo", simulatePhysical(contact, ElectricalScenario.NORMAL).first().state)
        assertEquals("desenergizado", simulateFlow(contact, ElectricalScenario.NORMAL).first { it.id == "C1" }.state)
        assertEquals("detenido", simulateFlow(contact, ElectricalScenario.NORMAL).first { it.id == "M1" }.state)
        assertEquals(Epistemic.SIMULATED, simulatePhysical(contact, ElectricalScenario.NORMAL).first().epistemic)
    }

    @Test fun genericSimulationNeedsDeclaredProviderAndPhysicalEvidence() {
        val registry = defaultPhysicalSimulationRegistry()
        assertEquals("incompleto", registry.simulate(PhysicalProject(), "future", 1.0).single().state)
        assertTrue("provider de simulación" in registry.simulate(PhysicalProject(), "future", 1.0).single().missing)
        val camera = PhysicalComp("camera", "camara.frio", name = "Cámara", params = mapOf("targetTemperatureC" to num(2.0)))
        val compressor = PhysicalComp("compressor", "compresor", params = mapOf("coolingRateCPerHour" to num(1.0), "operatingState" to txt("running")),
            physical = PhysicalSemantics("transform", "refrigerant", epistemic = Epistemic.OBSERVED))
        val project = PhysicalProject(comps = listOf(camera, compressor), measurements = listOf(
            PhysicalMeasure("temp", 8.1, "°C", "manual", 100L, "camera", "temperature")))
        val event = registry.simulate(project, "refrigeracion", 1.0).single()
        assertEquals("calculable", event.state)
        assertEquals(Epistemic.SIMULATED, event.epistemic)
        assertTrue("7.1" in event.detail)
    }

    @Test fun physicalProvidersRemainExternal() {
        val manifest = PhysicalAdapterManifest("future.adapter", "1", mapOf("produce.future" to CapabilityGuarantees(true)))
        assertTrue(manifest.capabilities.containsKey("produce.future"))
        assertFalse(PhysicalProject().comps.any { it.kind == "future.adapter" })
    }
}
