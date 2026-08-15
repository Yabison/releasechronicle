import { readSessionFromCookieHeader } from "@/lib/auth/session";

export async function GET(req: Request) {
  const user = await readSessionFromCookieHeader(req.headers.get("cookie"));
  return Response.json({ user });
}
