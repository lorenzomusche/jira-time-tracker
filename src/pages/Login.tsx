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
    <div className="mesh-bg flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="gradient-brand mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-xl shadow-primary/30">
            <Clock className="h-7 w-7 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Tempo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consuntivazione Jira, senza attrito.
          </p>
        </div>

        <Card className="border-0 shadow-2xl shadow-primary/10">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Accedi a Jira</CardTitle>
            <CardDescription>
              Cataloga le issue assegnate e registra il tempo in un click.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/50 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={deployment === "server" ? "bg-background shadow-sm" : ""}
                  onClick={() => setDeployment("server")}
                >
                  Server / DC
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={deployment === "cloud" ? "bg-background shadow-sm" : ""}
                  onClick={() => setDeployment("cloud")}
                >
                  Cloud
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
                        Personal Access Token (DC 8.14+)
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
                      ? "Il PAT si crea in Jira: Profilo → Personal Access Tokens."
                      : "La password è usata solo per le API e salvata cifrata in locale."}
                  </p>
                )}
              </div>

              {error && (
                <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={login.isPending} className="w-full">
                {login.isPending ? "Verifica credenziali…" : "Accedi"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Le credenziali sono cifrate e restano nel database locale.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
