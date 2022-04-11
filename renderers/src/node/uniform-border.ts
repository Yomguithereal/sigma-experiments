// Original author: @jacomyal
// A node renderer using one point to render a circle with a variable size
// border with uniform color.

import { NodeDisplayData } from "sigma/types";
import { floatColor, floatArrayColor } from "sigma/utils";
import { RenderParams } from "sigma/rendering/webgl/programs/common/program";
import { NodeProgramConstructor, AbstractNodeProgram } from "sigma/rendering/webgl/programs/common/node";

export type NodeUniformBorderProgramOptions = {
  borderColor?: string;
  borderRatio?: number;
};

export default function createNodeUniformBorderProgram(
  options?: NodeUniformBorderProgramOptions,
): NodeProgramConstructor {
  options = options || {};

  const { borderRatio = 0.1, borderColor = "white" } = options;

  let templateBorderRatio = "" + (0.5 - borderRatio / 2);

  const borderColorAsFloatArray = floatArrayColor(borderColor);

  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute float a_size;
    attribute vec4 a_color;

    uniform float u_ratio;
    uniform float u_scale;
    uniform mat3 u_matrix;
    uniform vec4 u_borderColor;

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

      v_borderColor = u_borderColor;
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
  const ATTRIBUTES = 4;

  return class NodeUniformBorderProgram extends AbstractNodeProgram {
    borderColorLocation: WebGLUniformLocation;

    constructor(gl: WebGLRenderingContext) {
      super(gl, vertexShaderSource, fragmentShaderSource, POINTS, ATTRIBUTES);

      const borderColorLocation = gl.getUniformLocation(this.program, "u_borderColor");
      if (borderColorLocation === null) throw new Error("NodeProgram: error while getting borderColorLocation");
      this.borderColorLocation = borderColorLocation;

      this.bind();
    }

    process(data: NodeDisplayData, hidden: boolean, offset: number): void {
      const array = this.array;
      let i = offset * POINTS * ATTRIBUTES;

      if (hidden) {
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
        return;
      }

      const color = floatColor(data.color);

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = data.size;
      array[i] = color;
    }

    render(params: RenderParams): void {
      if (this.hasNothingToRender()) return;

      const gl = this.gl;

      const program = this.program;
      gl.useProgram(program);

      gl.uniform1f(this.ratioLocation, 1 / Math.sqrt(params.ratio));
      gl.uniform1f(this.scaleLocation, params.scalingRatio);
      gl.uniformMatrix3fv(this.matrixLocation, false, params.matrix);
      gl.uniform4fv(this.borderColorLocation, borderColorAsFloatArray);

      gl.drawArrays(gl.POINTS, 0, this.array.length / ATTRIBUTES);
    }
  };
}
