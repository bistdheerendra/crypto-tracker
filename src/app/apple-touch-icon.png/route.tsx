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
          color: "#d1ff45",
          fontSize: 150,
          fontWeight: 800,
          letterSpacing: -5,
        }}
      >
        D
      </div>
    ),
    {
      width: 180,
      height: 180,
    }
  );
}
