import heapq

def dijkstra(graph, nodes, source, target):
    """
    Dijkstra's algorithm from scratch using a min-heap (priority queue).
    
    Args:
        graph: dict of dict  { node_id: { neighbor_id: weight } }
        nodes: dict of node info { node_id: { lat, lon } }
        source: starting node id (string)
        target: destination node id (string)
    
    Returns:
        explored: list of node ids in the order they were visited (for animation)
        path: list of node ids forming the shortest path
        distance: total distance in meters
    """

    # Initialize distances to infinity for all nodes
    dist = {node: float('inf') for node in graph}
    dist[source] = 0

    # Track previous node for path reconstruction
    prev = {node: None for node in graph}

    # Min-heap: (distance, node_id)
    pq = [(0, source)]

    # Track visited nodes
    visited = set()

    # Track exploration order for animation
    explored = []

    while pq:
        curr_dist, u = heapq.heappop(pq)

        # Skip if already visited
        if u in visited:
            continue

        visited.add(u)
        explored.append(u)

        # Stop early if we reached the target
        if u == target:
            break

        # Skip nodes not in graph
        if u not in graph:
            continue

        # Explore neighbors
        for v, weight in graph[u].items():
            if v in visited:
                continue

            new_dist = curr_dist + weight

            if new_dist < dist.get(v, float('inf')):
                dist[v] = new_dist
                prev[v] = u
                heapq.heappush(pq, (new_dist, v))

    # Reconstruct shortest path by backtracking from target
    path = []
    node = target
    while node is not None:
        path.append(node)
        node = prev.get(node)
    path.reverse()

    # If path doesn't start at source, no path found
    if not path or path[0] != source:
        return explored, [], float('inf')

    total_distance = dist.get(target, float('inf'))
    return explored, path, total_distance
