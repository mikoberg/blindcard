import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const archivoBlack = await readFile(join(process.cwd(), "assets/fonts/ArchivoBlack-Regular.ttf"));

/** The home-screen icon on phones. */
export default function AppleIcon() {
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
          fontSize: 130,
          fontFamily: "Archivo Black",
        }}
      >
        B
      </div>
    ),
    { ...size, fonts: [{ name: "Archivo Black", data: archivoBlack, style: "normal", weight: 400 }] },
  );
}
