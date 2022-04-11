// A node renderer displaying nodes as a circle or triangle

import { NodeDisplayData } from "sigma/types";
import { floatColor } from "sigma/utils";
import { AbstractProgram, RenderParams } from "sigma/rendering/webgl/programs/common/program";
import { NodeProgramConstructor } from "sigma/rendering/webgl/programs/common/node";

export type NodeBipartiteProgramOptions = {
  triangleAttributeName?: string;
};

export default function createNodeBipartiteProgram(options?: NodeBipartiteProgramOptions): NodeProgramConstructor {
  options = options || {};

  const { triangleAttributeName = "triangle" } = options;

  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute float a_size;
    attribute float a_angle;
    attribute vec4 a_color;

    uniform mat3 u_matrix;
    uniform float u_sqrtZoomRatio;
    uniform float u_correctionRatio;

    varying vec4 v_color;
    varying vec2 v_diffVector;
    varying float v_radius;
    varying float v_border;
    varying float v_triangle;

    const float bias = 255.0 / 254.0;
    const float marginRatio = 1.05;

    void main() {
      float size = a_size;

      if (a_size < 0.0) {
        v_triangle = 1.0;
        size = -size;
      }
      else {
        v_triangle = 0.0;
      }

      size *= u_correctionRatio * u_sqrtZoomRatio * 4.0;
      vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
      vec2 position = a_position + diffVector * marginRatio;
      gl_Position = vec4(
        (u_matrix * vec3(position, 1)).xy,
        0,
        1
      );

      v_border = u_correctionRatio * u_sqrtZoomRatio * u_sqrtZoomRatio;
      v_diffVector = diffVector;
      v_radius = size / 2.0 / marginRatio;

      v_color = a_color;
      v_color.a *= bias;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;

    varying vec4 v_color;
    varying vec2 v_diffVector;
    varying float v_radius;
    varying float v_border;
    varying float v_triangle;

    const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

    void main(void) {
      float dist = length(v_diffVector) - v_radius;

      float t = 0.0;

      if (v_triangle > 0.0)
        t = 0.0;
      else if (dist > v_border)
        t = 1.0;
      else if (dist > 0.0)
        t = dist / v_border;

      gl_FragColor = mix(v_color, transparent, t);
    }
  `;

  const POINTS = 3;
  const ATTRIBUTES = 5;

  const ANGLE_1 = 0;
  const ANGLE_2 = (2 * Math.PI) / 3;
  const ANGLE_3 = (4 * Math.PI) / 3;

  return class NodeBipartiteProgram extends AbstractProgram {
    positionLocation: GLint;
    sizeLocation: GLint;
    colorLocation: GLint;
    angleLocation: GLint;

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

      // Uniform Location
      const matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
      if (matrixLocation === null) throw new Error("AbstractNodeProgram: error while getting matrixLocation");
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

      gl.vertexAttribPointer(
        this.positionLocation,
        2,
        gl.FLOAT,
        false,
        this.attributes * Float32Array.BYTES_PER_ELEMENT,
        0,
      );
      gl.vertexAttribPointer(
        this.sizeLocation,
        1,
        gl.FLOAT,
        false,
        this.attributes * Float32Array.BYTES_PER_ELEMENT,
        8,
      );
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
    }

    process(data: NodeDisplayData & { [name: string]: boolean }, hidden: boolean, offset: number): void {
      const array = this.array;
      let i = offset * POINTS * ATTRIBUTES;

      if (hidden) {
        for (let l = i + POINTS * ATTRIBUTES; i < l; i++) array[i] = 0;
        return;
      }

      const triangle = data[triangleAttributeName] === true;

      let size = data.size;

      if (triangle) size = -size / 1.5;

      const color = floatColor(data.color);

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = size;
      array[i++] = color;
      array[i++] = ANGLE_1;

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = size;
      array[i++] = color;
      array[i++] = ANGLE_2;

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = size;
      array[i++] = color;
      array[i] = ANGLE_3;
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
  };
}
