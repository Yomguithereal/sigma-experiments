// Original author: @jacomyal
// A node renderer using one point to render a circle with a variable size
// border.

import { NodeDisplayData } from "sigma/types";
import { floatColor } from "sigma/utils";
import { RenderParams, AbstractProgram } from "sigma/rendering/webgl/programs/common/program";
import { NodeProgramConstructor } from "sigma/rendering/webgl/programs/common/node";

export default function createNodeBorderProgram(borderRatio: number = 0.1): NodeProgramConstructor {
  let templateBorderRatio = "" + (0.5 - borderRatio / 2);

  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute float a_size;
    attribute vec4 a_color;
    attribute vec4 a_borderColor;

    uniform float u_ratio;
    uniform float u_scale;
    uniform mat3 u_matrix;

    varying vec4 v_color;
    varying vec4 v_borderColor;
    varying float v_border;

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
      gl_PointSize = a_size * u_ratio * u_scale * 2.0;

      v_border = (1.0 / u_ratio) * (0.5 / a_size);

      // Extract the color:
      v_color = a_color;
      v_color.a *= bias;

      v_borderColor = a_borderColor;
      v_borderColor.a *= bias;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;

    varying vec4 v_color;
    varying vec4 v_borderColor;
    varying float v_border;

    const float radius = 0.5;
    const float halfRadius = ${templateBorderRatio};
    const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

    void main(void) {
      float distToCenter = length(gl_PointCoord - vec2(0.5, 0.5));

      if (distToCenter < halfRadius - v_border)
        gl_FragColor = v_color;
      else if (distToCenter < halfRadius)
        gl_FragColor = mix(v_borderColor, v_color, (halfRadius - distToCenter) / v_border);
      else if (distToCenter < radius - v_border)
        gl_FragColor = v_borderColor;
      else if (distToCenter < radius)
        gl_FragColor = mix(transparent, v_borderColor, (radius - distToCenter) / v_border);
      else
        gl_FragColor = transparent;
    }
  `;

  const POINTS = 1;
  const ATTRIBUTES = 5;

  return class NodeBorderProgram extends AbstractProgram {
    positionLocation: GLint;
    sizeLocation: GLint;
    colorLocation: GLint;
    borderColorLocation: GLint;

    ratioLocation: WebGLUniformLocation;
    scaleLocation: WebGLUniformLocation;
    matrixLocation: WebGLUniformLocation;

    constructor(gl: WebGLRenderingContext) {
      super(gl, vertexShaderSource, fragmentShaderSource, POINTS, ATTRIBUTES);

      // Locations
      this.positionLocation = gl.getAttribLocation(this.program, "a_position");
      this.sizeLocation = gl.getAttribLocation(this.program, "a_size");
      this.colorLocation = gl.getAttribLocation(this.program, "a_color");
      this.borderColorLocation = gl.getAttribLocation(this.program, "a_borderColor");

      // Uniform Location
      const matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
      if (matrixLocation === null) throw new Error("AbstractNodeProgram: error while getting matrixLocation");
      this.matrixLocation = matrixLocation;

      const scaleLocation = gl.getUniformLocation(this.program, "u_scale");
      if (scaleLocation === null) throw new Error("NodeProgram: error while getting scaleLocation");
      this.scaleLocation = scaleLocation;

      const ratioLocation = gl.getUniformLocation(this.program, "u_ratio");
      if (ratioLocation === null) throw new Error("NodeProgram: error while getting ratioLocation");
      this.ratioLocation = ratioLocation;

      this.bind();
    }

    bind(): void {
      const gl = this.gl;

      gl.enableVertexAttribArray(this.positionLocation);
      gl.enableVertexAttribArray(this.sizeLocation);
      gl.enableVertexAttribArray(this.colorLocation);
      gl.enableVertexAttribArray(this.borderColorLocation);

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
        this.borderColorLocation,
        4,
        gl.UNSIGNED_BYTE,
        true,
        this.attributes * Float32Array.BYTES_PER_ELEMENT,
        16,
      );
    }

    process(data: NodeDisplayData & { borderColor: string }, hidden: boolean, offset: number): void {
      const array = this.array;
      let i = offset * POINTS * ATTRIBUTES;

      if (hidden) {
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
        array[i] = 0;
        return;
      }

      const color = floatColor(data.color);
      const borderColor = floatColor(data.borderColor);

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = data.size;
      array[i++] = color;
      array[i] = borderColor;
    }

    render(params: RenderParams): void {
      if (this.hasNothingToRender()) return;

      const gl = this.gl;

      const program = this.program;
      gl.useProgram(program);

      gl.uniform1f(this.ratioLocation, 1 / Math.sqrt(params.ratio));
      gl.uniform1f(this.scaleLocation, params.scalingRatio);
      gl.uniformMatrix3fv(this.matrixLocation, false, params.matrix);

      gl.drawArrays(gl.POINTS, 0, this.array.length / ATTRIBUTES);
    }
  };
}
