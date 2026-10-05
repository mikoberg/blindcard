import { ImageResponse } from "next/og";

export const alt = "Blindcard: which fights are worth watching, with no spoilers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
        }}
      >
        <div style={{ display: "flex", fontSize: 150, fontWeight: 900, letterSpacing: -4 }}>
          <span>Blind</span>
          <span style={{ background: "#101a2c", color: "#e8eae3", padding: "0 24px", marginLeft: 4 }}>card</span>
        </div>
        <div style={{ fontSize: 48, fontWeight: 700, color: "#c23314", marginTop: 28 }}>
          Worth watching. No spoilers.
        </div>
      </div>
    ),
    size,
  );
}
