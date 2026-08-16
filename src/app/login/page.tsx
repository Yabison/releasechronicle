import { Suspense } from "react";
import { demoAccounts } from "@/lib/auth/demoAccounts";
import LoginForm from "./LoginForm";

// RC_DEMO_MODE is read per request, not baked in at build time: the same image
// runs the demo and every private instance, and only the former sets the flag.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  // Suspense boundary for the useSearchParams() inside the form.
  return (
    <Suspense>
      <LoginForm demo={demoAccounts()} />
    </Suspense>
  );
}
