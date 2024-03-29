import { Coordinates, Dimensions, NodeDisplayData, RenderParams } from "sigma/types";
import { floatColor } from "sigma/utils";
import { NodeProgram, NodeProgramConstructor } from "sigma/rendering/webgl/programs/common/node";
import type Sigma from "sigma";

interface NodeDisplayDataWithPictogramInfo extends NodeDisplayData {
  pictogram: string;
  pictogramColor?: string;
}

interface CreateNodePictogramProgramOptions {
  correctCentering?: boolean;
  // NOTE: only work with svg accessible through CORS and having proper dimensions
  forcedSvgSize?: number;
  // NOTE: if true, the edges of some pictogram might be cropped to fit the circle
  // This might be desirable when showing pictogram inside a node, but not if
  // you need to rely on pictograms to display node as shapes
  keepWithinCircle?: boolean;
}

const DEFAULT_CREATE_NODE_PICTOGRAM_OPTIONS: CreateNodePictogramProgramOptions = {
  correctCentering: false,
  forcedSvgSize: undefined,
  keepWithinCircle: true,
};

const VERTEX_SHADER_SOURCE = /*glsl*/ `
attribute vec2 a_position;
attribute float a_size;
attribute vec4 a_color;
attribute vec4 a_texture;

uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform mat3 u_matrix;

varying vec4 v_color;
varying float v_border;
varying vec4 v_texture;

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
  gl_PointSize = a_size / u_sizeRatio * u_pixelRatio * 2.0;

  v_border = (0.5 / a_size) * u_sizeRatio;

  // Extract the color:
  v_color = a_color;
  v_color.a *= bias;

  // Pass the texture coordinates:
  // NOTE: multiply a_texture by a constant and you get a pattern
  v_texture = a_texture;
}
`;

const FRAGMENT_SHADER_SOURCE = /*glsl*/ `
precision mediump float;

varying vec4 v_color;
varying float v_border;
varying vec4 v_texture;

uniform sampler2D u_atlas;
uniform float u_keepWithinCircle;

const float radius = 0.5;

void main(void) {
  vec4 texel = texture2D(u_atlas, v_texture.xy + gl_PointCoord * v_texture.zw, -1.0);
  vec4 color = mix(gl_FragColor, v_color, texel.a);

  vec2 m = gl_PointCoord - vec2(0.5, 0.5);
  float dist = length(m) * u_keepWithinCircle;

  if (dist < radius - v_border) {
    gl_FragColor = color;
  }
}
`;

// maximum size of single texture in atlas
const MAX_TEXTURE_SIZE = Infinity;
// maximum width of atlas texture (limited by browser)
// low setting of 3072 works on phones & tablets
const MAX_CANVAS_WIDTH = 3072;

type ImageLoading = { status: "loading" };
type ImageError = { status: "error" };
type ImagePending = { status: "pending"; image: HTMLImageElement };
type ImageReady = { status: "ready" } & Coordinates & Dimensions;
type ImageType = ImageLoading | ImageError | ImagePending | ImageReady;

// Helper class able to "correct" the centering of a svg pictogram by
// finding the "true" visually correct center through the barycenter of the
// pictogram's alpha layer in x and y dimension.
class PictogramCenteringCorrector {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d") as CanvasRenderingContext2D;
  }

  getCorrectionOffset(image: HTMLImageElement, size: number): Coordinates {
    this.canvas.width = size;
    this.canvas.height = size;
    this.context.clearRect(0, 0, size, size);
    this.context.drawImage(image, 0, 0, size, size);
    const data = this.context.getImageData(0, 0, size, size).data;

    const alpha = new Uint8ClampedArray(data.length / 4);

    for (let i = 0; i < data.length; i++) {
      alpha[i] = data[i * 4 + 3];
    }

    let sumX = 0;
    let sumY = 0;
    let total = 0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = alpha[y * size + x];

        total += a;
        sumX += a * x;
        sumY += a * y;
      }
    }

    const barycenterX = sumX / total;
    const barycenterY = sumY / total;

    return {
      x: barycenterX - size / 2,
      y: barycenterY - size / 2,
    };
  }
}

/**
 * To share the texture between the program instances of the graph and the
 * hovered nodes (to prevent some flickering, mostly), this program must be
 * "built" for each sigma instance:
 */
