import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#03060f",
        }}
      >
        <div
          style={{
            width: 408,
            height: 408,
            borderRadius: 96,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0d1224",
            border: "8px solid rgba(209,255,69,0.35)",
            color: "#d1ff45",
            fontSize: 196,
            fontWeight: 800,
            letterSpacing: -7,
          }}
        >
          D
        </div>
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}
