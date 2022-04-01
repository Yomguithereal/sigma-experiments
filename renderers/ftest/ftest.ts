import { UndirectedGraph } from "graphology";
import Sigma from "sigma";
import { NodeDisplayData } from "sigma/types";
import { RenderParams } from "sigma/rendering/webgl/programs/common/program";
import { NodeProgramConstructor, INodeProgram } from "sigma/rendering/webgl/programs/common/node";
import clusters from "graphology-generators/random/clusters";
import { cropToLargestConnectedComponent } from "graphology-components";
import randomLayout from "graphology-layout/random";
import forceAtlas2 from "graphology-layout-forceatlas2";

import NodeThreeCirclesProgram from "../src/node/three-circles";
import NodeCircleProgram from "sigma/rendering/webgl/programs/node.fast";
import NodeHaloProgram from "../src/node/halo";

function createNodeCompoundProgram(programClasses: Array<NodeProgramConstructor>): NodeProgramConstructor {
  return class NodeCompoundProgram implements INodeProgram {
    programs: Array<INodeProgram>;

    constructor(gl: WebGLRenderingContext, renderer: Sigma) {
      this.programs = programClasses.map((ProgramClass) => new ProgramClass(gl, renderer));
    }

    bufferData(): void {
      this.programs.forEach((program) => program.bufferData());
    }

    allocate(capacity: number): void {
      this.programs.forEach((program) => program.allocate(capacity));
    }

    bind(): void {
      // nothing todo, it's already done in each program constructor
    }

    render(params: RenderParams): void {
      this.programs.forEach((program) => {
        program.bind();
        program.bufferData();
        program.render(params);
      });
    }

    process(data: NodeDisplayData, hidden: boolean, offset: number): void {
      this.programs.forEach((program) => program.process(data, hidden, offset));
    }
  };
}

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
    haloColor: "blue",
    insideColor: "yellow",
    dotColor: "black",
    haloIntensity: Math.random(),
  };
});

const container = document.getElementById("container") as HTMLDivElement;

const renderer = new Sigma(graph, container, {
  nodeProgramClasses: {
    threeCircles: NodeThreeCirclesProgram,
    halo: NodeHaloProgram,
    heatmap: createNodeCompoundProgram([NodeHaloProgram, NodeCircleProgram]),
  },
  defaultNodeType: "heatmap",
});
