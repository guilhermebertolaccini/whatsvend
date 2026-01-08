import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

// Pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Atendimento from "./pages/Atendimento";
import Supervisionar from "./pages/Supervisionar";
import Usuarios from "./pages/Usuarios";
import Contatos from "./pages/Contatos";
import Segmentos from "./pages/Segmentos";
import Tabulacoes from "./pages/Tabulacoes";
import Campanhas from "./pages/Campanhas";
import Linhas from "./pages/Linhas";
import Relatorios from "./pages/Relatorios";
import Blocklist from "./pages/Blocklist";
import Evolution from "./pages/Evolution";
import Tags from "./pages/Tags";
import LogsAPI from "./pages/LogsAPI";
import Templates from "./pages/Templates";
import PainelControle from "./pages/PainelControle";
import ProdutividadeAtivadores from "./pages/ProdutividadeAtivadores";
import Acompanhamento from "./pages/Acompanhamento";
import OperadoresOnline from "./pages/OperadoresOnline";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  
  if (isAuthenticated) {
    // Operadores devem ir direto para /atendimento
    if (user?.role === 'operador') {
      return <Navigate to="/atendimento" replace />;
    }
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function DashboardRoute() {
  const { user } = useAuth();
  
  // Operadores não podem acessar o dashboard, redirecionar para /atendimento
  if (user?.role === 'operador') {
    return <Navigate to="/atendimento" replace />;
  }
  
  return <Dashboard />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><DashboardRoute /></ProtectedRoute>} />
      <Route path="/atendimento" element={<ProtectedRoute><Atendimento /></ProtectedRoute>} />
      <Route path="/supervisionar" element={<ProtectedRoute><Supervisionar /></ProtectedRoute>} />
      <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
      <Route path="/contatos" element={<ProtectedRoute><Contatos /></ProtectedRoute>} />
      <Route path="/segmentos" element={<ProtectedRoute><Segmentos /></ProtectedRoute>} />
      <Route path="/tabulacoes" element={<ProtectedRoute><Tabulacoes /></ProtectedRoute>} />
      <Route path="/campanhas" element={<ProtectedRoute><Campanhas /></ProtectedRoute>} />
      <Route path="/linhas" element={<ProtectedRoute><Linhas /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
      <Route path="/blocklist" element={<ProtectedRoute><Blocklist /></ProtectedRoute>} />
      <Route path="/evolution" element={<ProtectedRoute><Evolution /></ProtectedRoute>} />
      <Route path="/tags" element={<ProtectedRoute><Tags /></ProtectedRoute>} />
      <Route path="/logs" element={<ProtectedRoute><LogsAPI /></ProtectedRoute>} />
      <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
      <Route path="/painel-controle" element={<ProtectedRoute><PainelControle /></ProtectedRoute>} />
      <Route path="/produtividade-ativadores" element={<ProtectedRoute><ProdutividadeAtivadores /></ProtectedRoute>} />
      <Route path="/acompanhamento" element={<ProtectedRoute><Acompanhamento /></ProtectedRoute>} />
      <Route path="/operadores-online" element={<ProtectedRoute><OperadoresOnline /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </SettingsProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
