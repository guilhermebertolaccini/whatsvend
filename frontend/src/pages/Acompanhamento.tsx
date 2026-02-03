import { useState, useEffect, useCallback } from "react";
import { 
  Activity, 
  Filter, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Info, 
  AlertTriangle,
  Clock,
  User as UserIcon,
  MessageSquare,
  Phone,
  Ban,
  Loader2,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { systemEventsService, SystemEvent, usersService, User } from "@/services/api";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

// Cores para os gráficos
const COLORS = {
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
  success: '#10b981',
};

const severityColors: Record<string, string> = {
  info: COLORS.info,
  warning: COLORS.warning,
  error: COLORS.error,
  success: COLORS.success,
};

// Ícones por tipo de evento
const getEventIcon = (type: string) => {
  if (type.includes('operator')) return <UserIcon className="h-4 w-4" />;
  if (type.includes('line')) return <Phone className="h-4 w-4" />;
  if (type.includes('message')) return <MessageSquare className="h-4 w-4" />;
  if (type.includes('error') || type.includes('timeout')) return <AlertCircle className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
};

// Badge de severidade
const SeverityBadge = ({ severity }: { severity: string }) => {
  const config = {
    info: { label: 'Info', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
    warning: { label: 'Aviso', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
    error: { label: 'Erro', className: 'bg-red-500/10 text-red-500 border-red-500/20' },
    success: { label: 'Sucesso', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
  };

  const { label, className } = config[severity as keyof typeof config] || config.info;

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
};

export default function Acompanhamento() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Verificar se é admin
  useEffect(() => {
    if (user && user.role !== 'admin') {
      toast({
        title: "Acesso negado",
        description: "Esta página é restrita apenas para administradores",
        variant: "destructive",
      });
      navigate('/');
    }
  }, [user, navigate]);
  
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  
  // Filtros
  const [filters, setFilters] = useState({
    type: '',
    module: '',
    userId: '',
    severity: '',
    startDate: format(new Date(Date.now() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    limit: 100,
    offset: 0,
  });

  // Métricas
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [eventsPerMinute, setEventsPerMinute] = useState<{ time: string; count: number }[]>([]);
  const [groupBy, setGroupBy] = useState<'type' | 'module' | 'severity'>('type');

  // Carregar usuários
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const data = await usersService.list();
        setUsers(data);
      } catch (error) {
        console.error('Erro ao carregar usuários:', error);
      }
    };
    loadUsers();
  }, []);

  // Carregar eventos
  const loadEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await systemEventsService.getEvents({
        type: filters.type || undefined,
        module: filters.module || undefined,
        userId: filters.userId ? Number(filters.userId) : undefined,
        severity: filters.severity || undefined,
        startDate: filters.startDate ? `${filters.startDate}T00:00:00` : undefined,
        endDate: filters.endDate ? `${filters.endDate}T23:59:59` : undefined,
        limit: filters.limit,
        offset: filters.offset,
      });
      setEvents(response.events);
      setTotal(response.total);
    } catch (error) {
      console.error('Erro ao carregar eventos:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os eventos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filters]);

  // Carregar métricas
  const loadMetrics = useCallback(async () => {
    try {
      const [metricsData, perMinuteData] = await Promise.all([
        systemEventsService.getMetrics({
          startDate: filters.startDate ? `${filters.startDate}T00:00:00` : undefined,
          endDate: filters.endDate ? `${filters.endDate}T23:59:59` : undefined,
          groupBy,
        }),
        systemEventsService.getEventsPerMinute({
          startDate: filters.startDate ? `${filters.startDate}T00:00:00` : undefined,
          endDate: filters.endDate ? `${filters.endDate}T23:59:59` : undefined,
        }),
      ]);
      setMetrics(metricsData);
      setEventsPerMinute(perMinuteData);
    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    }
  }, [filters.startDate, filters.endDate, groupBy]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadEvents();
    loadMetrics();
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value, offset: 0 }));
  };

  // Preparar dados para gráficos
  const metricsChartData = Object.entries(metrics).map(([name, value]) => ({
    name: name.length > 20 ? name.substring(0, 20) + '...' : name,
    value,
    fullName: name,
  })).sort((a, b) => b.value - a.value).slice(0, 10);

  const severityChartData = [
    { name: 'Info', value: metrics['info'] || 0, color: COLORS.info },
    { name: 'Aviso', value: metrics['warning'] || 0, color: COLORS.warning },
    { name: 'Erro', value: metrics['error'] || 0, color: COLORS.error },
    { name: 'Sucesso', value: metrics['success'] || 0, color: COLORS.success },
  ].filter(item => item.value > 0);

  // Tipos de eventos disponíveis
  const eventTypes = [
    'operator_connected',
    'operator_disconnected',
    'line_assigned',
    'line_reallocated',
    'line_banned',
    'message_sent',
    'message_received',
    'message_queued',
    'api_error',
    'timeout_error',
    'cpc_triggered',
    'repescagem_triggered',
    'auto_message_sent',
  ];

  // Módulos disponíveis
  const modules = [
    'websocket',
    'lines',
    'webhooks',
    'control_panel',
    'conversations',
    'api_messages',
    'auto_message',
  ];

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto scrollbar-content">
        <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Activity className="h-8 w-8 text-primary" />
              Acompanhamento do Sistema
            </h1>
            <p className="text-muted-foreground mt-1">
              Timeline de eventos, métricas e alertas em tempo real
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Atualizando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </>
            )}
          </Button>
        </div>

        {/* Filtros */}
        <GlassCard>
          <div className="flex items-center gap-3 mb-4">
            <Filter className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Filtros</h2>
          </div>
          <Separator className="mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Evento</Label>
              <Select value={filters.type || "all"} onValueChange={(value) => handleFilterChange('type', value === "all" ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {eventTypes.map(type => (
                    <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Módulo</Label>
              <Select value={filters.module || "all"} onValueChange={(value) => handleFilterChange('module', value === "all" ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os módulos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os módulos</SelectItem>
                  {modules.map(module => (
                    <SelectItem key={module} value={module}>{module}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severidade</Label>
              <Select value={filters.severity || "all"} onValueChange={(value) => handleFilterChange('severity', value === "all" ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Aviso</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                  <SelectItem value="success">Sucesso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Operador</Label>
              <Select value={filters.userId || "all"} onValueChange={(value) => handleFilterChange('userId', value === "all" ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {users.filter(u => u.role === 'operator').map(user => (
                    <SelectItem key={user.id} value={user.id.toString()}>{user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Data Final</Label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
            </div>
          </div>
        </GlassCard>

        {/* Métricas e Gráficos */}
        <Tabs defaultValue="timeline" className="space-y-4">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="metrics">Métricas</TabsTrigger>
            <TabsTrigger value="charts">Gráficos</TabsTrigger>
          </TabsList>

          {/* Timeline */}
          <TabsContent value="timeline" className="space-y-4">
            <GlassCard>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Eventos Recentes</h2>
                <Badge variant="outline">{total} eventos</Badge>
              </div>
              <Separator className="mb-4" />
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : events.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhum evento encontrado
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-4 p-4 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors"
                    >
                      <div className="mt-1 text-muted-foreground">
                        {getEventIcon(event.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{event.type.replace(/_/g, ' ')}</span>
                          <SeverityBadge severity={event.severity} />
                          <Badge variant="outline" className="text-xs">
                            {event.module}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {format(new Date(event.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                          {event.user && (
                            <span className="ml-2">• {event.user.name}</span>
                          )}
                        </div>
                        {event.data && (
                          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mt-2 font-mono">
                            {JSON.stringify(event.data, null, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </TabsContent>

          {/* Métricas */}
          <TabsContent value="metrics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total de Eventos</p>
                    <p className="text-2xl font-bold">{total}</p>
                  </div>
                  <Activity className="h-8 w-8 text-primary opacity-50" />
                </div>
              </GlassCard>
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Erros</p>
                    <p className="text-2xl font-bold text-red-500">{metrics['error'] || 0}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-red-500 opacity-50" />
                </div>
              </GlassCard>
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Avisos</p>
                    <p className="text-2xl font-bold text-yellow-500">{metrics['warning'] || 0}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-yellow-500 opacity-50" />
                </div>
              </GlassCard>
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Sucessos</p>
                    <p className="text-2xl font-bold text-green-500">{metrics['success'] || 0}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
                </div>
              </GlassCard>
            </div>

            <GlassCard>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Agrupar por</h2>
                <Select value={groupBy} onValueChange={(value: 'type' | 'module' | 'severity') => setGroupBy(value)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="type">Tipo</SelectItem>
                    <SelectItem value="module">Módulo</SelectItem>
                    <SelectItem value="severity">Severidade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator className="mb-4" />
              <div className="space-y-2">
                {Object.entries(metrics)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                      <span className="font-medium">{name}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
              </div>
            </GlassCard>
          </TabsContent>

          {/* Gráficos */}
          <TabsContent value="charts" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Gráfico de eventos por minuto */}
              <GlassCard>
                <h2 className="text-lg font-semibold mb-4">Eventos por Minuto</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={eventsPerMinute}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      stroke={COLORS.info} 
                      strokeWidth={2}
                      name="Eventos"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </GlassCard>

              {/* Gráfico de severidade */}
              <GlassCard>
                <h2 className="text-lg font-semibold mb-4">Distribuição por Severidade</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={severityChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {severityChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </GlassCard>

              {/* Top 10 eventos */}
              <GlassCard className="lg:col-span-2">
                <h2 className="text-lg font-semibold mb-4">Top 10 Eventos</h2>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={metricsChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number, name: string, props: any) => [
                        value,
                        props.payload.fullName
                      ]}
                    />
                    <Legend />
                    <Bar dataKey="value" fill={COLORS.info} name="Quantidade" />
                  </BarChart>
                </ResponsiveContainer>
              </GlassCard>
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}

