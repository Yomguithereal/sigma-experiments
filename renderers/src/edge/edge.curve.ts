/**
 * Sigma.js WebGL Renderer Curved Edge Program
 * ============================================
 *
 * Program rendering edges as quadratic bezier curves.
 * @module
 */
import { floatColor, canUse32BitsIndices } from "sigma/utils";
import { EdgeDisplayData, NodeDisplayData } from "sigma/types";
import { AbstractEdgeProgram } from "sigma/rendering/webgl/programs/common/edge";
import { RenderParams } from "sigma/rendering/webgl/programs/common/program";

const POINTS = 4;
const ATTRIBUTES = 9;
const STRIDE = POINTS * ATTRIBUTES;

const vertexShaderSource = `#version 300 es
  in vec4 a_color;
  in vec2 a_normal;
  in vec2 a_position;
  in vec2 a_source;
  in vec2 a_target;

  uniform mat3 u_matrix;
  uniform float u_sqrtZoomRatio;
  uniform float u_correctionRatio;
  uniform vec2 u_dimensions;

  out vec4 v_color;
  out vec2 v_normal;
  out float v_thickness;
  out vec2 v_cpA;
  out vec2 v_cpB;
  out vec2 v_cpC;
  out float strokeWidth;

  const float minThickness = 1.7;
  const float bias = 255.0 / 254.0;
  const float curveness = 0.3;

  // Sigma's internal ones
  // vec2 clipspaceToViewport(vec2 pos, vec2 dimensions) {
  //   return vec2(
  //     ((1.0 + pos.x) * dimensions.x) / 2.0,
  //     ((1.0 - pos.y) * dimensions.y) / 2.0
  //   );
  // }

  // vec2 viewportToClipspace(vec2 pos, vec2 dimensions) {
  //   return vec2(
  //     (pos.x / dimensions.x) * 2.0 - 1.0,
  //     1.0 - (pos.y / dimensions.y) * 2.0
  //   );
  // }

  // Suited to webgl
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
    vec2 position = (u_matrix * vec3(a_position, 1)).xy;
    vec2 source = (u_matrix * vec3(a_source, 1)).xy;
    vec2 target = (u_matrix * vec3(a_target, 1)).xy;

    vec2 viewportPosition = clipspaceToViewport(position, u_dimensions);
    vec2 viewportSource = clipspaceToViewport(source, u_dimensions);
    vec2 viewportTarget = clipspaceToViewport(target, u_dimensions);

    vec2 delta = viewportTarget.xy - viewportSource.xy;
    float len = length(delta);
    vec2 normal = vec2(-delta.y, delta.x) * -sign(a_normal.x);
    vec2 unitNormal = normalize(normal);
    float thickness = len * curveness;

    strokeWidth = 10.0 / u_sqrtZoomRatio;

    // TODO: can be implemented without branching
    if (sign(a_normal.x) < 1.0)
    viewportPosition += unitNormal * (thickness / 2.0 + strokeWidth);
    position = viewportToClipspace(viewportPosition, u_dimensions);

    gl_Position = vec4(position, 0, 1);

    v_cpA = viewportSource;
    v_cpB = 0.5 * (viewportSource + viewportTarget);
    v_cpC = viewportTarget;

    v_cpB += unitNormal * -sign(a_normal.x) * thickness;

    v_color = a_color;
    v_color.a *= u_correctionRatio;
    v_color.a /= u_correctionRatio;
    v_color.a *= bias;
  }
`;

const fragmentShaderSource = `#version 300 es
  precision highp float;

  in float strokeWidth;
  in vec4 v_color;
  in vec2 v_normal;
  in vec2 v_cpA;
  in vec2 v_cpB;
  in vec2 v_cpC;
  in float v_thickness;
  out vec4 fragColor;

  const float feather = 0.001;
  const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.1);
  const float epsilon = 0.001;

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

  void main(void) {
    fragColor = v_color;
    // return;

    float dist = distToQuadraticBezierCurve(gl_FragCoord.xy, v_cpA, v_cpB, v_cpC);

    float epsilon = 0.5;

    // gl_FragColor = mix(v_color, transparent, dist);
    // fragColor = vec4(dist, dist, dist, 1.0);
    // return;

    if (dist < strokeWidth + epsilon) {
      float inCurve = 1.0 - smoothstep(strokeWidth - epsilon, strokeWidth + epsilon, dist);
      fragColor = inCurve * vec4(v_color.rgb * v_color.a, v_color.a);
    } else {
      fragColor = transparent;
    }


    // dist = length(v_normal) * v_thickness;

    // float t = smoothstep(
    //   v_thickness - feather,
    //   v_thickness,
    //   dist
    // );

    // fragColor = mix(v_color, transparent, t);
  }
`;

export default class EdgeCurveProgram extends AbstractEdgeProgram {
  IndicesArray: Uint32ArrayConstructor | Uint16ArrayConstructor;
  indicesArray: Uint32Array | Uint16Array;
  indicesBuffer: WebGLBuffer;
  indicesType: GLenum;
  canUse32BitsIndices: boolean;
  positionLocation: GLint;
  colorLocation: GLint;
  normalLocation: GLint;
  sourceLocation: GLint;
  targetLocation: GLint;
  matrixLocation: WebGLUniformLocation;
  sqrtZoomRatioLocation: WebGLUniformLocation;
  correctionRatioLocation: WebGLUniformLocation;
  dimensionsLocation: WebGLUniformLocation;

