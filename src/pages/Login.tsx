import { useState } from "react";
import { useNavigate } from "react-router";
import { Clock, ExternalLink } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Deployment = "cloud" | "server";
type AuthType = "basic" | "bearer";

export default function Login() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [deployment, setDeployment] = useState<Deployment>("server");
  const [authType, setAuthType] = useState<AuthType>("basic");
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = trpc.auth.login.useMutation({
    onSuccess: () => {
      utils.invalidate();
      navigate("/", { replace: true });
    },
    onError: (e) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate({
      siteUrl,
      deployment,
      authType: deployment === "cloud" ? "basic" : authType,
      username,
      secret,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Jira Time Tracker</CardTitle>
          <CardDescription>
            Accedi con il tuo account Jira per catalogare le issue assegnate e
            consuntivare il tempo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={deployment === "server" ? "default" : "outline"}
                onClick={() => setDeployment("server")}
              >
                Jira Server / DC
              </Button>
              <Button
                type="button"
                variant={deployment === "cloud" ? "default" : "outline"}
                onClick={() => setDeployment("cloud")}
              >
                Jira Cloud
              </Button>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="site">URL di Jira</Label>
              <Input
                id="site"
                placeholder={
                  deployment === "server"
                    ? "https://jira.azienda.it"
                    : "https://azienda.atlassian.net"
                }
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="username">
                {deployment === "server" ? "Username" : "Email Atlassian"}
              </Label>
              <Input
                id="username"
                type={deployment === "cloud" ? "email" : "text"}
                placeholder={deployment === "server" ? "mario.rossi" : "nome@azienda.com"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            {deployment === "server" && (
              <div className="grid gap-2">
                <Label>Metodo di autenticazione</Label>
                <Select value={authType} onValueChange={(v) => setAuthType(v as AuthType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Password (Basic auth)</SelectItem>
                    <SelectItem value="bearer">
                      Personal Access Token (Jira DC 8.14+)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="secret">
                {deployment === "cloud"
                  ? "API Token"
                  : authType === "bearer"
                    ? "Personal Access Token"
                    : "Password"}
              </Label>
              <Input
                id="secret"
                type="password"
                placeholder="••••••••••••"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="current-password"
                required
              />
              {deployment === "cloud" ? (
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Crea un API token su Atlassian
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {authType === "bearer"
                    ? "Il PAT si crea in Jira: Profilo → Personal Access Tokens (richiede Jira Data Center 8.14+)."
                    : "La password viene usata solo per le chiamate API e salvata cifrata in locale. Se hai Jira Data Center 8.14+, preferisci il Personal Access Token."}
                </p>
              )}
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={login.isPending} className="w-full">
              {login.isPending ? "Verifica credenziali..." : "Accedi"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Le credenziali sono cifrate e salvate solo nel database locale.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
