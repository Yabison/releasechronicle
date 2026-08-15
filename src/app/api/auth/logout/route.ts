import { sessionClearCookie } from "@/lib/auth/session";

export async function POST(_req: Request) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": sessionClearCookie() },
  });
}
