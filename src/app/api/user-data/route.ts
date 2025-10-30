import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getServerSession, type Session } from "next-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { User, IUser } from "@/models/User";

export async function GET() {
  const session: Session | null = await getServerSession(
    authOptions as unknown as import("next-auth").NextAuthOptions
  );
  if (!session || !session.user || !session.user.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectToDatabase();
  const user = await User.findOne({ email: session.user.email }).lean<
    IUser & { _id: unknown }
  >();
  return NextResponse.json({ data: user?.data ?? null });
}

export async function POST(req: Request) {
  const session: Session | null = await getServerSession(
    authOptions as unknown as import("next-auth").NextAuthOptions
  );
  if (!session || !session.user || !session.user.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  await connectToDatabase();
  await User.updateOne({ email: session.user.email }, { $set: { data: body } });
  return NextResponse.json({ ok: true });
}
