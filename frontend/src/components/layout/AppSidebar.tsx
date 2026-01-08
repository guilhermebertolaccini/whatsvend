import { useState } from "react";
import {
  Headphones,
  Eye,
  BookUser,
  Megaphone,
  Table2,
  Filter,
  Ban,
  FileText,
  BarChart3,
  RefreshCw,
  Phone,
  Users,
  Tags,
  Code,
  LogOut,
  Settings,
  Sliders,
  Moon,
  Sun,
  TrendingUp,
  Activity,
  UserCheck,
} from "lucide-react";
import { useLocation, Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { VendLogo } from "./VendLogo";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/auth";
import { NotificationSettingsDialog } from "@/components/settings/NotificationSettingsDialog";
import { useTheme } from "next-themes";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ElementType;
  color: string;
  roles: UserRole[];
}

const menuItems: MenuItem[] = [
  {
    title: "Atendimento",
    url: "/atendimento",
    icon: Headphones,
    color: "text-cyan",
    roles: ["operador", "admin"],
  },
  {
    title: "Supervisionar",
    url: "/supervisionar",
    icon: Eye,
    color: "text-warning",
    roles: ["supervisor", "admin", "digital"],
  },
  {
    title: "Contatos",
    url: "/contatos",
    icon: BookUser,
    color: "text-cyan",
    roles: ["supervisor", "admin", "digital"],
  },
  {
    title: "Campanhas",
    url: "/campanhas",
    icon: Megaphone,
    color: "text-primary",
    roles: ["supervisor", "admin", "digital"],
  },
  {
    title: "Tabulações",
    url: "/tabulacoes",
    icon: Table2,
    color: "text-whatsapp",
    roles: ["supervisor", "admin", "digital"],
  },
  {
    title: "Segmentos",
    url: "/segmentos",
    icon: Filter,
    color: "text-destructive",
    roles: ["admin"],
  },
  {
    title: "Blocklist",
    url: "/blocklist",
    icon: Ban,
    color: "text-muted-foreground",
    roles: ["supervisor", "admin", "digital"],
  },
  {
    title: "Templates",
    url: "/templates",
    icon: FileText,
    color: "text-primary",
    roles: ["supervisor", "admin", "digital"],
  },
  {
    title: "Relatórios",
    url: "/relatorios",
    icon: BarChart3,
    color: "text-success",
    roles: ["supervisor", "admin", "digital"],
  },
  {
    title: "Acompanhamento",
    url: "/acompanhamento",
    icon: Activity,
    color: "text-primary",
    roles: ["admin"],
  },
  {
    title: "Produtividade Ativadores",
    url: "/produtividade-ativadores",
    icon: TrendingUp,
    color: "text-success",
    roles: ["admin"],
  },
  {
    title: "Painel Controle",
    url: "/painel-controle",
    icon: Sliders,
    color: "text-purple-500",
    roles: ["admin"],
  },
  {
    title: "Evolution",
    url: "/evolution",
    icon: RefreshCw,
    color: "text-primary",
    roles: ["admin"],
  },
  {
    title: "Linhas",
    url: "/linhas",
    icon: Phone,
    color: "text-whatsapp",
    roles: ["admin", "ativador"],
  },
  {
    title: "Usuários",
    url: "/usuarios",
    icon: Users,
    color: "text-warning",
    roles: ["admin"],
  },
  {
    title: "Operadores Online",
    url: "/operadores-online",
    icon: UserCheck,
    color: "text-success",
    roles: ["admin"],
  },
  {
    title: "Tags",
    url: "/tags",
    icon: Tags,
    color: "text-cyan",
    roles: ["admin"],
  },
  {
    title: "Logs API",
    url: "/logs",
    icon: Code,
    color: "text-destructive",
    roles: ["admin"],
  },
];

export function AppSidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  if (!user) return null;

  const filteredItems = menuItems.filter((item) =>
    item.roles.includes(user.role)
  );
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleLabels: Record<UserRole, string> = {
    admin: "Administrador",
    supervisor: "Supervisor",
    operador: "Operador",
    ativador: "Ativador",
    digital: "Digital",
  };

  const toggleTheme = () => {
    setTheme(!theme || theme === "light" ? "dark" : "light");
  };

  return (
    <>
      <aside className="w-64 h-screen bg-sidebar flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-sidebar-border flex justify-center flex-shrink-0">
          <VendLogo size="xl" showText={false} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto scrollbar-sidebar">
          <ul className="space-y-1">
            {filteredItems.map((item) => {
              const isActive = location.pathname === item.url;
              const Icon = item.icon;

              return (
                <li key={item.url}>
                  <Link
                    to={item.url}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                      "hover:bg-sidebar-accent/20",
                      isActive &&
                        "bg-gradient-to-r from-primary/20 to-cyan/10 text-sidebar-foreground"
                    )}
                  >
                    <Icon className={cn("w-5 h-5", item.color)} />
                    <span className="text-sm font-medium text-sidebar-foreground">
                      {item.title}
                    </span>
                  </Link>
                </li>
              );
            })}

            {/* Separador */}
            <li className="pt-2 mt-2 border-t border-sidebar-border">
              <button
                onClick={toggleTheme}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                  "hover:bg-sidebar-accent/20 text-sidebar-foreground"
                )}
              >
                {!theme || theme === "light" ? (
                  <Moon className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Sun className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {!theme || theme === "light" ? "Modo Escuro" : "Modo Claro"}
                </span>
              </button>
            </li>

            <li>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                  "hover:bg-sidebar-accent/20 text-sidebar-foreground"
                )}
              >
                <Settings className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">Configurações</span>
              </button>
            </li>
          </ul>
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-sidebar-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-cyan flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground">
                {initials}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {roleLabels[user.role]}
              </p>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-sidebar-accent/20 transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </aside>

      <NotificationSettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      />
    </>
  );
}
