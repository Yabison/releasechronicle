import { requireWriteToken } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth/guard";
import { syncLdapUsers } from "@/lib/auth/ldapSync";

export async function POST(req: Request) {
  const tokenDenied = requireWriteToken(req);
  if (tokenDenied) {
    const adminDenied = await requireAdmin(req);
    if (adminDenied) return adminDenied;
  }
  return Response.json(await syncLdapUsers(), { status: 200 });
}
