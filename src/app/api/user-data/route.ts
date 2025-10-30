import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getServerSession } from "next-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { User } from "@/models/User";

export async function GET() {
	const session = await getServerSession(authOptions as any);
	if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	await connectToDatabase();
	const user = await User.findOne({ email: session.user.email }).lean();
	return NextResponse.json({ data: user?.data ?? null });
}

export async function POST(req: Request) {
	const session = await getServerSession(authOptions as any);
	if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const body = await req.json();
	await connectToDatabase();
	await User.updateOne({ email: session.user.email }, { $set: { data: body } });
	return NextResponse.json({ ok: true });
}
