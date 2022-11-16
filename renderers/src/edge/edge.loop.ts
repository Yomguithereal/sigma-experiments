import { NodeDisplayData, EdgeDisplayData } from "sigma/types";
import { floatColor } from "sigma/utils";
import { EdgeProgram } from "sigma/rendering/webgl/programs/common/edge";
import { RenderParams } from "sigma/rendering/webgl/programs/common/program";

const VERTEX_SHADER_SOURCE = /*glsl*/ `
attribute vec2 a_position;
attribute float a_size;
attribute float a_nodeSize;
attribute vec4 a_color;

uniform vec2 u_dimensions;
uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform mat3 u_matrix;

varying vec4 v_color;
varying float v_border;
varying float v_borderRatio;

vec2 clipspaceToViewport(vec2 pos, vec2 dimensions) {
  return vec2(
    (pos.x + 1.0) * dimensions.x / 2.0,
    (pos.y + 1.0) * dimensions.y / 2.0
  );
}

vec2 viewportToClipspace(vec2 pos, vec2 dimensions) {
  return vec2(
    pos.x / dimensions.x * 2.0 - 1.0,
    pos.y / dimensions.y * 2.0 - 1.0
  );
}

const float bias = 255.0 / 254.0;
const float theta = 0.78;
const float borderRatio = 0.1;

void main() {
  vec2 position = (u_matrix * vec3(a_position, 1)).xy;
  vec2 viewportPosition = clipspaceToViewport(position, u_dimensions);

  // Multiply the point size twice:
  //  - x SCALING_RATIO to correct the canvas scaling
  //  - x 2 to correct the formulae
  float nodeRadius = a_nodeSize / u_sizeRatio * u_pixelRatio;
  float loopRadius = a_size / u_sizeRatio * u_pixelRatio;

  gl_PointSize = loopRadius * 2.0;

  viewportPosition.x += loopRadius * cos(theta) * nodeRadius / nodeRadius;
  viewportPosition.y += loopRadius * sin(theta);
  // viewportPosition.y += (loopRadius/ 2.0 + nodeRadius);

  gl_Position = vec4(
    viewportToClipspace(viewportPosition, u_dimensions),
    0,
    1
  );

  v_border = (0.5 / a_size) * u_sizeRatio;
  v_borderRatio = 0.5 - borderRatio / 2.0;

  // Extract the color:
  v_color = a_color;
  v_color.a *= bias;
}
`;

const FRAGMENT_SHADER_SOURCE = /*glsl*/ `
precision mediump float;

varying vec4 v_color;
varying float v_border;
varying float v_borderRatio;

const float radius = 0.5;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float distToCenter = length(gl_PointCoord - vec2(0.5, 0.5));

  if (distToCenter < v_borderRatio - v_border)
    gl_FragColor = transparent;
  else if (distToCenter < v_borderRatio)
    gl_FragColor = mix(v_color, v_color, (v_borderRatio - distToCenter) / v_border);
  else if (distToCenter < radius - v_border)
    gl_FragColor = v_color;
  else if (distToCenter < radius)
    gl_FragColor = mix(transparent, v_color, (radius - distToCenter) / v_border);
  else
    gl_FragColor = transparent;
}
`;

const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext;

const UNIFORMS = ["u_sizeRatio", "u_pixelRatio", "u_matrix", "u_dimensions"] as const;

export default class EdgeLoopProgram extends EdgeProgram<typeof UNIFORMS[number]> {
  getDefinition() {
    return {
      VERTICES: 1,
      ARRAY_ITEMS_PER_VERTEX: 5,
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      UNIFORMS,
      ATTRIBUTES: [
        { name: "a_position", size: 2, type: FLOAT },
        { name: "a_size", size: 1, type: FLOAT },
        { name: "a_nodeSize", size: 1, type: FLOAT },
        { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
      ],
    };
  }

  processVisibleItem(i: number, sourceData: NodeDisplayData, targetData: NodeDisplayData, data: EdgeDisplayData) {
    const array = this.array;

    array[i++] = sourceData.x;
    array[i++] = sourceData.y;
    array[i++] = data.size;
    array[i++] = sourceData.size;
    array[i] = floatColor(data.color);
  }

  draw(params: RenderParams): void {
    const gl = this.gl;

    const { u_sizeRatio, u_pixelRatio, u_matrix, u_dimensions } = this.uniformLocations;

    gl.uniform1f(u_sizeRatio, params.sizeRatio);
    gl.uniform1f(u_pixelRatio, params.pixelRatio);
    gl.uniformMatrix3fv(u_matrix, false, params.matrix);
    gl.uniform2f(u_dimensions, params.width * params.pixelRatio, params.height * params.pixelRatio);

    gl.drawArrays(gl.POINTS, 0, this.verticesCount);
  }
}
