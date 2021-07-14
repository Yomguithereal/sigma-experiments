import {UndirectedGraph} from 'graphology';
import Sigma from 'sigma';
import palettes from 'iwanthue/precomputed';
import random from 'pandemonium/random';

import enhanceWithSelectionTool from './';

const NODES = [
  ['albert', 0, 0],
  ['vincent', 0, 1],
  ['jude', 1, 0],
  ['jade', 1, 1],
  ['hikram', 0.25, 0.25],
  ['haque', 0.25, 0.75],
  ['julius', 0.75, 0.25],
  ['vermina', 0.75, 0.75],
  ['abdul', 0.375, 0.375],
  ['shiva', 0.375, 0.625],
  ['noemie', 0.625, 0.375],
  ['lazarus', 0.625, 0.625]
];

const GRAPH = new UndirectedGraph();

const CONTAINER = document.getElementById('container');

const originalColors = {};

NODES.forEach(([key, x, y], i) => {
  const color = palettes[NODES.length][i];

  originalColors[key] = color;

  GRAPH.addNode(key, {
    x,
    y,
    label: key,
    color,
    size: random(3, 15)
  });
});

NODES.forEach(([key1], i) => {
  NODES.slice(i + 1).forEach(([key2]) => {
    GRAPH.addEdge(key1, key2);
  });
});

const renderer = new Sigma(GRAPH, CONTAINER);

enhanceWithSelectionTool(renderer, {
  borderStyle: '1px dashed red',
  debug: true
});

let SELECTED_NODES;

function cleanup() {
  if (!SELECTED_NODES) return;

  SELECTED_NODES.forEach(node => {
    GRAPH.setNodeAttribute(node, 'color', originalColors[node]);
  });
}

renderer.on('selectNodes', ({nodes}) => {
  cleanup();

  SELECTED_NODES = new Set(nodes);

  nodes.forEach(node => {
    GRAPH.setNodeAttribute(node, 'color', '#000');
  });
});

renderer.on('clickStage', cleanup);

window.renderer = renderer;
