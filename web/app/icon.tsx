import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

const archivoBlack = await readFile(join(process.cwd(), "assets/fonts/ArchivoBlack-Regular.ttf"));

/** The browser-tab icon: the ink block of the wordmark with a B. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#101a2c",
          color: "#e8eae3",
          fontSize: 46,
          fontFamily: "Archivo Black",
        }}
      >
        B
      </div>
    ),
    { ...size, fonts: [{ name: "Archivo Black", data: archivoBlack, style: "normal", weight: 400 }] },
  );
}
