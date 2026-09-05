import { Suspense } from "react";
import { demoAccounts } from "@/lib/auth/demoAccounts";
import { devAccounts } from "@/lib/auth/devAccounts";
import LoginForm from "./LoginForm";

// RC_DEMO_MODE is read per request, not baked in at build time: the same image
// runs the demo and every private instance, and only the former sets the flag.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  // The public demo wins: an instance that is both would rather advertise the
  // accounts a visitor is meant to use. Both are null on a real deployment.
  const demo = demoAccounts();
  const accounts = demo ?? devAccounts();

  // Suspense boundary for the useSearchParams() inside the form.
  return (
    <Suspense>
      <LoginForm accounts={accounts} kind={demo ? "demo" : "dev"} />
    </Suspense>
  );
}
