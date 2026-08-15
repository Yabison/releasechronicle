export function EmptyState({ message }: { message: string }) {
  return <p style={{ color: "var(--muted)", marginTop: "20vh", textAlign: "center" }}>{message}</p>;
}
