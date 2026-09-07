import { SwaggerUI } from "@/components/SwaggerUI";

export const metadata = { title: "releasechronicle API docs" };

export default function ApiDocsPage() {
  return (
    <main>
      <SwaggerUI specUrl="/api/v1/openapi.json" />
    </main>
  );
}
