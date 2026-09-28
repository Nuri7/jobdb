import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { BriefcaseBusiness, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const state = location.state as { from?: string; adminRequired?: boolean } | null;
  const destination = state?.from || "/bewaard";

  if (!loading && user) return <Navigate to={destination} replace />;

  const submit = async (mode: "login" | "signup") => {
    setBusy(true);
    const { error } = mode === "login" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (mode === "signup") toast.success("Controleer je e-mail om je account te bevestigen.");
    else navigate(destination, { replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-12">
      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2 text-xl font-bold"><BriefcaseBusiness className="h-6 w-6 text-primary" />FairJobs</Link>
        <Card>
          <CardHeader><CardTitle>Welkom bij FairJobs</CardTitle><CardDescription>{state?.adminRequired ? "Log in met een beheerdersaccount om dit onderdeel te openen." : "Log in om vacatures en zoekopdrachten te bewaren."}</CardDescription></CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="login">Inloggen</TabsTrigger><TabsTrigger value="signup">Account maken</TabsTrigger></TabsList>
              {(["login", "signup"] as const).map((mode) => <TabsContent key={mode} value={mode} className="mt-6 space-y-4"><div><Label htmlFor={`${mode}-email`}>E-mailadres</Label><Input id={`${mode}-email`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2" /></div><div><Label htmlFor={`${mode}-password`}>Wachtwoord</Label><Input id={`${mode}-password`} type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2" /></div><Button className="w-full" disabled={busy || !email || password.length < 8} onClick={() => submit(mode)}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{mode === "login" ? "Inloggen" : "Account maken"}</Button></TabsContent>)}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
