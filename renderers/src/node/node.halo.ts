// A node renderer using one triangle to render a blurry halo useful to render
// a basic heatmap with variable color.

import { NodeDisplayData } from "sigma/types";
import { floatColor } from "sigma/utils";
import { AbstractProgram, RenderParams } from "sigma/rendering/webgl/programs/common/program";
import { NodeProgramConstructor } from "sigma/rendering/webgl/programs/common/node";

const POINTS = 3;
const ATTRIBUTES = 6;

const ANGLE_1 = 0;
const ANGLE_2 = (2 * Math.PI) / 3;
const ANGLE_3 = (4 * Math.PI) / 3;

export type NodeHaloProgramOptions = {
  ignoreZoom?: boolean;
  haloColorAttributeName?: string;
  haloSizeAttributeName?: string;
  haloIntensityAttributeName?: string;
};

// NOTE: color could become a uniform in performance scenarios
export default function createNodeHaloProgram(options?: NodeHaloProgramOptions): NodeProgramConstructor {
  options = options || {};

  const {
    ignoreZoom = false,
    haloColorAttributeName = "haloColor",
    haloSizeAttributeName = "haloSize",
    haloIntensityAttributeName = "haloIntensity",
  } = options;

  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute float a_size;
    attribute float a_angle;
    attribute vec4 a_color;
    attribute float a_intensity;

    uniform mat3 u_matrix;
    uniform float u_sqrtZoomRatio;
    uniform float u_correctionRatio;

    varying vec4 v_color;
    varying vec2 v_diffVector;
    varying float v_radius;
    varying float v_intensity;

    const float bias = 255.0 / 254.0;
    const float marginRatio = 1.05;

    void main() {
      float size = a_size * u_correctionRatio * u_sqrtZoomRatio${ignoreZoom ? " / u_sqrtZoomRatio" : ""} * 4.0;
      vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
      vec2 position = a_position + diffVector * marginRatio;
      gl_Position = vec4(
        (u_matrix * vec3(position, 1)).xy,
        0,
        1
      );

      v_diffVector = diffVector;
      v_radius = size / 2.0 / marginRatio;

      v_color = a_color;
      v_color.a *= bias;

      v_intensity = a_intensity;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;

    varying vec4 v_color;
    varying vec2 v_diffVector;
    varying float v_radius;
    varying float v_intensity;

    const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

    void main(void) {
      float dist = length(v_diffVector);
      float intensity = v_intensity * (1.0 - dist);

      if (dist < v_radius) {
        gl_FragColor = mix(v_color, transparent, pow(dist / v_radius, intensity));
      }
      else {
        gl_FragColor = transparent;
      }
    }
  `;

  return class NodeHaloProgram extends AbstractProgram {
    positionLocation: GLint;
    sizeLocation: GLint;
    colorLocation: GLint;
    angleLocation: GLint;
    intensityLocation: GLint;

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
      this.intensityLocation = gl.getAttribLocation(this.program, "a_intensity");

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
      gl.enableVertexAttribArray(this.intensityLocation);

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
      gl.vertexAttribPointer(
        this.intensityLocation,
        1,
        gl.FLOAT,
        false,
        this.attributes * Float32Array.BYTES_PER_ELEMENT,
        20,
      );
    }

    process(data: NodeDisplayData & { [name: string]: string | number }, hidden: boolean, offset: number): void {
      const array = this.array;
      let i = offset * POINTS * ATTRIBUTES;

      if (hidden) {
        for (let l = i + POINTS * ATTRIBUTES; i < l; i++) array[i] = 0;
        return;
      }

      const color = floatColor((data[haloColorAttributeName] || data.color) as string);
      const intensity = (
        typeof data[haloIntensityAttributeName] === "number" ? data[haloIntensityAttributeName] : 1.0
      ) as number;
      const size = Math.max((data[haloSizeAttributeName] as number) || 0, data.size);

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = size;
      array[i++] = color;
      array[i++] = ANGLE_1;
      array[i++] = intensity;

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = size;
      array[i++] = color;
      array[i++] = ANGLE_2;
      array[i++] = intensity;

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = size;
      array[i++] = color;
      array[i++] = ANGLE_3;
      array[i] = intensity;
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
