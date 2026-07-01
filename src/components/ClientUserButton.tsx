"use client";

import { UserButton } from "@clerk/nextjs";
import { useClientMounted } from "@/hooks/use-client-mounted";

type Props = React.ComponentProps<typeof UserButton>;

/** Clerk UserButton renders different markup on server vs client — mount-gate avoids #418. */
export function ClientUserButton(props: Props) {
  const mounted = useClientMounted();
  if (!mounted) {
    return <div className="h-8 w-8 shrink-0 rounded-full bg-muted" aria-hidden />;
  }
  return <UserButton {...props} />;
}
