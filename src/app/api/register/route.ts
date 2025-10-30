import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/mongodb";
import { User } from "@/models/User";

const schema = z.object({
	email: z.string().email(),
	password: z.string().min(6),
	name: z.string().min(1).optional(),
});

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const { email, password, name } = schema.parse(body);

		await connectToDatabase();
		const exists = await User.findOne({ email });
		if (exists) {
			return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });
		}

		const passwordHash = await bcrypt.hash(password, 10);
		await User.create({ email, passwordHash, name });
		return NextResponse.json({ ok: true });
	} catch (err: any) {
		return NextResponse.json({ error: err?.message ?? "Erro" }, { status: 400 });
	}
}
