import { useState, useEffect, useCallback } from "react";
import { Headphones, Loader2, TrendingUp, MessageSquare, Users, Wifi, WifiOff } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { conversationsService, usersService, linesService, DailyStats } from "@/services/api";
import { useRealtimeConnection, useRealtimeSubscription } from "@/hooks/useRealtimeConnection";
import { WS_EVENTS } from "@/services/websocket";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DashboardMetrics {
  activeConversations: number;
  onlineOperators: number;
  availableLines: number;
}

const chartConfig = {
  conversations: {
    label: "Conversas",
    color: "hsl(var(--primary))",
  },
  messages: {
    label: "Mensagens",
    color: "hsl(var(--cyan))",
  },
  operators: {
    label: "Operadores",
    color: "hsl(var(--success))",
  },
};

export default function Dashboard() {
  const { user } = useAuth();
  const { isConnected: isRealtimeConnected } = useRealtimeConnection();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    activeConversations: 0,
    onlineOperators: 0,
    availableLines: 0,
  });
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingChart, setIsLoadingChart] = useState(true);

  // Subscribe to real-time metrics updates
  useRealtimeSubscription(WS_EVENTS.METRICS_UPDATE, (data: any) => {
    console.log('[Dashboard] Received metrics update:', data);
    if (data.metrics) {
      setMetrics(data.metrics);
    }
  });

  // Subscribe to conversation updates
  useRealtimeSubscription(WS_EVENTS.NEW_CONVERSATION, () => {
    console.log('[Dashboard] New conversation received');
    setMetrics(prev => ({
      ...prev,
      activeConversations: prev.activeConversations + 1,
    }));
  });

  // Subscribe to operator status changes
  useRealtimeSubscription(WS_EVENTS.OPERATOR_STATUS, (data: any) => {
    console.log('[Dashboard] Operator status changed:', data);
    if (data.onlineCount !== undefined) {
      setMetrics(prev => ({
        ...prev,
        onlineOperators: data.onlineCount,
      }));
    }
  });

  // Subscribe to line status changes
  useRealtimeSubscription(WS_EVENTS.LINE_STATUS, (data: any) => {
    console.log('[Dashboard] Line status changed:', data);
    if (data.activeCount !== undefined) {
      setMetrics(prev => ({
        ...prev,
        availableLines: data.activeCount,
      }));
    }
  });

  const loadMetrics = useCallback(async () => {
    try {
      // Admin busca todas as métricas
      // Supervisor e Operador não precisam buscar operadores online e linhas ativas
      if (user?.role === 'admin') {
        const [conversations, operators, lines] = await Promise.all([
          conversationsService.getActive().catch(() => []),
          usersService.getOnlineOperators().catch(() => []),
          linesService.list({ lineStatus: 'active' }).catch(() => []),
        ]);

        // Group conversations by contact phone to get unique active conversations
        const uniqueConversations = new Set(conversations.map(c => c.contactPhone));

        setMetrics({
          activeConversations: uniqueConversations.size,
          onlineOperators: operators.length,
          availableLines: lines.length,
        });
      } else {
        // Supervisor e Operador: apenas conversas ativas
        const conversations = await conversationsService.getActive().catch(() => []);
        const uniqueConversations = new Set(conversations.map(c => c.contactPhone));

        setMetrics({
          activeConversations: uniqueConversations.size,
          onlineOperators: 0, // Não mostrar
          availableLines: 0, // Não mostrar
        });
      }
    } catch (error) {
      console.error('Error loading dashboard metrics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.role]);

  const loadDailyStats = useCallback(async () => {
    try {
      // Buscar conversas dos últimos 7 dias para gerar estatísticas reais
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // 7 dias incluindo hoje

      // Buscar todas as conversas dos últimos 7 dias
      const allConversations = await conversationsService.list({});
      
      // Agrupar por dia
      const statsByDay = new Map<string, { conversations: Set<string>; messages: number; operators: Set<number> }>();
      const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      
      // Inicializar todos os dias
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - (6 - i));
        const dayKey = `${days[date.getDay()]}, ${date.getDate().toString().padStart(2, '0')}`;
        statsByDay.set(dayKey, { conversations: new Set(), messages: 0, operators: new Set() });
      }

      // Processar conversas
      allConversations.forEach((conv: any) => {
        const convDate = new Date(conv.datetime);
        if (convDate >= sevenDaysAgo) {
          const dayKey = `${days[convDate.getDay()]}, ${convDate.getDate().toString().padStart(2, '0')}`;
          const stats = statsByDay.get(dayKey);
          if (stats) {
            stats.conversations.add(conv.contactPhone);
            stats.messages += 1;
            if (conv.userLine) {
              stats.operators.add(conv.userLine);
            }
          }
        }
      });

      // Buscar operadores online de cada dia (apenas para admin)
      let onlineCount = 0;
      if (user?.role === 'admin') {
        try {
          const onlineOperators = await usersService.getOnlineOperators();
          onlineCount = onlineOperators.length;
        } catch (error) {
          console.warn('Error loading online operators for stats:', error);
          // Usar apenas o histórico se não conseguir buscar
        }
      }

      // Converter para array
      const statsArray: DailyStats[] = Array.from(statsByDay.entries()).map(([date, stats]) => ({
        date,
        conversations: stats.conversations.size,
        messages: stats.messages,
        operators: user?.role === 'admin' 
          ? Math.max(stats.operators.size, onlineCount) // Usar o maior entre histórico e atual (apenas admin)
          : stats.operators.size, // Não-admin: usar apenas histórico
      }));

      setDailyStats(statsArray);
    } catch (error) {
      console.error('Error loading daily stats:', error);
      // Em caso de erro, usar dados vazios ao invés de mockados
      const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const today = new Date();
      const emptyStats: DailyStats[] = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(today);
        date.setDate(date.getDate() - (6 - i));
        return {
          date: `${days[date.getDay()]}, ${date.getDate().toString().padStart(2, '0')}`,
          conversations: 0,
          messages: 0,
          operators: 0,
        };
      });
      setDailyStats(emptyStats);
    } finally {
      setIsLoadingChart(false);
    }
  }, [user?.role]);

  useEffect(() => {
    loadMetrics();
    loadDailyStats();
  }, [loadMetrics, loadDailyStats]);

  // Only poll if WebSocket is not connected (fallback)
  useEffect(() => {
    if (isRealtimeConnected) {
      console.log('[Dashboard] WebSocket connected, polling disabled');
      return;
    }

    console.log('[Dashboard] WebSocket not connected, using polling fallback');
    const interval = setInterval(() => {
      loadMetrics();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadMetrics, isRealtimeConnected]);

  // Filtrar métricas baseado no role do usuário
  // Admin vê tudo, Supervisor e Operador não veem "Linhas Ativas" e "Operadores Online"
  const metricsDisplay = [
    {
      label: "Conversas Ativas",
      value: isLoading ? "-" : metrics.activeConversations.toString(),
      color: "text-primary",
      bgColor: "bg-primary/10",
      show: true, // Todos veem
    },
    {
      label: "Operadores Online",
      value: isLoading ? "-" : metrics.onlineOperators.toString(),
      color: "text-success",
      bgColor: "bg-success/10",
      show: user?.role === 'admin', // Apenas admin vê
    },
    {
      label: "Linhas Ativas",
      value: isLoading ? "-" : `${metrics.availableLines} ${metrics.availableLines === 1 ? 'linha' : 'linhas'}`,
      color: "text-cyan",
      bgColor: "bg-cyan/10",
      show: user?.role === 'admin', // Apenas admin vê
    }
  ].filter(metric => metric.show);

  const tags = [
    { label: "Tempo real", color: "bg-primary text-primary-foreground" },
    { label: "Supervisão", color: "bg-warning text-warning-foreground" },
    { label: "Campanhas", color: "bg-success text-success-foreground" }
  ];

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto scrollbar-content">
        <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
        {/* Welcome Card */}
        <GlassCard className="w-full animate-fade-in" padding="lg">
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Icon */}
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-cyan flex items-center justify-center shadow-xl shrink-0">
              <Headphones className="w-10 h-10 text-primary-foreground" />
            </div>

            <div className="flex-1 text-center md:text-left">
              {/* Welcome */}
              <h1 className="text-2xl font-bold text-foreground mb-1">
                Olá, {user?.name?.split(' ')[0]}! 👋
              </h1>
              <p className="text-muted-foreground mb-4 max-w-md">
                Conectando empresas e clientes pelo WhatsApp.
              </p>

              {/* Tags with connection status */}
              <div className="flex gap-2 justify-center md:justify-start items-center">
                {tags.map((tag) => (
                  <Badge key={tag.label} className={tag.color}>
                    {tag.label}
                  </Badge>
                ))}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                        isRealtimeConnected 
                          ? 'bg-success/10 text-success' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {isRealtimeConnected ? (
                          <Wifi className="h-3 w-3" />
                        ) : (
                          <WifiOff className="h-3 w-3" />
                        )}
                        <span>{isRealtimeConnected ? 'Online' : 'Offline'}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isRealtimeConnected 
                        ? 'Conectado em tempo real' 
                        : 'Usando polling (30s)'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Metrics */}
            <div className="flex flex-wrap md:flex-nowrap gap-4 justify-center">
              {metricsDisplay.map((metric) => (
                <div
                  key={metric.label}
                  className={`${metric.bgColor} rounded-xl p-4 transition-transform hover:scale-105 min-w-[120px] text-center`}
                >
                  {isLoading ? (
                    <div className="flex justify-center py-2">
                      <Loader2 className={`h-6 w-6 animate-spin ${metric.color}`} />
                    </div>
                  ) : (
                    <p className={`text-2xl font-bold ${metric.color}`}>
                      {metric.value}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {metric.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conversations Area Chart */}
          <GlassCard className="animate-fade-in" padding="md">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Conversas dos Últimos 7 Dias</h2>
            </div>
            {isLoadingChart ? (
              <div className="flex items-center justify-center h-[250px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <AreaChart data={dailyStats} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="conversationsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="conversations"
                    stroke="hsl(var(--primary))"
                    fill="url(#conversationsGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </GlassCard>

          {/* Messages Bar Chart */}
          <GlassCard className="animate-fade-in" padding="md">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-5 w-5 text-cyan" />
              <h2 className="text-lg font-semibold text-foreground">Mensagens por Dia</h2>
            </div>
            {isLoadingChart ? (
              <div className="flex items-center justify-center h-[250px]">
                <Loader2 className="h-8 w-8 animate-spin text-cyan" />
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart data={dailyStats} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="messages" fill="hsl(var(--cyan))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </GlassCard>

          {/* Operators Activity */}
          <GlassCard className="lg:col-span-2 animate-fade-in" padding="md">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-success" />
              <h2 className="text-lg font-semibold text-foreground">Atividade de Operadores</h2>
            </div>
            {isLoadingChart ? (
              <div className="flex items-center justify-center h-[200px]">
                <Loader2 className="h-8 w-8 animate-spin text-success" />
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <AreaChart data={dailyStats} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="operatorsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    type="monotone"
                    dataKey="operators"
                    stroke="hsl(var(--success))"
                    fill="url(#operatorsGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </GlassCard>
        </div>
      </div>
      </div>
    </MainLayout>
  );
}
