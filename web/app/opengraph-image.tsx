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
          background: "#0b0d10",
          color: "#eef1f4",
        }}
      >
        <div style={{ fontSize: 120, fontWeight: 700 }}>Blindcard</div>
        <div style={{ fontSize: 42, color: "#ffb020", marginTop: 16 }}>Worth watching. No spoilers.</div>
      </div>
    ),
    size,
  );
}
