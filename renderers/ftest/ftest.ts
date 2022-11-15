import { UndirectedGraph } from "graphology";
import clusters from "graphology-generators/random/clusters";
import { cropToLargestConnectedComponent } from "graphology-components";
import randomLayout from "graphology-layout/random";
import forceAtlas2 from "graphology-layout-forceatlas2";

import Sigma from "sigma";
import { NodePointWithBorderProgram } from "../src";

// const graph = clusters(UndirectedGraph, { clusters: 3, order: 100, size: 1000, clusterDensity: 0.8 });
// cropToLargestConnectedComponent(graph);
const graph = new UndirectedGraph();
graph.addNode(0, { label: "0", x: 0, y: 1 });
graph.addNode(1, { label: "1", x: 2, y: 1 });
graph.addNode(2, { label: "2", x: 0, y: 0 });
graph.addNode(3, { label: "3", x: 2, y: 0 });
graph.mergeEdge(0, 1, { color: "blue" });
graph.mergeEdge(1, 2, { color: "blue" });
graph.mergeEdge(2, 3, { color: "blue" });
graph.mergeEdge(3, 0, { color: "blue" });
graph.mergeEdge(0, 2, { color: "blue" });
graph.mergeEdge(1, 3, { color: "blue" });

// randomLayout.assign(graph);
// forceAtlas2.assign(graph, { iterations: 100, settings: forceAtlas2.inferSettings(graph) });

graph.updateEachNodeAttributes((node, attr) => {
  const size = Math.random() * 15;

  return {
    ...attr,
    size,
    haloSize: size * 7,
    color: "red",
    haloColor: Math.random() > 0.5 ? "blue" : "green",
    insideColor: "yellow",
    dotColor: "black",
    haloIntensity: Math.random(),
    borderColor: Math.random() > 0.5 ? "green" : "yellow",
    triangle: Math.random() > 0.5,
  };
});

graph.updateEachEdgeAttributes((edge, attr) => {
  return { ...attr, size: 0.5 };
});

const container = document.getElementById("container") as HTMLDivElement;

declare global {
  interface Window {
    renderer: Sigma;
  }
}

window.renderer = new Sigma(graph, container, {
  nodeProgramClasses: {
    border: NodePointWithBorderProgram,
  },
  edgeProgramClasses: {},
  defaultNodeType: "border",
  defaultEdgeType: "line",
});
