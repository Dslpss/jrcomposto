import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
	const session = await getServerSession(authOptions as any);
	if (!session) redirect("/login");
	return <DashboardClient userEmail={(session as any).user?.email ?? ""} />;
}
