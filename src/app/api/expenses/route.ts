import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectToDatabase } from "@/lib/mongodb";
import { User } from "@/models/User";

type Expense = {
  id: string;
  name: string;
  amount: number;
  category?: string;
  date: string;
  recurringId?: string;
};

export async function POST(req: Request) {
  const session = await getServerSession(
    authOptions as unknown as import("next-auth").NextAuthOptions
  );
  if (!session || !session.user || !session.user.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // basic validation
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const maybe = body as Partial<Expense>;
  if (
    typeof maybe.id !== "string" ||
    typeof maybe.name !== "string" ||
    typeof maybe.amount !== "number" ||
    typeof maybe.date !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid expense shape" },
      { status: 400 }
    );
  }

  const expense: Expense = {
    id: maybe.id,
    name: maybe.name.trim(),
    amount: maybe.amount,
    date: maybe.date,
    category: typeof maybe.category === "string" ? maybe.category : undefined,
    recurringId:
      typeof maybe.recurringId === "string" ? maybe.recurringId : undefined,
  };

  try {
    await connectToDatabase();
    // push into data.expenses array (creates path if necessary)
    await User.updateOne(
      { email: session.user.email },
      { $push: { "data.expenses": expense } }
    );
    return NextResponse.json({ ok: true, expense }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
