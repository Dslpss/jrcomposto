import NextAuth, { type AuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { connectToDatabase } from "@/lib/mongodb";
import { User, IUser } from "@/models/User";
import bcrypt from "bcryptjs";

export const authOptions: AuthOptions = {
	providers: [
		Credentials({
			name: "Credenciais",
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Senha", type: "password" },
			},
            async authorize(credentials) {
				if (!credentials?.email || !credentials?.password) return null;
				await connectToDatabase();
                const user = await User.findOne({ email: credentials.email }).lean<IUser & { _id: any }>();
				if (!user) return null;
                const ok = await bcrypt.compare(String(credentials.password), user.passwordHash);
				if (!ok) return null;
				return { id: (user as any)._id.toString(), email: user.email, name: user.name ?? undefined };
			},
		}),
	],
	callbacks: {
		async session({ session, token }: any) {
			if (session?.user && token?.sub) {
				(session.user as any).id = token.sub;
			}
			return session;
		},
	},
	pages: {
		signIn: "/login",
	},
	    session: { strategy: "jwt" },
	    secret: process.env.NEXTAUTH_SECRET,
	    // garante cookie seguro em produção (HTTPS)
	    useSecureCookies: Boolean(process.env.NEXTAUTH_URL?.startsWith("https://")),
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
