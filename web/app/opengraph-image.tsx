import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Blindcard: which fights are worth watching, with no spoilers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Archivo Black (SIL Open Font License, see assets/fonts/OFL.txt): the heavy cut of the site's typeface.
const archivoBlack = await readFile(join(process.cwd(), "assets/fonts/ArchivoBlack-Regular.ttf"));

// One static, generic image. No event, fighter or result data goes into it.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#e8eae3",
          color: "#101a2c",
          borderTop: "24px solid #101a2c",
          fontFamily: "Archivo Black",
        }}
      >
        <div style={{ display: "flex", fontSize: 150, letterSpacing: -4 }}>
          <span>Blind</span>
          <span style={{ background: "#101a2c", color: "#e8eae3", padding: "0 24px", marginLeft: 4 }}>card</span>
        </div>
        <div style={{ fontSize: 48, color: "#c23314", marginTop: 28 }}>Worth watching. No spoilers.</div>
      </div>
    ),
    { ...size, fonts: [{ name: "Archivo Black", data: archivoBlack, style: "normal", weight: 400 }] },
  );
}
