export const metadata = { title: "releasechronicle API docs" };

const SWAGGER_VERSION = "5.18.2";

export default function ApiDocsPage() {
  const html = `
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css">
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () => {
        window.SwaggerUIBundle({ url: "/api/v1/openapi.json", dom_id: "#swagger-ui" });
      };
    </script>
  `;
  return <main dangerouslySetInnerHTML={{ __html: html }} />;
}
