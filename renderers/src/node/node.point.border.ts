// Original author: @jacomyal
// A node renderer using one point to render a circle with a variable size
// border and a variable color.
// Note that this program is able to take both a size or a ratio.
import type { NodeDisplayData } from "sigma/types";
import NodePointProgram from "sigma/rendering/webgl/programs/node.point";
import { floatColor } from "sigma/utils";

interface NodeDisplayDataWithBorder extends NodeDisplayData {
  borderColor?: string;
  borderRatio?: number;
  borderSize?: number;
}

const VERTEX_SHADER_SOURCE = /*glsl*/ `
attribute vec2 a_position;
attribute float a_size;
attribute vec4 a_color;
attribute vec4 a_borderColor;
attribute float a_borderRatio;

uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform mat3 u_matrix;

varying vec4 v_color;
varying vec4 v_borderColor;
varying float v_border;
varying float v_borderRatio;

const float bias = 255.0 / 254.0;

void main() {
  gl_Position = vec4(
    (u_matrix * vec3(a_position, 1)).xy,
    0,
    1
  );

  // Multiply the point size twice:
  //  - x SCALING_RATIO to correct the canvas scaling
  //  - x 2 to correct the formulae
  gl_PointSize = a_size / u_sizeRatio * u_pixelRatio * 2.0;

  v_border = (0.5 / a_size) * u_sizeRatio;

  // Extract the color:
  v_color = a_color;
  v_color.a *= bias;

  v_borderColor = a_borderColor;
  v_borderColor.a *= bias;

  v_borderRatio = 0.5 - a_borderRatio / 2.0;
}
`;

const FRAGMENT_SHADER_SOURCE = /*glsl*/ `
precision mediump float;

varying vec4 v_color;
varying vec4 v_borderColor;
varying float v_border;
varying float v_borderRatio;

const float radius = 0.5;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float distToCenter = length(gl_PointCoord - vec2(0.5, 0.5));

  if (distToCenter < v_borderRatio - v_border)
    gl_FragColor = v_color;
  else if (distToCenter < v_borderRatio)
    gl_FragColor = mix(v_borderColor, v_color, (v_borderRatio - distToCenter) / v_border);
  else if (distToCenter < radius - v_border)
    gl_FragColor = v_borderColor;
  else if (distToCenter < radius)
    gl_FragColor = mix(transparent, v_borderColor, (radius - distToCenter) / v_border);
  else
    gl_FragColor = transparent;
}
`;

const { FLOAT, UNSIGNED_BYTE } = WebGLRenderingContext;

const DEFAULT_NODE_BORDER_COLOR = "#7a7a7a";
const DEFAULT_NODE_BORDER_RATIO = 0.1;

export default class NodePointWithBorderProgram extends NodePointProgram {
  getDefinition() {
    return {
      ...super.getDefinition(),
      ARRAY_ITEMS_PER_VERTEX: 6,
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      ATTRIBUTES: [
        { name: "a_position", size: 2, type: FLOAT },
        { name: "a_size", size: 1, type: FLOAT },
        { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_borderColor", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_borderRatio", size: 1, type: FLOAT },
      ],
    };
  }

  processVisibleItem(i: number, data: NodeDisplayDataWithBorder) {
    const array = this.array;

    let borderRatio = typeof data.borderRatio !== "number" ? DEFAULT_NODE_BORDER_RATIO : data.borderRatio;

    // borderSize takes precedence
    if (typeof data.borderSize === "number") {
      borderRatio = data.borderSize / data.size;
    }

    array[i++] = data.x;
    array[i++] = data.y;
    array[i++] = data.size;
    array[i++] = floatColor(data.color);
    array[i++] = floatColor(data.borderColor || DEFAULT_NODE_BORDER_COLOR);
    array[i] = borderRatio;
  }
}
