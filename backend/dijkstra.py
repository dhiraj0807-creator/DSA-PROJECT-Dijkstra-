import heapq


def dijkstra(graph, source, target):
    """
    Dijkstra's algorithm from scratch using a min-heap (priority queue).

    graph: dict of dict, directed adjacency list
        { node_id: { neighbor_id: {"weight": float, "geometry": [[lat, lon], ...]} } }

    Returns:
        explored_nodes: node ids in the order they were permanently visited
        explored_edges: [{"from": u, "to": v}, ...] in chronological order.
            An edge is recorded only when relaxing it actually improves a
            tentative distance, not every time it's merely examined. This
            keeps the event list meaningful instead of flooding it with
            duplicates every time a node is looked at from multiple sides.
        path: node ids from source to target (empty if unreachable)
        distance: total path distance in meters (inf if unreachable)
    """
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

        # Stop as soon as the target is popped with its final shortest distance
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
