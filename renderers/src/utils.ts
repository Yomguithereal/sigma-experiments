import { HTML_COLORS } from "sigma/utils/data";

const RGBA_TEST_REGEX = /^\s*rgba?\s*\(/;
const RGBA_EXTRACT_REGEX = /^\s*rgba?\s*\(\s*([0-9]*)\s*,\s*([0-9]*)\s*,\s*([0-9]*)(?:\s*,\s*(.*)?)?\)\s*$/;

// TODO: this is mostly copied over from sigma, we could improve
export function colorToFloatArray(color: string): Float32Array {
  color = HTML_COLORS[color] || color;

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;

  // Handling hexadecimal notation
  if (color[0] === "#") {
    if (color.length === 4) {
      r = parseInt(color.charAt(1) + color.charAt(1), 16);
      g = parseInt(color.charAt(2) + color.charAt(2), 16);
      b = parseInt(color.charAt(3) + color.charAt(3), 16);
    } else {
      r = parseInt(color.charAt(1) + color.charAt(2), 16);
      g = parseInt(color.charAt(3) + color.charAt(4), 16);
      b = parseInt(color.charAt(5) + color.charAt(6), 16);
    }
  }

  // Handling rgb notation
  else if (RGBA_TEST_REGEX.test(color)) {
    const match = color.match(RGBA_EXTRACT_REGEX);
    if (match) {
      r = +match[1];
      g = +match[2];
      b = +match[3];

      if (match[4]) a = +match[4];
    }
  }

  return new Float32Array([r / 255, g / 255, b / 255, a]);
}