  constructor(gl: WebGLRenderingContext) {
    super(gl, vertexShaderSource, fragmentShaderSource, POINTS, ATTRIBUTES);

    // Initializing indices buffer
    const indicesBuffer = gl.createBuffer();
    if (indicesBuffer === null) throw new Error("EdgeProgram: error while creating indicesBuffer");
    this.indicesBuffer = indicesBuffer;

    // Locations
    this.positionLocation = gl.getAttribLocation(this.program, "a_position");
    this.colorLocation = gl.getAttribLocation(this.program, "a_color");
    this.normalLocation = gl.getAttribLocation(this.program, "a_normal");
    this.sourceLocation = gl.getAttribLocation(this.program, "a_source");
    this.targetLocation = gl.getAttribLocation(this.program, "a_target");

    const matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
    if (matrixLocation === null) throw new Error("EdgeProgram: error while getting matrixLocation");
    this.matrixLocation = matrixLocation;

    const correctionRatioLocation = gl.getUniformLocation(this.program, "u_correctionRatio");
    if (correctionRatioLocation === null) throw new Error("EdgeProgram: error while getting correctionRatioLocation");
    this.correctionRatioLocation = correctionRatioLocation;

    const sqrtZoomRatioLocation = gl.getUniformLocation(this.program, "u_sqrtZoomRatio");
    if (sqrtZoomRatioLocation === null) throw new Error("EdgeProgram: error while getting sqrtZoomRatioLocation");
    this.sqrtZoomRatioLocation = sqrtZoomRatioLocation;

    const dimensionsLocation = gl.getUniformLocation(this.program, "u_dimensions");
    if (dimensionsLocation === null) throw new Error("EdgeProgram: error while getting dimensionsLocation");
    this.dimensionsLocation = dimensionsLocation;

    // Enabling the OES_element_index_uint extension
    // NOTE: on older GPUs, this means that really large graphs won't
    // have all their edges rendered. But it seems that the
    // `OES_element_index_uint` is quite everywhere so we'll handle
    // the potential issue if it really arises.
    // NOTE: when using webgl2, the extension is enabled by default
    this.canUse32BitsIndices = canUse32BitsIndices(gl);
    this.IndicesArray = this.canUse32BitsIndices ? Uint32Array : Uint16Array;
    this.indicesArray = new this.IndicesArray();
    this.indicesType = this.canUse32BitsIndices ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

    this.bind();
  }

  bind(): void {
    const gl = this.gl;

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indicesBuffer);

    // Bindings
    gl.enableVertexAttribArray(this.positionLocation);
    gl.enableVertexAttribArray(this.normalLocation);
    gl.enableVertexAttribArray(this.sourceLocation);
    gl.enableVertexAttribArray(this.targetLocation);
    gl.enableVertexAttribArray(this.colorLocation);

    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT, 0);
    gl.vertexAttribPointer(this.normalLocation, 2, gl.FLOAT, false, ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT, 8);
    gl.vertexAttribPointer(this.sourceLocation, 2, gl.FLOAT, false, ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT, 16);
    gl.vertexAttribPointer(this.targetLocation, 2, gl.FLOAT, false, ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT, 24);
    gl.vertexAttribPointer(
      this.colorLocation,
      4,
      gl.UNSIGNED_BYTE,
      true,
      ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT,
      32,
    );
  }

  computeIndices(): void {
    const l = this.array.length / ATTRIBUTES;
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

  bufferData(): void {
    super.bufferData();

    // Indices data
    const gl = this.gl;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indicesArray, gl.STATIC_DRAW);
  }

  process(
    sourceData: NodeDisplayData,
    targetData: NodeDisplayData,
    data: EdgeDisplayData,
    hidden: boolean,
    offset: number,
  ): void {
    if (hidden) {
      for (let i = offset * STRIDE, l = i + STRIDE; i < l; i++) this.array[i] = 0;
      return;
    }

    const x1 = sourceData.x,
      y1 = sourceData.y,
      x2 = targetData.x,
      y2 = targetData.y,
      color = floatColor(data.color);

    // Computing normals
    // const dx = x2 - x1,
    //   dy = y2 - y1;

    // let len = dx * dx + dy * dy,
    //   n1 = 0,
    //   n2 = 0;

    // if (len) {
    //   len = 1 / Math.sqrt(len);

    //   n1 = -dy * len * thickness;
    //   n2 = dx * len * thickness;
    // }

    let i = POINTS * ATTRIBUTES * offset;

    const array = this.array;

    // First point
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = 1;
    array[i++] = 1;
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = color;

    // First point flipped
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = -1;
    array[i++] = -1;
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = color;

    // Second point
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = 1;
    array[i++] = 1;
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = color;

    // Second point flipped
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = -1;
    array[i++] = -1;
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = color;
  }

  render(params: RenderParams): void {
    if (this.hasNothingToRender()) return;

    const gl = this.gl;
    const program = this.program;

    gl.useProgram(program);

    gl.uniformMatrix3fv(this.matrixLocation, false, params.matrix);
    gl.uniform1f(this.sqrtZoomRatioLocation, Math.sqrt(params.ratio));
    gl.uniform1f(this.correctionRatioLocation, params.correctionRatio);
    gl.uniform2f(this.dimensionsLocation, params.width * params.scalingRatio, params.height * params.scalingRatio);

    // Drawing:
    gl.drawElements(gl.TRIANGLES, this.indicesArray.length, this.indicesType, 0);
  }
}
