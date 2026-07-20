import { Routes, Route, Navigate } from "react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { AppLayout } from "@/components/AppLayout";
import { useRequireAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui/spinner";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Issues from "@/pages/Issues";
import IssueDetail from "@/pages/IssueDetail";
import Timesheet from "@/pages/Timesheet";

function Protected({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useRequireAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!isAuthenticated) return null;
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/issues" element={<Protected><Issues /></Protected>} />
        <Route path="/issues/:key" element={<Protected><IssueDetail /></Protected>} />
        <Route path="/timesheet" element={<Protected><Timesheet /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="bottom-right" />
    </ThemeProvider>
  );
}
