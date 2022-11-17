/**
 * Sigma.js WebGL Renderer Curved Edge Program
 * ============================================
 *
 * Program rendering edges as quadratic bezier curves.
 * @module
 */
import { NodeDisplayData, EdgeDisplayData } from "sigma/types";
import { floatColor } from "sigma/utils";
import { EdgeProgram } from "sigma/rendering/webgl/programs/common/edge";
import { RenderParams } from "sigma/rendering/webgl/programs/common/program";

interface EdgeDisplayDataWithCurveness extends EdgeDisplayData {
  curveness?: number;
}

const VERTEX_SHADER_SOURCE = /*glsl*/ `
attribute vec4 a_color;
attribute float a_direction;
attribute float a_thickness;
attribute vec2 a_source;
attribute vec2 a_target;
attribute float a_current;
attribute float a_curveness;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform vec2 u_dimensions;

varying vec4 v_color;
varying float v_thickness;
varying vec2 v_cpA;
varying vec2 v_cpB;
varying vec2 v_cpC;

const float bias = 255.0 / 254.0;
const float epsilon = 0.7;
const float minThickness = 0.3;

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

void main() {

  // Selecting the correct position
  // Branchless "position = a_source if a_current == 1.0 else a_target"
  vec2 position = a_source * max(0.0, a_current) + a_target * max(0.0, 1.0 - a_current);
  position = (u_matrix * vec3(position, 1)).xy;

  vec2 source = (u_matrix * vec3(a_source, 1)).xy;
  vec2 target = (u_matrix * vec3(a_target, 1)).xy;

  vec2 viewportPosition = clipspaceToViewport(position, u_dimensions);
  vec2 viewportSource = clipspaceToViewport(source, u_dimensions);
  vec2 viewportTarget = clipspaceToViewport(target, u_dimensions);

  vec2 delta = viewportTarget.xy - viewportSource.xy;
  float len = length(delta);
  vec2 normal = vec2(-delta.y, delta.x) * a_direction;
  vec2 unitNormal = normal / len;
  float boundingBoxThickness = len * a_curveness;
  float curveThickness = max(minThickness, a_thickness / 2.0 / u_sizeRatio * u_pixelRatio);

  v_thickness = curveThickness;

  v_cpA = viewportSource;
  v_cpB = 0.5 * (viewportSource + viewportTarget) + unitNormal * a_direction * boundingBoxThickness;
  v_cpC = viewportTarget;

  vec2 viewportOffsetPosition = (
    viewportPosition +
    unitNormal * (boundingBoxThickness / 2.0 + curveThickness + epsilon) *
    max(0.0, a_direction) // NOTE: cutting the bounding box in half to avoid overdraw
  );

  position = viewportToClipspace(viewportOffsetPosition, u_dimensions);
  gl_Position = vec4(position, 0, 1);

  v_color = a_color;
  v_color.a *= bias;
}
`;

const FRAGMENT_SHADER_SOURCE = /*glsl*/ `
precision mediump float;

varying vec4 v_color;
varying float v_thickness;
varying vec2 v_cpA;
varying vec2 v_cpB;
varying vec2 v_cpC;

float det(vec2 a, vec2 b) {
  return a.x * b.y - b.x * a.y;
}

vec2 get_distance_vector(vec2 b0, vec2 b1, vec2 b2) {
  float a = det(b0, b2), b = 2.0 * det(b1, b0), d = 2.0 * det(b2, b1);
  float f = b * d - a * a;
  vec2 d21 = b2 - b1, d10 = b1 - b0, d20 = b2 - b0;
  vec2 gf = 2.0 * (b * d21 + d * d10 + a * d20);
  gf = vec2(gf.y, -gf.x);
  vec2 pp = -f * gf / dot(gf, gf);
  vec2 d0p = b0 - pp;
  float ap = det(d0p, d20), bp = 2.0 * det(d10, d0p);
  float t = clamp((ap + bp) / (2.0 * a + b + d), 0.0, 1.0);
  return mix(mix(b0, b1, t), mix(b1, b2, t), t);
}

float distToQuadraticBezierCurve(vec2 p, vec2 b0, vec2 b1, vec2 b2) {
  return length(get_distance_vector(b0 - p, b1 - p, b2 - p));
}

const float epsilon = 0.7;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float dist = distToQuadraticBezierCurve(gl_FragCoord.xy, v_cpA, v_cpB, v_cpC);

  if (dist < v_thickness + epsilon) {
    float inCurve = 1.0 - smoothstep(v_thickness - epsilon, v_thickness + epsilon, dist);
    gl_FragColor = inCurve * vec4(v_color.rgb * v_color.a, v_color.a);
  } else {
    gl_FragColor = transparent;
  }
}
`;

