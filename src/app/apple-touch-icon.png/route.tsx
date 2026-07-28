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
          fontSize: 150,
          fontWeight: 800,
          letterSpacing: -5,
        }}
      >
        DC
      </div>
    ),
    {
      width: 180,
      height: 180,
    }
  );
}
