import { NextResponse } from "next/server";
import { getOpenVerdicts } from "@/lib/verdicts/store";

export async function GET() {
  const verdicts = (await getOpenVerdicts()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return NextResponse.json({ verdicts, count: verdicts.length });
}
