import { UndirectedGraph } from "graphology";
import Sigma from "sigma";
import clusters from "graphology-generators/random/clusters";
import { cropToLargestConnectedComponent } from "graphology-components";
import randomLayout from "graphology-layout/random";
import forceAtlas2 from "graphology-layout-forceatlas2";

import NodeBorderProgram from "./node/border";

const graph = clusters(UndirectedGraph, { clusters: 3, order: 100, size: 1000, clusterDensity: 0.8 });
cropToLargestConnectedComponent(graph);

randomLayout.assign(graph);
forceAtlas2.assign(graph, { iterations: 100, settings: forceAtlas2.inferSettings(graph) });

graph.updateEachNodeAttributes((node, attr) => {
  return { ...attr, size: 10 };
});

const container = document.getElementById("container") as HTMLDivElement;

const renderer = new Sigma(graph, container, { nodeProgramClasses: { circle: NodeBorderProgram } });
