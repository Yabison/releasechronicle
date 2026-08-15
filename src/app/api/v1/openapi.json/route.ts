import { openapiDocument } from "@/lib/openapi";

export async function GET() {
  return Response.json(openapiDocument);
}
