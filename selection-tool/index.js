var DEFAULTS = {
  debug: false,
  zIndex: 1000,
  borderStyle: '1px dashed gray'
};

// Function used to check collision between a selection rectangle and the nodes as circles
// Circle = {x, y, r}
// Rectangle = {x, y, w, h}
function checkCollision(circle, rect) {
  var distX = Math.abs(circle.x - rect.x - rect.w / 2);
  var distY = Math.abs(circle.y - rect.y - rect.h / 2);

  if (distX > rect.w / 2 + circle.r) return false;
  if (distY > rect.h / 2 + circle.r) return false;

  if (distX <= rect.w / 2) return true;
  if (distY <= rect.h / 2) return true;

  var dx = distX - rect.w / 2;
  var dy = distY - rect.h / 2;

  return dx * dx + dy * dy <= circle.r * circle.r;
}

// The plugin function "enhancing" the given renderer
function enhanceWithSelectionTool(renderer, settings) {
  settings = settings || {};

  var zIndex = settings.zIndex || DEFAULTS.zIndex;
  var borderStyle = settings.borderStyle || DEFAULTS.borderStyle;
  var debug = settings.debug === true;

  // Members
  var camera = renderer.getCamera();
  var mouse = renderer.getMouseCaptor();
  var graph = renderer.graph;

  var maxNodeSize = -Infinity;

  graph.forEachNode(function (node, attr) {
    if (attr.size > maxNodeSize) maxNodeSize = attr.size;
  });

  // State
  var state = {
    isSelecting: false,
    xStart: 0,
    yStart: 0,
    xCurrent: 0,
    yCurrent: 0
  };

  // Injecting selection div
  var selectionDiv = document.createElement('div');
  selectionDiv.style.display = 'none';
  selectionDiv.style.zIndex = '' + zIndex;
  selectionDiv.style.position = 'relative';
  selectionDiv.style.border = borderStyle;

  var container = renderer.container;

  container.appendChild(selectionDiv);

  function getRectangle() {
    var x1 = state.xStart;
    var y1 = state.yStart;

    var x2 = state.xCurrent;
    var y2 = state.yCurrent;

    var x3 = Math.min(x1, x2);
    var y3 = Math.min(y1, y2);

    var x4 = Math.max(x1, x2);
    var y4 = Math.max(y1, y2);

    return {
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      x3: x3,
      y3: y3,
      x4: x4,
      y4: y4,
      width: x4 - x3,
      height: y4 - y3
    };
  }

  function updateSelectionDiv() {
    var rectangle = getRectangle();

    selectionDiv.style.left = rectangle.x3 + 'px';
    selectionDiv.style.top = rectangle.y3 + 'px';
    selectionDiv.style.width = rectangle.width + 'px';
    selectionDiv.style.height = rectangle.height + 'px';
  }

  function offset(el) {
    var rect = el.getBoundingClientRect();

    return {
      top: rect.top + document.documentElement.scrollTop,
      left: rect.left + document.documentElement.scrollLeft
    };
  }

  function getEventX(event) {
    if (event.original) event = event.original;

    return event.pageX - offset(container).left;
  }

  function getEventY(event) {
    if (event.original) event = event.original;

    return event.pageY - offset(container).top;
  }

  // Events
  var downStageListener = function ({event}) {
    // We only trigger if the shift key was pressed
    if (!event.shiftKey) return;

    camera.disable();
    state.isSelecting = true;
    state.xStart = getEventX(event);
    state.yStart = getEventY(event);
    state.xCurrent = state.xStart;
    state.yCurrent = state.yStart;

    selectionDiv.style.display = 'block';
    updateSelectionDiv(event);
  };

  var mouseupListener = function () {
    if (!state.isSelecting) return;

    camera.enable();
    state.isSelecting = false;
    selectionDiv.style.display = 'none';

    var rectangle = getRectangle();

    var p1 = {x: rectangle.x3 - maxNodeSize, y: rectangle.y3 - maxNodeSize};
    var p2 = {x: p1.x + rectangle.width + maxNodeSize, y: p1.y};
    var h = {x: p1.x, y: p1.y + rectangle.height + maxNodeSize};

    p1 = camera.viewportToFramedGraph(renderer, {x: p1.x, y: p1.y});
    p2 = camera.viewportToFramedGraph(renderer, {x: p2.x, y: p2.y});
    h = camera.viewportToFramedGraph(renderer, {x: h.x, y: h.y});

    h = p2.y - h.y;

    var nodes = renderer.quadtree.rectangle(p1.x, 1 - p1.y, p2.x, 1 - p2.y, h);

    if (debug) {
      console.group('Collision');
      console.log('Quadtree nodes:', nodes);
    }

    // Now we need to actually check collisions
    var sizeRatio = Math.pow(camera.getState().ratio, 0.5); // NOTE: actual rendered size is divided by ratio

    var collisionRectangle = {
      x: rectangle.x3,
      y: rectangle.y3,
      w: rectangle.width,
      h: rectangle.height
    };

    nodes = nodes.filter(function (node) {
      var attr = renderer.nodeDataCache[node];

      var nodePosition = camera.framedGraphToViewport(renderer, {x: attr.x, y: attr.y});

      var size = attr.size / sizeRatio;

      var collisionCircle = {
        r: size,
        x: nodePosition.x,
        y: nodePosition.y
      };

      return checkCollision(collisionCircle, collisionRectangle);
    });

    if (debug) {
      console.log('Actual nodes:', nodes);
      console.groupEnd('Collision');
    }

    renderer.emit('selectNodes', {nodes: nodes});
  };

  var mousemoveListener = function (event) {
    if (!state.isSelecting) return;

    state.xCurrent = getEventX(event);
    state.yCurrent = getEventY(event);

    updateSelectionDiv(event);
  };

  renderer.on('downStage', downStageListener);
  renderer.on('downNode', downStageListener);
  mouse.on('mouseup', mouseupListener);
  mouse.on('mousemove', mousemoveListener);
  selectionDiv.addEventListener('mousemove', mousemoveListener);

  // Cleanup
  var cleanup = function () {
    selectionDiv.removeEventListener('mousemove', mousemoveListener);
    container.removeChild(selectionDiv);
    renderer.removeListener('downStage', downStageListener);
  };

  renderer.on('kill', cleanup);

  return cleanup;
}

module.exports = enhanceWithSelectionTool;
