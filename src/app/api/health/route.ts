import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const mongoose = await connectToDatabase();
    // tenta obter nome do DB de forma resiliente
    const dbName =
      (mongoose &&
        (mongoose.connection?.db?.databaseName || mongoose.connection?.name)) ??
      null;
    return NextResponse.json({ ok: true, dbName }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
