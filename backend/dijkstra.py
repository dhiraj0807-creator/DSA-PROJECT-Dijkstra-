import heapq


def dijkstra(graph, source, target):
    dist = {source: 0}
    prev = {}
    visited = set()
    pq = [(0, source)]

    explored_nodes = []
    explored_edges = []

    while pq:
        curr_dist, u = heapq.heappop(pq)

        if u in visited:
            continue

        visited.add(u)
        explored_nodes.append(u)

        if u == target:
            break

        for v, edge in graph.get(u, {}).items():
            if v in visited:
                continue

            new_dist = curr_dist + edge["weight"]

            if new_dist < dist.get(v, float("inf")):
                dist[v] = new_dist
                prev[v] = u
                heapq.heappush(pq, (new_dist, v))
                explored_edges.append({"from": u, "to": v})

    path = []
    node = target if target in dist else None
    while node is not None:
        path.append(node)
        node = prev.get(node)
    path.reverse()

    if not path or path[0] != source:
        return explored_nodes, explored_edges, [], float("inf")

    return explored_nodes, explored_edges, path, dist.get(target, float("inf"))
