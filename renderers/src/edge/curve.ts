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

const vertexShaderSource = `
  attribute vec4 a_color;
  attribute vec2 a_normal;
  attribute vec2 a_position;
  attribute vec2 a_source;
  attribute vec2 a_target;

  uniform mat3 u_matrix;
  uniform float u_sqrtZoomRatio;
  uniform float u_correctionRatio;

  varying vec4 v_color;
  varying vec2 v_normal;
  varying float v_thickness;
  varying vec2 v_cpA;
  varying vec2 v_cpB;
  varying vec2 v_cpC;

  const float minThickness = 1.7;
  const float bias = 255.0 / 254.0;
  const float curveness = 0.3;

  void main() {
    float normalLength = length(a_normal);
    vec2 unitNormal = a_normal / normalLength;

    // We require edges to be at least "minThickness" pixels thick *on screen*
    // (so we need to compensate the SQRT zoom ratio):
    float pixelsThickness = max(normalLength, minThickness * u_sqrtZoomRatio);

    // Then, we need to retrieve the normalized thickness of the edge in the WebGL
    // referential (in a ([0, 1], [0, 1]) space), using our "magic" correction
    // ratio:
    float webGLThickness = pixelsThickness * u_correctionRatio;

    // Finally, we adapt the edge thickness to the "SQRT rule" in sigma (so that
    // items are not too big when zoomed in, and not too small when zoomed out).
    // The exact computation should be "adapted = value * zoom / sqrt(zoom)", but
    // it's simpler like this:
    float adaptedWebGLThickness = webGLThickness * u_sqrtZoomRatio;

    // Here is the proper position of the vertex
    gl_Position = vec4((u_matrix * vec3(a_position + unitNormal * adaptedWebGLThickness, 1)).xy, 0, 1);

    vec2 sourcePosition = (u_matrix * vec3(a_source, 1)).xy;
    vec2 targetPosition = (u_matrix * vec3(a_target, 1)).xy;

    v_cpA = sourcePosition;
    v_cpB = (u_matrix * vec3(0.5 * (a_source + a_target) + unitNormal * adaptedWebGLThickness * curveness, 1)).xy;
    v_cpC = targetPosition;

    // For the fragment shader though, we need a thickness that takes the "magic"
    // correction ratio into account (as in webGLThickness), but so that the
    // antialiasing effect does not depend on the zoom level. So here's yet
    // another thickness version:
    v_thickness = webGLThickness / u_sqrtZoomRatio;

    v_normal = unitNormal;
    v_color = a_color;
    v_color.a *= bias;
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  varying vec4 v_color;
  varying vec2 v_normal;
  varying vec2 v_cpA;
  varying vec2 v_cpB;
  varying vec2 v_cpC;
  varying float v_thickness;

  const float feather = 0.001;
  const vec4 transparent = vec4(0.0, 0.0, 0.0, 1.0);

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
    float dist = distToQuadraticBezierCurve(gl_FragCoord.xy, v_cpA, v_cpB, v_cpC);

    // float epsilon = 0.05;

    // gl_FragColor = mix(v_color, transparent, dist);
    gl_FragColor = vec4(dist, 1.0, 1.0, 1.0);

    // if (dist < v_thickness + epsilon) {
    //   float inCurve = 1. - smoothstep(v_thickness - epsilon, v_thickness + epsilon, dist);
    //   gl_FragColor = inCurve * vec4(v_color.rgb * v_color.a, v_color.a);
    // } else {
    //   discard;
    // }


    // dist = length(v_normal) * v_thickness;

    // float t = smoothstep(
    //   v_thickness - feather,
    //   v_thickness,
    //   dist
    // );

    // gl_FragColor = mix(v_color, transparent, t);
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
    gl.enableVertexAttribArray(this.colorLocation);

    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT, 0);
    gl.vertexAttribPointer(this.normalLocation, 2, gl.FLOAT, false, ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT, 8);
    gl.vertexAttribPointer(
      this.colorLocation,
      4,
      gl.UNSIGNED_BYTE,
      true,
      ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT,
      16,
    );
    gl.vertexAttribPointer(this.sourceLocation, 2, gl.FLOAT, false, ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT, 20);
    gl.vertexAttribPointer(this.targetLocation, 2, gl.FLOAT, false, ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT, 28);
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

    const thickness = 100,
      x1 = sourceData.x,
      y1 = sourceData.y,
      x2 = targetData.x,
      y2 = targetData.y,
      color = floatColor(data.color);

    // Computing normals
    const dx = x2 - x1,
      dy = y2 - y1;

    let len = dx * dx + dy * dy,
      n1 = 0,
      n2 = 0;

    if (len) {
      len = 1 / Math.sqrt(len);

      n1 = -dy * len * thickness;
      n2 = dx * len * thickness;
    }

    let i = POINTS * ATTRIBUTES * offset;

    const array = this.array;

    // First point
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = n1;
    array[i++] = n2;
    array[i++] = color;
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;

    // First point flipped
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = -n1;
    array[i++] = -n2;
    array[i++] = color;
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;

    // Second point
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = n1;
    array[i++] = n2;
    array[i++] = color;
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;

    // Second point flipped
    array[i++] = x2;
    array[i++] = y2;
    array[i++] = -n1;
    array[i++] = -n2;
    array[i++] = color;
    array[i++] = x1;
    array[i++] = y1;
    array[i++] = x2;
    array[i++] = y2;
  }

  render(params: RenderParams): void {
    if (this.hasNothingToRender()) return;

    const gl = this.gl;
    const program = this.program;

    gl.useProgram(program);

    gl.uniformMatrix3fv(this.matrixLocation, false, params.matrix);
    gl.uniform1f(this.sqrtZoomRatioLocation, Math.sqrt(params.ratio));
    gl.uniform1f(this.correctionRatioLocation, params.correctionRatio);

    // Drawing:
    gl.drawElements(gl.TRIANGLES, this.indicesArray.length, this.indicesType, 0);
  }
}
