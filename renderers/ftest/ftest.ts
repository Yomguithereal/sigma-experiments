import { MultiDirectedGraph, UndirectedGraph } from "graphology";
import clusters from "graphology-generators/random/clusters";
import { cropToLargestConnectedComponent } from "graphology-components";
import randomLayout from "graphology-layout/random";
import forceAtlas2 from "graphology-layout-forceatlas2";

import Sigma from "sigma";
import NodePointProgram from "sigma/rendering/webgl/programs/node.point";
import { createNodeCompoundProgram } from "sigma/rendering/webgl/programs/common/node";
import {
  NodePointWithBorderProgram,
  NodeHaloProgram,
  EdgeCurveProgram,
  EdgeCircleLoopProgram,
  createNodePictogramProgram,
} from "../src";

const clusteredGraph = clusters(UndirectedGraph, { clusters: 3, order: 100, size: 1000, clusterDensity: 0.8 });
cropToLargestConnectedComponent(clusteredGraph);

clusteredGraph.updateEachNodeAttributes((node, attr) => {
  return {
    ...attr,
    type: "pictogram",
    pictogramColor: "red",
    pictogram:
      Math.random() > 0.5
        ? "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/square/fill1/48px.svg"
        : "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/change_history/fill1/48px.svg",
  };
});

randomLayout.assign(clusteredGraph);
forceAtlas2.assign(clusteredGraph, { iterations: 100, settings: forceAtlas2.inferSettings(clusteredGraph) });

let ICON = "settings";
ICON = `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/${ICON}/wght100grad200/48px.svg`;

const dummyGraph = new MultiDirectedGraph();
dummyGraph.addNode(0, { label: "0", x: 0, y: 1, size: 5 });
dummyGraph.addNode(1, { label: "1", x: 2, y: 1, size: 5 });
dummyGraph.addNode(2, { label: "2", x: 0, y: 0, size: 5 });
dummyGraph.addNode(3, { label: "3", x: 2, y: 0, size: 5 });
dummyGraph.addNode(4, {
  label: "4",
  pictogramColor: "black",
  borderRatio: 0.1,
  // borderSize: 2,
  borderColor: "cyan",
  color: "red",
  size: 20,
  x: 1,
  y: 0.5,
  type: "pictogramWithBorder",
  pictogram: ICON,
});
dummyGraph.addNode(5, {
  label: "5",
  pictogramColor: "red",
  borderRatio: 0.1,
  borderColor: "cyan",
  color: "white",
  size: 20,
  x: 0.5,
  y: 0.5,
  type: "pictogramWithCircle",
  pictogram: ICON,
});
dummyGraph.addNode(6, {
  label: "6",
  pictogramColor: "yellow",
  borderRatio: 0.1,
  borderColor: "cyan",
  color: "red",
  size: 20,
  x: 1.5,
  y: 0.5,
  type: "pictogramWithCircle",
  pictogram: ICON,
});
dummyGraph.mergeEdge(4, 5, { size: 2, color: "blue" });
dummyGraph.mergeEdge(0, 0, { color: "black", type: "loop" });
dummyGraph.mergeEdge(0, 0, { color: "black", type: "loop", offset: 3, angle: Math.PI });
dummyGraph.mergeEdge(0, 0, { color: "black", type: "loop", offset: 6 });
dummyGraph.mergeEdge(0, 0, { color: "black", type: "loop", offset: 9, angle: Math.PI / 4, size: 4 });
dummyGraph.mergeEdge(0, 1, { color: "blue" });
dummyGraph.mergeEdge(0, 1, { color: "blue", type: "line" });
dummyGraph.mergeEdge(1, 0, { color: "blue" });
dummyGraph.mergeEdge(1, 2, { color: "blue" });
dummyGraph.mergeEdge(2, 3, { color: "blue" });
dummyGraph.mergeEdge(3, 0, { color: "blue" });
dummyGraph.mergeEdge(0, 2, { color: "blue" });
dummyGraph.mergeEdge(1, 3, { color: "blue" });

const shownGraph = dummyGraph;

shownGraph.updateEachNodeAttributes((node, attr) => {
  const size = attr.size || Math.random() * 15;

  return {
    ...attr,
    size,
    haloSize: size * 7,
    color: attr.color || "blue",
    haloColor: Math.random() > 0.5 ? "blue" : "green",
    insideColor: "yellow",
    dotColor: "black",
    haloIntensity: Math.random(),
    borderColor: attr.borderColor || (Math.random() > 0.5 ? "green" : "yellow"),
    borderRatio: attr.borderRatio || Math.random(),
  };
});

shownGraph.updateEachEdgeAttributes((edge, attr) => {
  return { ...attr, size: attr.size || 0.5 };
});

const container = document.getElementById("container") as HTMLDivElement;

declare global {
  interface Window {
    renderer: Sigma;
  }
}

const NodePictogramProgram = createNodePictogramProgram({
  correctCentering: true,
  forcedSvgSize: 384,
  keepWithinCircle: false,
});

window.renderer = new Sigma(shownGraph, container, {
  nodeProgramClasses: {
    border: NodePointWithBorderProgram,
    pictogram: NodePictogramProgram,
    pictogramWithCircle: createNodeCompoundProgram([NodePointProgram, NodePictogramProgram]),
    pictogramWithBorder: createNodeCompoundProgram([NodePointWithBorderProgram, NodePictogramProgram]),
    halo: createNodeCompoundProgram([NodeHaloProgram, NodePointProgram]),
  },
  nodeHoverProgramClasses: {
    halo: NodePointProgram,
  },
  edgeProgramClasses: { curve: EdgeCurveProgram, loop: EdgeCircleLoopProgram },
  defaultNodeType: "circle",
  defaultEdgeType: "curve",
  stagePadding: 50,
});

// const rotate = () => {
//   window.renderer.getCamera().updateState((state) => ({ angle: state.angle + 0.025 }));
//   requestAnimationFrame(rotate);
// };

// rotate();
