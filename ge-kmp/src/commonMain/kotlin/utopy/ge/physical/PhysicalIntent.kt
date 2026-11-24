package utopy.ge.physical

import kotlin.math.min

data class PhysicalIntent(
    val kind: String, val phrase: String, val experience: String? = null,
    val component: String? = null, val count: Int? = null, val scenario: String? = null,
    val value: Double? = null, val unit: String? = null, val view: String? = null,
    val filter: String? = null, val forSelected: Boolean = false,
)
data class PhysicalIntentContext(val roomId: String? = null, val selectedIds: Set<String> = emptySet())

private fun normalized(phrase: String): String = phrase.trim().lowercase()
    .replace('á', 'a').replace('é', 'e').replace('í', 'i')
    .replace('ó', 'o').replace('ú', 'u').replace('ñ', 'n')

fun parsePhysicalIntent(phrase: String): PhysicalIntent {
    val s = normalized(phrase)
    val count = when {
        Regex("""\b(tres|3)\b""").containsMatchIn(s) -> 3
        Regex("""\b(dos|2)\b""").containsMatchIn(s) -> 2
        else -> 1
    }
    fun intent(kind: String, experience: String? = null) = PhysicalIntent(kind, phrase, experience = experience)
    val target = Regex("""camara.*(?:deberia|tiene que|objetivo|meta).*?(\d+(?:[,.]\d+)?)\s*(?:grados|°c|celsius)""").find(s)
    if (target != null) return PhysicalIntent("target", phrase, experience = "refrigeracion", value = target.groupValues[1].replace(',', '.').toDouble(), unit = "°C")
    if (Regex("""circuito frigorifico|refrigeracion|camara frigorifica|hvac""").containsMatchIn(s)) return intent("context", "refrigeracion")
    if (Regex("""que esta pasando|diagnostic|por que.*(consume|calienta|enfria)""").containsMatchIn(s)) return intent("diagnose")
    if (Regex("""compara.*(medicion|medidas)|antes.*despues""").containsMatchIn(s)) return intent("compare")
    if (Regex("""excedente|hacer.*disponible|ofrec.*energ""").containsMatchIn(s)) return intent("availability", "energia")
    if (Regex("""investig|estudi|experiment|hipotesis|generacion mediante plantas""").containsMatchIn(s)) return intent("context", "investigacion")
    if (Regex("""riego|suelo|humedad|cultivo|invernadero""").containsMatchIn(s)) return intent("context", "agricultura")
    if (Regex("""ganad|bebedero|corral|cercos""").containsMatchIn(s)) return intent("context", "ganaderia")
    if (Regex("""solar|eolica|bateria|generar.*energ|energia.*gener""").containsMatchIn(s)) return intent("context", "energia")
    if (Regex("""instalacion.*casa""").containsMatchIn(s)) return intent("context", "electricidad")
    if (Regex("""maquina.*consum|cuanto consume.*bomba""").containsMatchIn(s)) return intent("context", "energia")
    if ("simul" in s) return PhysicalIntent("simulate", phrase, scenario = if ("bloque" in s) "motor_bloqueado" else "normal")
    if (Regex("""mostra.*solo.*(iluminacion|luces)""").containsMatchIn(s)) return PhysicalIntent("isolate", phrase, filter = "luz")
    if (Regex("""abri.*tablero|mostra.*tablero""").containsMatchIn(s)) return PhysicalIntent("view", phrase, view = "tablero")
    if ("unifilar" in s) return PhysicalIntent("view", phrase, view = "unifilar")
    if (Regex("""cuanto.*(cano|conductor|cable)|calcula.*recorrido""").containsMatchIn(s)) return intent("calculate")
    val measured = Regex("""(?:mide|hay|son)\s+(\d+(?:[,.]\d+)?)\s*(m|metros?|cm|centimetros?)""").find(s)
    if (measured != null) return PhysicalIntent("measure_set", phrase,
        value = measured.groupValues[1].replace(',', '.').toDouble(),
        unit = if (measured.groupValues[2].startsWith('c')) "cm" else "m")
    if (Regex("""cuanto cable|medi|medir|distancia|area""").containsMatchIn(s)) return intent("measure")
    if ("circuito" in s) return PhysicalIntent("circuit", phrase,
        component = when { "aire" in s -> "aire"; "bomba" in s -> "bomba"; else -> null },
        forSelected = Regex("""estas?|seleccionad""").containsMatchIn(s))
    if ("tablero" in s) return PhysicalIntent("board", phrase, component = if ("bomba" in s) "bomba" else null)
    val component = when {
        Regex("""toma|enchufe""").containsMatchIn(s) -> "toma"
        Regex("""luz|lampara""").containsMatchIn(s) -> "luz"
        "sensor" in s -> "sensor"
        Regex("""motor|bomba""").containsMatchIn(s) -> "motor"
        else -> null
    }
    return if (component != null) PhysicalIntent("place", phrase, component = component, count = count)
    else intent("unknown")
}

/** Proposals only. Intent parsing never actuates a physical device. */
fun proposeIntent(project: PhysicalProject, intent: PhysicalIntent, ids: PhysicalIds,
                  context: PhysicalIntentContext = PhysicalIntentContext()): PhysicalProject {
    val room = project.rooms.firstOrNull { it.id == context.roomId } ?: project.rooms.firstOrNull()
    if (room == null || intent.kind !in setOf("place", "circuit", "board")) return project
    val kind = when (intent.kind) { "circuit" -> "circuito"; "board" -> "tablero"; else -> intent.component ?: "toma" }
    val quantity = if (intent.kind == "place") min(intent.count ?: 1, 12) else 1
    val start = project.comps.count { it.kind == kind }
    val added = (0 until quantity).map { index ->
        PhysicalComp(
            id = ids.newId(kind), kind = kind, roomId = room.id, attach = "wall",
            x = min(room.w - 0.25, 0.5 + index * 0.75), y = 0.5,
            name = "${when (kind) { "circuito" -> "C"; "tablero" -> "TD"; else -> kind.uppercase() }}${start + index + 1}",
            params = mapOf("epistemic" to PhysicalValue.Text("propuesto")),
        )
    }.toMutableList()
    if (intent.component != null && intent.kind != "place") {
        val loadKind = intent.component
        added += PhysicalComp(
            id = ids.newId(loadKind), kind = loadKind, roomId = room.id, attach = "wall",
            x = min(room.w - 0.25, 1.5), y = 1.5,
            name = "${loadKind.uppercase()}${project.comps.count { it.kind == loadKind } + 1}",
            params = mapOf("epistemic" to PhysicalValue.Text("propuesto")) +
                (if (intent.kind == "circuit") mapOf("circuitId" to PhysicalValue.Text(added[0].id)) else emptyMap()),
        )
    }
    val linked = if (intent.kind == "circuit" && intent.forSelected && context.selectedIds.isNotEmpty())
        project.comps.map { comp -> if (comp.id in context.selectedIds) comp.copy(params = comp.params + ("circuitId" to PhysicalValue.Text(added[0].id))) else comp }
    else project.comps
    return project.copy(comps = linked + added)
}
