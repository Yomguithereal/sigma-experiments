import { NodeDisplayData } from "sigma/types";
import { floatColor } from "sigma/utils";
import { AbstractProgram, RenderParams } from "sigma/rendering/webgl/programs/common/program";

const vertexShaderSource = `
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;
attribute vec4 a_color;
attribute vec4 a_insideColor;
attribute vec4 a_dotColor;

uniform mat3 u_matrix;
uniform float u_sqrtZoomRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_border;

varying vec4 v_insideColor;
varying vec4 v_dotColor;

const float bias = 255.0 / 254.0;
const float marginRatio = 1.05;

void main() {
  float size = a_size * u_correctionRatio * u_sqrtZoomRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector * marginRatio;
  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  v_border = u_sqrtZoomRatio * u_sqrtZoomRatio / a_size / 50.0;
  v_diffVector = diffVector;
  v_radius = size / 2.0 / marginRatio;

  v_color = a_color;
  v_color.a *= bias;
  v_insideColor = a_insideColor;
  v_insideColor.a *= bias;
  v_dotColor = a_dotColor;
  v_dotColor.a *= bias;
}
`;

const fragmentShaderSource = `
precision mediump float;

varying vec4 v_color;
varying vec4 v_dotColor;
varying vec4 v_insideColor;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_border;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float halfRadius = 0.7 * v_radius;
  float dotRadius = 0.3 * v_radius;
  float distToCenter = length(v_diffVector);

  // Inner dot
  if (distToCenter < dotRadius - v_border) {
    gl_FragColor = v_dotColor;
  }
  // Antialiasing between the dot and the inner disc
  else if (distToCenter < dotRadius) {
    gl_FragColor = mix(v_insideColor, v_dotColor, (dotRadius - distToCenter) / v_border);
  }
  // Outer disc
  else // Inner disc
  if (distToCenter < halfRadius - v_border) {
    gl_FragColor = v_insideColor;
  }
  // Antialiasing between the two disc
  else if (distToCenter < halfRadius) {
    gl_FragColor = mix(v_color, v_insideColor, (halfRadius - distToCenter) / v_border);
  }
  // Outer disc
  else if (distToCenter < v_radius - v_border) {
    gl_FragColor = v_color;
  }
  // Antialiasing between outer disc and the outside
  else if (distToCenter < v_radius) {
    gl_FragColor = mix(transparent, v_color, (v_radius - distToCenter) / v_border);
  }
  // Outside the node
  else {
    gl_FragColor = transparent;
  }

}
`;

const POINTS = 3;
const ATTRIBUTES = 7;

const ANGLE_1 = 0;
const ANGLE_2 = (2 * Math.PI) / 3;
const ANGLE_3 = (4 * Math.PI) / 3;

export default class NodeThreeCircles extends AbstractProgram {
  positionLocation: GLint;
  sizeLocation: GLint;
  colorLocation: GLint;
  angleLocation: GLint;

  // custom
  insideColorLocation: GLint;
  dotColorLocation: GLint;

  matrixLocation: WebGLUniformLocation;
  sqrtZoomRatioLocation: WebGLUniformLocation;
  correctionRatioLocation: WebGLUniformLocation;

  constructor(gl: WebGLRenderingContext) {
    super(gl, vertexShaderSource, fragmentShaderSource, POINTS, ATTRIBUTES);

    // Locations
    this.positionLocation = gl.getAttribLocation(this.program, "a_position");
    this.sizeLocation = gl.getAttribLocation(this.program, "a_size");
    this.colorLocation = gl.getAttribLocation(this.program, "a_color");
    this.angleLocation = gl.getAttribLocation(this.program, "a_angle");
    //custom
    this.insideColorLocation = gl.getAttribLocation(this.program, "a_insideColor");
    this.dotColorLocation = gl.getAttribLocation(this.program, "a_dotColor");

    // Uniform Location
    const matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
    if (matrixLocation === null) throw new Error("NodeProgram: error while getting matrixLocation");
    this.matrixLocation = matrixLocation;

    const sqrtZoomRatioLocation = gl.getUniformLocation(this.program, "u_sqrtZoomRatio");
    if (sqrtZoomRatioLocation === null) throw new Error("NodeProgram: error while getting sqrtZoomRatioLocation");
    this.sqrtZoomRatioLocation = sqrtZoomRatioLocation;

    const correctionRatioLocation = gl.getUniformLocation(this.program, "u_correctionRatio");
    if (correctionRatioLocation === null) throw new Error("NodeProgram: error while getting correctionRatioLocation");
    this.correctionRatioLocation = correctionRatioLocation;

    this.bind();
  }

