import heapq


def dijkstra(graph, source, target):
    distances = {node: float("inf") for node in graph}
    previous = {}
    distances[source] = 0

    queue = [(0, source)]
    visited = set()
    explored = []

    while queue:
        current_distance, current = heapq.heappop(queue)

        if current in visited:
            continue

        visited.add(current)
        explored.append(current)

        if current == target:
            break

        for neighbor, weight in graph.get(current, {}).items():
            if neighbor in visited:
                continue

            distance = current_distance + weight

            if distance < distances.get(neighbor, float("inf")):
                distances[neighbor] = distance
                previous[neighbor] = current
                heapq.heappush(queue, (distance, neighbor))

    if target not in previous and source != target:
        return explored, [], float("inf")

    path = []
    current = target

    while current is not None:
        path.append(current)
        current = previous.get(current)

    path.reverse()

    return explored, path, distances[target]