const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext;

const UNIFORMS = ["u_matrix", "u_sizeRatio", "u_dimensions", "u_pixelRatio"] as const;

const DEFAULT_EDGE_CURVENESS = 0.25;

export default class EdgeCurveProgram extends EdgeProgram<typeof UNIFORMS[number]> {
  getDefinition() {
    return {
      VERTICES: 4,
      ARRAY_ITEMS_PER_VERTEX: 9,
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      UNIFORMS,
      ATTRIBUTES: [
        { name: "a_source", size: 2, type: FLOAT },
        { name: "a_target", size: 2, type: FLOAT },
        { name: "a_current", size: 1, type: FLOAT }, // TODO: can be a byte or a bool
        { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_direction", size: 1, type: FLOAT }, // TODO: can be a byte or a bool
        { name: "a_thickness", size: 1, type: FLOAT },
        { name: "a_curveness", size: 1, type: FLOAT },
      ],
    };
  }

  reallocateIndices() {
    const l = this.verticesCount;
    const size = l + l / 2;
    const indices = new this.IndicesArray(size);

    for (let i = 0, c = 0; i < l; i += 4) {
      indices[c++] = i;
      indices[c++] = i + 1;
      indices[c++] = i + 2;
      indices[c++] = i + 2;
      indices[c++] = i + 1;
      indices[c++] = i + 3;
    }

    this.indicesArray = indices;
  }

  processVisibleItem(
    i: number,
    sourceData: NodeDisplayData,
    targetData: NodeDisplayData,
    data: EdgeDisplayDataWithCurveness,
  ) {
    const thickness = data.size || 1;
    const x1 = sourceData.x;
    const y1 = sourceData.y;
    const x2 = targetData.x;
    const y2 = targetData.y;
    const color = floatColor(data.color);
    const curveness = typeof data.curveness === "number" ? data.curveness : DEFAULT_EDGE_CURVENESS;

    const array = this.array;

    // First point
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = 0;
    array[i++] = color;
    array[i++] = 1;
    array[i++] = thickness;
    array[i++] = curveness;

    // First point flipped
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = 0;
    array[i++] = color;
    array[i++] = -1;
    array[i++] = thickness;
    array[i++] = curveness;

    // Second point
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = 1;
    array[i++] = color;
    array[i++] = 1;
    array[i++] = thickness;
    array[i++] = curveness;

    // Second point flipped
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = 1;
    array[i++] = color;
    array[i++] = -1;
    array[i++] = thickness;
    array[i++] = curveness;
  }

  draw(params: RenderParams): void {
    const gl = this.gl;

    const { u_matrix, u_sizeRatio, u_dimensions, u_pixelRatio } = this.uniformLocations;

    gl.uniformMatrix3fv(u_matrix, false, params.matrix);
    gl.uniform1f(u_pixelRatio, params.pixelRatio);
    gl.uniform1f(u_sizeRatio, params.sizeRatio);
    gl.uniform2f(u_dimensions, params.width * params.pixelRatio, params.height * params.pixelRatio);

    if (!this.indicesArray) throw new Error("EdgeCurveProgram: indicesArray should be allocated when drawing!");

    gl.drawElements(gl.TRIANGLES, this.indicesArray.length, this.indicesType, 0);
  }
}
