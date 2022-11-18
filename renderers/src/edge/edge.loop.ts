import type { NodeDisplayData, EdgeDisplayData, RenderParams } from "sigma/types";
import NodeCircleProgram from "sigma/rendering/webgl/programs/node.circle";
import { EdgeProgram } from "sigma/rendering/webgl/programs/common/edge";
import { floatColor } from "sigma/utils";

interface EdgeDisplayDataWithLoopInformation extends EdgeDisplayData {
  offset?: number;
  angle?: number;
}

const VERTEX_SHADER_SOURCE = /*glsl*/ `
attribute vec2 a_position;
attribute float a_size;
attribute float a_thickness;
attribute float a_triangleVertexangle;
attribute float a_loopAngle;
attribute vec4 a_color;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_border;
varying float v_borderRatio;

const float bias = 255.0 / 254.0;
const float marginRatio = 1.05;
const float minThickness = 0.5;

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_triangleVertexangle), sin(a_triangleVertexangle));
  vec2 position = (
    a_position +
    diffVector * marginRatio +
    vec2(size / 2.0, size / 2.0) * vec2(cos(a_loopAngle), sin(a_loopAngle))
  );

  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  v_border = u_correctionRatio;
  v_borderRatio = 1.0 - max(minThickness, a_thickness) / a_size;
  v_diffVector = diffVector;
  v_radius = size / 2.0 / marginRatio;

  v_color = a_color;
  v_color.a *= bias;
}
`;

const FRAGMENT_SHADER_SOURCE = /*glsl*/ `
precision mediump float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_border;
varying float v_borderRatio;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float borderRadius = v_borderRatio * v_radius;
  float distToCenter = length(v_diffVector);

  // Out of disc
  if (distToCenter < borderRadius - v_border) {
    gl_FragColor = transparent;
  }
  // Antialiasing between outside and border
  else if (distToCenter < borderRadius) {
    gl_FragColor = mix(v_color, transparent, (borderRadius - distToCenter) / v_border);
  }
  // Border
  else if (distToCenter < v_radius - v_border) {
    gl_FragColor = v_color;
  }
  // Antialiasing between border and transparent middle
  else if (distToCenter < v_radius) {
    gl_FragColor = mix(transparent, v_color, (v_radius - distToCenter) / v_border);
  }
  // Else
  else {
    gl_FragColor = transparent;
  }
}

`;

const UNIFORMS = ["u_sizeRatio", "u_correctionRatio", "u_matrix"] as const;

const { FLOAT, UNSIGNED_BYTE } = WebGLRenderingContext;

export default class EdgeLoopProgram extends EdgeProgram<typeof UNIFORMS[number]> {
  static UPPER_LEFT_ANGLE = (3 * Math.PI) / 4;

  getDefinition() {
    return {
      VERTICES: 3,
      ARRAY_ITEMS_PER_VERTEX: 7,
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      UNIFORMS,
      ATTRIBUTES: [
        { name: "a_position", size: 2, type: FLOAT },
        { name: "a_size", size: 1, type: FLOAT },
        { name: "a_thickness", size: 1, type: FLOAT },
        { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_triangleVertexangle", size: 1, type: FLOAT },
        { name: "a_loopAngle", size: 1, type: FLOAT },
      ],
    };
  }

  processVisibleItem(
    i: number,
    sourceData: NodeDisplayData,
    targetData: NodeDisplayData,
    data: EdgeDisplayDataWithLoopInformation,
  ) {
    const array = this.array;

    const color = floatColor(data.color);
    const offset = typeof data.offset === "number" ? data.offset : 0;
    const loopSize = sourceData.size + offset;
    const loopAngle = typeof data.angle === "number" ? data.angle : EdgeLoopProgram.UPPER_LEFT_ANGLE;

    // TODO: edge thickness should not overcome source size - 1 else it is basically ugly

    array[i++] = sourceData.x;
    array[i++] = sourceData.y;
    array[i++] = loopSize;
    array[i++] = data.size;
    array[i++] = color;
    array[i++] = NodeCircleProgram.ANGLE_1;
    array[i++] = loopAngle;

    array[i++] = sourceData.x;
    array[i++] = sourceData.y;
    array[i++] = loopSize;
    array[i++] = data.size;
    array[i++] = color;
    array[i++] = NodeCircleProgram.ANGLE_2;
    array[i++] = loopAngle;

    array[i++] = sourceData.x;
    array[i++] = sourceData.y;
    array[i++] = loopSize;
    array[i++] = data.size;
    array[i++] = color;
    array[i++] = NodeCircleProgram.ANGLE_3;
    array[i++] = loopAngle;
  }

  draw(params: RenderParams): void {
    const gl = this.gl;

    const { u_sizeRatio, u_correctionRatio, u_matrix } = this.uniformLocations;

    gl.uniform1f(u_sizeRatio, params.sizeRatio);
    gl.uniform1f(u_correctionRatio, params.correctionRatio);
    gl.uniformMatrix3fv(u_matrix, false, params.matrix);

    gl.drawArrays(gl.TRIANGLES, 0, this.verticesCount);
  }
}
