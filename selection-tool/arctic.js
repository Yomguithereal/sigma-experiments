import {MultiUndirectedGraph} from 'graphology';
import Sigma from 'sigma';

import enhanceWithSelectionTool from './';

import ARCTIC_DATA from './arctic.json';

const GRAPH = MultiUndirectedGraph.from(ARCTIC_DATA);

const CONTAINER = document.getElementById('container');

const originalColors = {};

GRAPH.forEachNode((node, attr) => {
  originalColors[node] = attr.color;
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

renderer.on('rightClickNode', ({node, event}) => {
  event.preventDefault();
  alert(node);
});

window.renderer = renderer;
