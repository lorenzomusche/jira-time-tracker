import { useEffect, useState } from "react";
import { Bell, Save, Target, Timer } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function Settings() {
  const utils = trpc.useUtils();
  const query = trpc.settings.get.useQuery();
  const [daily, setDaily] = useState("8");
  const [weekly, setWeekly] = useState("40");
  const [alertMin, setAlertMin] = useState("120");
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    if (query.data) {
      setDaily(String(query.data.dailyTargetSeconds / 3600));
      setWeekly(String(query.data.weeklyTargetSeconds / 3600));
      setAlertMin(String(query.data.timerAlertMinutes));
      setNotify(query.data.notifyEnabled === 1);
    }
  }, [query.data]);

  const update = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      utils.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const save = () => {
    update.mutate({
      dailyTargetSeconds: Math.round(parseFloat(daily || "8") * 3600),
      weeklyTargetSeconds: Math.round(parseFloat(weekly || "40") * 3600),
      timerAlertMinutes: parseInt(alertMin || "0", 10),
      notifyEnabled: notify ? 1 : 0,
    });
  };

  const askNotifyPermission = async () => {
    if (!("Notification" in window)) {
      toast.error("Il browser non supporta le notifiche");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") toast.success("Notifiche abilitate");
    else toast.error("Permesso notifiche negato dal browser");
  };

  if (query.isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <Target className="h-4 w-4 text-primary" />
            Obiettivi ore
          </CardTitle>
          <CardDescription>
            Gli anelli di progresso in dashboard e timesheet usano questi target.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="daily">Ore al giorno</Label>
            <Input
              id="daily"
              type="number"
              min="0.5"
              max="16"
              step="0.5"
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="weekly">Ore alla settimana</Label>
            <Input
              id="weekly"
              type="number"
              min="1"
              max="80"
              step="1"
              value={weekly}
              onChange={(e) => setWeekly(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <Timer className="h-4 w-4 text-primary" />
            Alert timer
          </CardTitle>
          <CardDescription>
            Ricevi una notifica se un timer resta attivo troppo a lungo
            (utile contro le dimenticanze).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="notify" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifiche browser
            </Label>
            <Switch id="notify" checked={notify} onCheckedChange={setNotify} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="alert">Avvisa dopo (minuti, 0 = mai)</Label>
            <Input
              id="alert"
              type="number"
              min="0"
              max="720"
              step="15"
              value={alertMin}
              onChange={(e) => setAlertMin(e.target.value)}
              disabled={!notify}
            />
          </div>
          {notify && (
            <Button variant="outline" size="sm" onClick={askNotifyPermission} className="w-fit">
              Abilita permesso notifiche
            </Button>
          )}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={update.isPending} className="w-fit">
        <Save className="mr-1.5 h-4 w-4" />
        {update.isPending ? "Salvataggio…" : "Salva impostazioni"}
      </Button>
    </div>
  );
}
