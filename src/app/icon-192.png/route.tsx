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
          color: "#3ea6ff",
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: -3,
        }}
      >
        D
      </div>
    ),
    {
      width: 192,
      height: 192,
    }
  );
}