  bind(): void {
    const gl = this.gl;

    gl.enableVertexAttribArray(this.positionLocation);
    gl.enableVertexAttribArray(this.sizeLocation);
    gl.enableVertexAttribArray(this.colorLocation);
    gl.enableVertexAttribArray(this.angleLocation);
    // custom
    gl.enableVertexAttribArray(this.insideColorLocation);
    gl.enableVertexAttribArray(this.dotColorLocation);

    gl.vertexAttribPointer(
      this.positionLocation,
      2,
      gl.FLOAT,
      false,
      this.attributes * Float32Array.BYTES_PER_ELEMENT,
      0,
    );
    gl.vertexAttribPointer(this.sizeLocation, 1, gl.FLOAT, false, this.attributes * Float32Array.BYTES_PER_ELEMENT, 8);
    gl.vertexAttribPointer(
      this.colorLocation,
      4,
      gl.UNSIGNED_BYTE,
      true,
      this.attributes * Float32Array.BYTES_PER_ELEMENT,
      12,
    );
    gl.vertexAttribPointer(
      this.angleLocation,
      1,
      gl.FLOAT,
      false,
      this.attributes * Float32Array.BYTES_PER_ELEMENT,
      16,
    );
    // custom
    gl.vertexAttribPointer(
      this.insideColorLocation,
      4,
      gl.UNSIGNED_BYTE,
      true,
      ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT,
      20,
    );
    gl.vertexAttribPointer(
      this.dotColorLocation,
      4,
      gl.UNSIGNED_BYTE,
      true,
      ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT,
      24,
    );
  }

  process(data: NodeDisplayData & { dotColor: string; insideColor: string }, hidden: boolean, offset: number): void {
    const color = floatColor(data.color);

    // custom
    const insideColor = floatColor(data.insideColor || data.color);
    const dotColor = floatColor(data.dotColor || data.insideColor || data.color);

    let i = offset * POINTS * ATTRIBUTES;
    const array = this.array;

    if (hidden) {
      array[i++] = 0;
      array[i++] = 0;
      array[i++] = 0;
      array[i++] = 0;
      array[i++] = 0;
      // custom
      array[i++] = 0;
      array[i++] = 0;

      return;
    }

    array[i++] = data.x;
    array[i++] = data.y;
    array[i++] = data.size;
    array[i++] = color;
    array[i++] = ANGLE_1;
    // custom
    array[i++] = insideColor;
    array[i++] = dotColor;

    array[i++] = data.x;
    array[i++] = data.y;
    array[i++] = data.size;
    array[i++] = color;
    array[i++] = ANGLE_2;
    // custom
    array[i++] = insideColor;
    array[i++] = dotColor;

    array[i++] = data.x;
    array[i++] = data.y;
    array[i++] = data.size;
    array[i++] = color;
    array[i++] = ANGLE_3;
    // custom
    array[i++] = insideColor;
    array[i++] = dotColor;
  }

  bufferData(): void {
    const gl = this.gl;
    gl.bufferData(gl.ARRAY_BUFFER, this.array, gl.DYNAMIC_DRAW);
  }

  render(params: RenderParams): void {
    if (this.hasNothingToRender()) return;

    const gl = this.gl;
    const program = this.program;

    gl.useProgram(program);

    gl.uniformMatrix3fv(this.matrixLocation, false, params.matrix);
    gl.uniform1f(this.sqrtZoomRatioLocation, Math.sqrt(params.ratio));
    gl.uniform1f(this.correctionRatioLocation, params.correctionRatio);

    gl.drawArrays(gl.TRIANGLES, 0, this.array.length / ATTRIBUTES);
  }
}
