import { UndirectedGraph } from "graphology";
import clusters from "graphology-generators/random/clusters";
import { cropToLargestConnectedComponent } from "graphology-components";
import randomLayout from "graphology-layout/random";
import forceAtlas2 from "graphology-layout-forceatlas2";

import Sigma from "sigma";
import NodeCircleProgram from "sigma/rendering/webgl/programs/node.fast";
import { createNodeCompoundProgram } from "sigma/rendering/webgl/programs/common/node";

import createNodeThreeCirclesProgram from "../src/node/three-circles";
import createNodeUniformBorderProgram from "../src/node/uniform-border";
import createNodeBorderProgram from "../src/node/border";
import createNodeHaloProgram from "../src/node/halo";
import createNodeUniformHaloProgram from "../src/node/uniform-halo";

const graph = clusters(UndirectedGraph, { clusters: 3, order: 100, size: 1000, clusterDensity: 0.8 });
cropToLargestConnectedComponent(graph);

randomLayout.assign(graph);
forceAtlas2.assign(graph, { iterations: 100, settings: forceAtlas2.inferSettings(graph) });

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
  };
});

const container = document.getElementById("container") as HTMLDivElement;

declare global {
  interface Window {
    renderer: Sigma;
  }
}

window.renderer = new Sigma(graph, container, {
  nodeProgramClasses: {
    border: createNodeBorderProgram(),
    uniformBorder: createNodeUniformBorderProgram({ borderRatio: 0.2 }),
    threeCircles: createNodeThreeCirclesProgram({ dotSizeRatio: 0.3, innerSizeRatio: 0.95 }),
    halo: createNodeHaloProgram(),
    heatmap: createNodeCompoundProgram([createNodeHaloProgram(), NodeCircleProgram]),
    uniformHalo: createNodeUniformHaloProgram({ haloColor: "purple" }),
  },
  defaultNodeType: "threeCircles",
});
