import unittest

from dijkstra import dijkstra


def edge(weight):
    """Small test edge; geometry is not needed by the algorithm."""
    return {"weight": weight}


class DijkstraTests(unittest.TestCase):
    def test_finds_the_lowest_total_weight_path(self):
        graph = {
            "A": {"B": edge(4), "C": edge(1)},
            "B": {"D": edge(1)},
            "C": {"B": edge(2), "D": edge(5)},
        }

        explored_nodes, explored_edges, path, distance = dijkstra(graph, "A", "D")

        self.assertEqual(path, ["A", "C", "B", "D"])
        self.assertEqual(distance, 4)
        self.assertEqual(explored_nodes[0], "A")
        self.assertIn({"from": "C", "to": "B"}, explored_edges)

    def test_respects_directed_edges(self):
        graph = {"A": {"B": edge(1)}, "B": {}}

        _, _, path, distance = dijkstra(graph, "B", "A")

        self.assertEqual(path, [])
        self.assertEqual(distance, float("inf"))

    def test_handles_source_equal_to_target(self):
        graph = {"A": {"B": edge(1)}}

        explored_nodes, _, path, distance = dijkstra(graph, "A", "A")

        self.assertEqual(explored_nodes, ["A"])
        self.assertEqual(path, ["A"])
        self.assertEqual(distance, 0)


if __name__ == "__main__":
    unittest.main()
