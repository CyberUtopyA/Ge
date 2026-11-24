package utopy.ge.physical

import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

fun snapPhysical(value: Double, step: Double = 0.25): Double = floor(value / step + 0.5) * step

fun componentPoint(project: PhysicalProject, component: PhysicalComp): Point {
    val room = project.rooms.firstOrNull { it.id == component.roomId }
    return Point((room?.x ?: 0.0) + component.x, (room?.y ?: 0.0) + component.y)
}

fun moveComponents(project: PhysicalProject, ids: Set<String>, dx: Double, dy: Double): PhysicalProject {
    val comps = project.comps.map { comp ->
        if (comp.id !in ids) comp else {
            val old = componentPoint(project, comp)
            val x = snapPhysical(old.x + dx)
            val y = snapPhysical(old.y + dy)
            val room = project.rooms.firstOrNull { x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.d }
            if (room == null) comp else comp.copy(roomId = room.id, x = snapPhysical(x - room.x), y = snapPhysical(y - room.y))
        }
    }
    val next = project.copy(comps = comps)
    val byId = comps.associateBy { it.id }
    val routes = project.routes.map { route ->
        if (route.points.isEmpty() || (route.from !in ids && route.to !in ids)) route else {
            val points = route.points.toMutableList()
            byId[route.from]?.takeIf { it.id in ids }?.let { points[0] = componentPoint(next, it) }
            byId[route.to]?.takeIf { it.id in ids }?.let { points[points.lastIndex] = componentPoint(next, it) }
            route.copy(points = points)
        }
    }
    return next.copy(routes = routes)
}

fun duplicateComponents(project: PhysicalProject, ids: Set<String>, newIds: PhysicalIds): PhysicalProject {
    val selected = project.comps.filter { it.id in ids }
    if (selected.isEmpty()) return project
    val idMap = selected.associate { it.id to newIds.newId(it.kind) }
    val comps = selected.map { comp ->
        val room = project.rooms.firstOrNull { it.id == comp.roomId }
        val circuitId = comp.params.text("circuitId")
        comp.copy(
            id = idMap.getValue(comp.id), name = "${comp.name ?: comp.kind} copia",
            x = max(0.0, min(room?.w ?: Double.POSITIVE_INFINITY, snapPhysical(comp.x + 0.5))),
            y = max(0.0, min(room?.d ?: Double.POSITIVE_INFINITY, snapPhysical(comp.y + 0.5))),
            params = if (circuitId != null) comp.params + ("circuitId" to PhysicalValue.Text(idMap[circuitId] ?: circuitId)) else comp.params,
        )
    }
    val next = project.copy(comps = project.comps + comps)
    val copies = comps.associateBy { it.id }
    val routes = project.routes.filter { it.from in idMap && it.to in idMap }.map { route ->
        val from = idMap.getValue(route.from)
        val to = idMap.getValue(route.to)
        val points = route.points.map { Point(snapPhysical(it.x + 0.5), snapPhysical(it.y + 0.5)) }.toMutableList()
        if (points.isNotEmpty()) {
            points[0] = componentPoint(next, copies.getValue(from))
            points[points.lastIndex] = componentPoint(next, copies.getValue(to))
        }
        route.copy(id = newIds.newId("route"), from = from, to = to, points = points,
            circuitId = route.circuitId?.let { idMap[it] ?: it })
    }
    return next.copy(routes = project.routes + routes)
}

fun updateRouteWaypoint(project: PhysicalProject, routeId: String, index: Int, point: Point): PhysicalProject =
    project.copy(routes = project.routes.map { route ->
        if (route.id != routeId || index <= 0 || index >= route.points.lastIndex) route
        else route.copy(points = route.points.mapIndexed { i, p -> if (i == index) Point(snapPhysical(point.x), snapPhysical(point.y)) else p })
    })

fun insertRouteWaypoint(project: PhysicalProject, routeId: String, segment: Int): PhysicalProject =
    project.copy(routes = project.routes.map { route ->
        if (route.id != routeId || segment < 0 || segment >= route.points.lastIndex) route else {
            val a = route.points[segment]
            val b = route.points[segment + 1]
            val midpoint = Point(snapPhysical((a.x + b.x) / 2), snapPhysical((a.y + b.y) / 2))
            route.copy(points = route.points.take(segment + 1) + midpoint + route.points.drop(segment + 1))
        }
    })

fun pathLength(route: PhysicalRoute): Double = route.points.zipWithNext().sumOf { (a, b) -> hypot(b.x - a.x, b.y - a.y) }
