import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Mark } from "./components/Mark";
import { getConnection, supabase } from "./lib/supabase";
import { Auth, Setup } from "./views/Gate";
import { Workspace } from "./views/Workspace";

export default function App() {
  const [configured, setConfigured] = useState(() => getConnection() !== null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!configured) return;
    const auth = supabase().auth;
    auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = auth.onAuthStateChange((_e, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [configured]);

  if (!configured) return <Setup onDone={() => setConfigured(true)} />;
  if (session === undefined) return <div className="loading"><Mark size={28} /></div>;
  if (!session) return <Auth />;
  return <Workspace key={session.user.id} me={session.user.id} email={session.user.email ?? ""} />;
}
