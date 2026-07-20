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

export default function Login() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [siteUrl, setSiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
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
    login.mutate({ siteUrl, email, apiToken });
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
            Accedi con il tuo account Atlassian per catalogare le issue assegnate e
            consuntivare il tempo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="site">Sito Jira</Label>
              <Input
                id="site"
                placeholder="https://azienda.atlassian.net"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email Atlassian</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@azienda.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="token">API Token</Label>
              <Input
                id="token"
                type="password"
                placeholder="••••••••••••"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                required
              />
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Crea un API token su Atlassian
                <ExternalLink className="h-3 w-3" />
              </a>
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
              Il token è cifrato e salvato solo nel database locale.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