export default function createNodePictogramProgram(
  options?: CreateNodePictogramProgramOptions,
): NodeProgramConstructor {
  options = Object.assign({}, DEFAULT_CREATE_NODE_PICTOGRAM_OPTIONS, options);

  const keepWithinCircle = options.keepWithinCircle !== false;

  const corrector = new PictogramCenteringCorrector();

  /**
   * These attributes are shared between all instances of this exact class,
   * returned by this call to getNodeProgramImage:
   */
  const rebindTextureFns: (() => void)[] = [];
  const images: Record<string, ImageType> = {};
  let textureImage: ImageData;
  let hasReceivedImages = false;
  let pendingImagesFrameID: number | undefined = undefined;

  // next write position in texture
  let writePositionX = 0;
  let writePositionY = 0;
  // height of current row
  let writeRowHeight = 0;

  interface PendingImage {
    image: HTMLImageElement;
    id: string;
    size: number;
  }

  /**
   * Helper to load an image:
   */
  function loadImage(imageSource: string): void {
    if (images[imageSource]) return;

    const forcedSvgSize = options?.forcedSvgSize;

    // If forcing a SVG size (typically to oversample the resulting rasterized
    // size so that the icon is crispier), we fetch the svg string and we
    // mangle it to force a certain size and view box.
    // Of course this cannot work if said SVG cannot be access through CORS.
    if (forcedSvgSize) {
      images[imageSource] = { status: "loading" };

      fetch(imageSource)
        .then((r) => r.text())
        .then((svgString) => {
          const svg = new DOMParser().parseFromString(svgString, "image/svg+xml");

          const root = svg.documentElement;

          let originalWidth = root.getAttribute("width");
          let originalHeight = root.getAttribute("height");

          if (!originalWidth || !originalHeight)
            throw new Error(
              "createNodePictogramProgram.loadImage: cannot use `forcedSvgSize` if target svg has no definite dimensions.",
            );

          root.setAttribute("width", "" + forcedSvgSize);
          root.setAttribute("height", "" + forcedSvgSize);

          // NOTE: since Google Material last changes to their icon viewBox, this
          // code is no longer necessary (hopefully it does not break something else...)
          // root.setAttribute("viewBox", `0 0 ${originalWidth} ${originalHeight}`);

          const correctedSvgString = new XMLSerializer().serializeToString(svg);

          const blob = new Blob([correctedSvgString], { type: "image/svg+xml" });
          const url = URL.createObjectURL(blob);

          const svgImage = new Image();
          svgImage.src = url;
          svgImage.addEventListener(
            "load",
            () => {
              images[imageSource] = {
                status: "pending",
                image: svgImage,
              };

              if (typeof pendingImagesFrameID !== "number") {
                pendingImagesFrameID = requestAnimationFrame(() => finalizePendingImages());
              }

              URL.revokeObjectURL(url);
            },
            { once: true },
          );
        })
        .catch(() => {
          images[imageSource] = { status: "error" };
        });

      return;
    }

    const image = new Image();
    image.addEventListener("load", () => {
      images[imageSource] = {
        status: "pending",
        image,
      };

      if (typeof pendingImagesFrameID !== "number") {
        pendingImagesFrameID = requestAnimationFrame(() => finalizePendingImages());
      }
    });
    image.addEventListener("error", () => {
      images[imageSource] = { status: "error" };
    });
    images[imageSource] = { status: "loading" };

    // Load image:
    image.setAttribute("crossOrigin", "");
    image.src = imageSource;
  }

  /**
   * Helper that takes all pending images and adds them into the texture:
   */
  function finalizePendingImages(): void {
    pendingImagesFrameID = undefined;

    const pendingImages: PendingImage[] = [];

    // List all pending images:
    for (const id in images) {
      const state = images[id];
      if (state.status === "pending") {
        pendingImages.push({
          id,
          image: state.image,
          size: Math.min(state.image.width, state.image.height) || 1,
        });
      }
    }

    // Add images to texture:
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

    // limit canvas size to avoid browser and platform limits
    let totalWidth = hasReceivedImages ? textureImage.width : 0;
    let totalHeight = hasReceivedImages ? textureImage.height : 0;

    // initialize image drawing offsets with current write position
    let xOffset = writePositionX;
    let yOffset = writePositionY;

    /**
     * Draws a (full or partial) row of images into the atlas texture
     * @param pendingImages
     */
    const drawRow = (pendingImages: PendingImage[]) => {
      // update canvas size before drawing
      if (canvas.width !== totalWidth || canvas.height !== totalHeight) {
        canvas.width = Math.min(MAX_CANVAS_WIDTH, totalWidth);
        canvas.height = totalHeight;

        // draw previous texture into resized canvas
        if (hasReceivedImages) {
          ctx.putImageData(textureImage, 0, 0);
        }
      }

      pendingImages.forEach(({ id, image, size }) => {
        const imageSizeInTexture = Math.min(MAX_TEXTURE_SIZE, size);

        // Crop image, to only keep the biggest square, centered:
        let dx = 0,
          dy = 0;
        if ((image.width || 0) > (image.height || 0)) {
          dx = (image.width - image.height) / 2;
        } else {
          dy = (image.height - image.width) / 2;
        }

        let dxOffset = 0;
        let dyOffset = 0;

        if (options?.correctCentering) {
          const correction = corrector.getCorrectionOffset(image, size);
          dxOffset = correction.x;
          dyOffset = correction.y;
        }

        // NOTE: it's possible to offset the image here, this is potentially useful for some pictograms
        ctx.drawImage(
          image,
          dx + dxOffset,
          dy + dyOffset,
          size,
          size,
          xOffset,
          yOffset,
          imageSizeInTexture,
          imageSizeInTexture,
        );

        // Update image state:
        images[id] = {
          status: "ready",
          x: xOffset,
          y: yOffset,
          width: imageSizeInTexture,
          height: imageSizeInTexture,
        };

        xOffset += imageSizeInTexture;
      });

      hasReceivedImages = true;
      textureImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    };

    let rowImages: PendingImage[] = [];
    pendingImages.forEach((image) => {
      const { size } = image;
      const imageSizeInTexture = Math.min(size, MAX_TEXTURE_SIZE);

      if (writePositionX + imageSizeInTexture > MAX_CANVAS_WIDTH) {
        // existing row is full: flush row and continue on next line
        if (rowImages.length > 0) {
          totalWidth = Math.max(writePositionX, totalWidth);
          totalHeight = Math.max(writePositionY + writeRowHeight, totalHeight);
          drawRow(rowImages);

          rowImages = [];
          writeRowHeight = 0;
        }

        writePositionX = 0;
        writePositionY = totalHeight;
        xOffset = 0;
        yOffset = totalHeight;
      }

      // add image to row
      rowImages.push(image);

      // advance write position and update maximum row height
      writePositionX += imageSizeInTexture;
      writeRowHeight = Math.max(writeRowHeight, imageSizeInTexture);
    });

    // flush pending images in row - keep write position (and drawing cursor)
    totalWidth = Math.max(writePositionX, totalWidth);
    totalHeight = Math.max(writePositionY + writeRowHeight, totalHeight);
    drawRow(rowImages);
    rowImages = [];

    rebindTextureFns.forEach((fn) => fn());
  }

  const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext;

  const UNIFORMS = ["u_sizeRatio", "u_pixelRatio", "u_matrix", "u_atlas", "u_keepWithinCircle"] as const;

  return class NodePictogramProgram extends NodeProgram<typeof UNIFORMS[number]> {
    getDefinition() {
      return {
        VERTICES: 1,
        ARRAY_ITEMS_PER_VERTEX: 8,
        VERTEX_SHADER_SOURCE,
        FRAGMENT_SHADER_SOURCE,
        UNIFORMS,
        ATTRIBUTES: [
          { name: "a_position", size: 2, type: FLOAT },
          { name: "a_size", size: 1, type: FLOAT },
          { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
          { name: "a_texture", size: 4, type: FLOAT },
        ],
      };
    }

    texture: WebGLTexture;
    latestRenderParams?: RenderParams;

    constructor(gl: WebGLRenderingContext, renderer: Sigma) {
      super(gl, renderer);

      rebindTextureFns.push(() => {
        if (this && this.rebindTexture) this.rebindTexture();
        if (renderer && renderer.scheduleRefresh) renderer.scheduleRefresh();
      });

      this.texture = gl.createTexture() as WebGLTexture;

      if (!textureImage) {
        textureImage = new ImageData(1, 1);

        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      } else {
        this.rebindTexture();
      }
    }

    rebindTexture() {
      const gl = this.gl;

      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureImage);
      gl.generateMipmap(gl.TEXTURE_2D);

      if (this.latestRenderParams) this.render(this.latestRenderParams);
    }

    processVisibleItem(i: number, data: NodeDisplayDataWithPictogramInfo): void {
      const array = this.array;

      const imageSource = data.pictogram;
      const imageState = imageSource && images[imageSource];
      if (typeof imageSource === "string" && !imageState) loadImage(imageSource);

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = data.size;
      array[i++] = floatColor(data.pictogramColor || "black");

      // Reference texture:
      if (imageState && imageState.status === "ready") {
        const { width, height } = textureImage;
        array[i++] = imageState.x / width;
        array[i++] = imageState.y / height;
        array[i++] = imageState.width / width;
        array[i++] = imageState.height / height;
      } else {
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
      }
    }

    draw(params: RenderParams): void {
      this.latestRenderParams = params;

      const gl = this.gl;

      const { u_sizeRatio, u_pixelRatio, u_matrix, u_atlas, u_keepWithinCircle } = this.uniformLocations;

      gl.uniform1f(u_keepWithinCircle, keepWithinCircle ? 1 : 0);
      gl.uniform1f(u_sizeRatio, params.sizeRatio);
      gl.uniform1f(u_pixelRatio, params.pixelRatio);
      gl.uniformMatrix3fv(u_matrix, false, params.matrix);
      gl.uniform1i(u_atlas, 0);

      gl.drawArrays(gl.POINTS, 0, this.verticesCount);
    }
  };
}
