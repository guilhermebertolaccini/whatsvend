import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Phone,
  CheckCircle,
  XCircle,
  Calendar,
  Users,
  UserPlus,
  UserMinus,
  TrendingDown,
  AlertTriangle,
  Filter,
  RefreshCw,
  Search,
  TrendingUp
} from "lucide-react";
import { linesService } from "@/services/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area
} from "recharts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format, parseISO, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DailyHistory {
  date: string;
  created: number;
  banned: number;
}

interface ActivatorProductivity {
  id: number;
  name: string;
  email: string;
  totalCreated: number;
  totalBannedInRange: number;
  currentlyActive: number;
  peakBanDay: { date: string; created: number; banned: number } | null;
  dailyHistory: DailyHistory[];
  lastActivity: string;
}

interface AllocationStats {
  totalActiveLines: number;
  linesWithOperators: number;
  linesWithoutOperators: number;
  linesWithOneOperator: number;
  linesWithTwoOperators: number;
}

export default function ProdutividadeAtivadores() {
  const [productivity, setProductivity] = useState<ActivatorProductivity[]>([]);
  const [allocationStats, setAllocationStats] = useState<AllocationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedActivator, setSelectedActivator] = useState<ActivatorProductivity | null>(null);

  // Filtros de data
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [productivityData, statsData] = await Promise.all([
        linesService.getActivatorsProductivity(startDate, endDate),
        linesService.getAllocationStats(),
      ]);
      setProductivity(productivityData);
      setAllocationStats(statsData);

      // Manter o mesmo ativador selecionado ou resetar se não existir mais
      if (selectedActivator) {
        const found = productivityData.find(p => p.id === selectedActivator.id);
        setSelectedActivator(found || null);
      } else if (productivityData.length > 0) {
        setSelectedActivator(productivityData[0]);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalCreated = (productivity || []).reduce((sum, p) => sum + (p.totalCreated || 0), 0);
  const totalBannedInRange = (productivity || []).reduce((sum, p) => sum + (p.totalBannedInRange || 0), 0);
  const totalActive = (productivity || []).reduce((sum, p) => sum + (p.currentlyActive || 0), 0);

  // Formatar dados do histórico para o gráfico
  const getChartData = (data: DailyHistory[] = []) => {
    if (!data || !Array.isArray(data)) return [];

    return data.map(item => ({
      ...item,
      formattedDate: item.date ? format(parseISO(item.date), 'dd/MM', { locale: ptBR }) : '',
    })).reverse(); // Inverter para ordem cronológica (esq -> dir)
  };

  if (isLoading && productivity.length === 0) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-[80vh]">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground animate-pulse">Carregando métricas de ativadores...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8 pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
              Relatório de Ativadores
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Monitoramento de eficiência e taxas de banimento
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-card p-2 rounded-xl border shadow-sm">
            <div className="flex items-center gap-2 px-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40 h-9 border-none bg-transparent focus-visible:ring-0"
              />
              <span className="text-muted-foreground">até</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40 h-9 border-none bg-transparent focus-visible:ring-0"
              />
            </div>
            <Button onClick={loadData} size="sm" className="gap-2">
              <RefreshCw className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Filtrar
            </Button>
          </div>
        </div>

        {/* Resumo Geral */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="overflow-hidden border-l-4 border-l-primary relative">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Phone className="h-12 w-12" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Subidas no Período</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black">{totalCreated}</div>
              <p className="text-xs text-muted-foreground mt-1 border-t pt-1">
                Total de linhas criadas
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-l-4 border-l-red-500 relative">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <TrendingDown className="h-12 w-12 text-red-500" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Banimentos no Período</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-red-500">{totalBannedInRange}</div>
              <p className="text-xs text-muted-foreground mt-1 border-t pt-1">
                {totalCreated > 0 ? ((totalBannedInRange / totalCreated) * 100).toFixed(1) : 0}% de taxa de queda
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-l-4 border-l-green-500 relative">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Linhas Ativas Agora</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-green-500">{totalActive}</div>
              <p className="text-xs text-muted-foreground mt-1 border-t pt-1">
                Atualmente conectadas
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-l-4 border-l-blue-500 relative bg-blue-50/10">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Users className="h-12 w-12 text-blue-500" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Média por Ativador</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-blue-600">
                {productivity.length > 0 ? (totalCreated / productivity.length).toFixed(1) : 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1 border-t pt-1">
                Linhas / Ativador
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Dashboards e Gráficos */}
        <div className="grid gap-6 lg:grid-cols-12">

          {/* Coluna da Esquerda: Ranking */}
          <Card className="lg:col-span-5 shadow-lg border-muted/60">
            <CardHeader className="border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Ranking de Produtividade</CardTitle>
                  <CardDescription>Ativadores ordenados por volume</CardDescription>
                </div>
                <Badge variant="secondary" className="px-3 py-1 font-bold">TOP {productivity.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader className="bg-muted/30 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="pl-6">Ativador</TableHead>
                      <TableHead className="text-right">Criadas</TableHead>
                      <TableHead className="text-right pr-6">Banidas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(productivity || []).map((activator, idx) => (
                      <TableRow
                        key={activator.id}
                        className={`cursor-pointer transition-colors ${selectedActivator?.id === activator.id ? 'bg-primary/10 border-l-4 border-l-primary' : 'hover:bg-muted/40'}`}
                        onClick={() => setSelectedActivator(activator)}
                      >
                        <TableCell className="pl-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-muted-foreground w-4">{idx + 1}.</span>
                            <div>
                              <div className="font-bold flex items-center gap-2">
                                {activator.name}
                                {idx === 0 && <Badge className="bg-amber-400 text-amber-900 border-none scale-75">MVP</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground">{activator.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-black text-lg">{activator.totalCreated}</TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-red-500">{activator.totalBannedInRange}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {activator.totalCreated > 0 ? ((activator.totalBannedInRange / activator.totalCreated) * 100).toFixed(0) : 0}% queda
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Coluna da Direita: Detalhamento do Ativador */}
          <div className="lg:col-span-7 space-y-6">
            {selectedActivator ? (
              <>
                <Card className="shadow-lg overflow-hidden">
                  <div className="bg-primary/5 p-6 border-b flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-black text-xl">
                        {selectedActivator.name.charAt(0)}
                      </div>
                      <div>
                        <h2 className="text-2xl font-black">{selectedActivator.name}</h2>
                        <p className="text-muted-foreground text-sm">{selectedActivator.email}</p>
                      </div>
                    </div>
                    {selectedActivator.peakBanDay && selectedActivator.peakBanDay.date && (
                      <div className="bg-red-50 text-red-600 p-3 rounded-lg border border-red-100 flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5" />
                        <div>
                          <div className="text-[10px] font-bold uppercase opacity-70">Pico de Banimento</div>
                          <div className="font-black">
                            {format(parseISO(selectedActivator.peakBanDay.date), 'dd/MM')} — {selectedActivator.peakBanDay.banned} quedas
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <CardContent className="p-6">
                    <div className="mb-6 flex items-center justify-between">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        Histórico Diário (Período)
                      </h3>
                      <div className="flex items-center gap-4 text-xs font-bold">
                        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-primary"></div> Criadas</div>
                        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-red-400"></div> Banidas</div>
                      </div>
                    </div>

                    <div className="h-[300px] w-full mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={getChartData(selectedActivator.dailyHistory || [])}>
                          <defs>
                            <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorBanned" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                          <XAxis
                            dataKey="formattedDate"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                          />
                          <Tooltip
                            contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Area
                            type="monotone"
                            dataKey="created"
                            stroke="hsl(var(--primary))"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorCreated)"
                            name="Criadas"
                          />
                          <Area
                            type="monotone"
                            dataKey="banned"
                            stroke="#f87171"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorBanned)"
                            name="Banidas"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mt-8">
                      <h4 className="font-bold text-sm text-muted-foreground uppercase mb-4 tracking-widest">Últimos Registros</h4>
                      <div className="grid grid-cols-4 gap-4 text-center">
                        {(selectedActivator.dailyHistory || []).slice(0, 4).map(day => (
                          <div key={day.date} className="p-3 bg-muted/30 rounded-xl border border-muted ring-offset-2 hover:ring-2 transition-all">
                            <div className="text-[10px] uppercase font-black text-muted-foreground mb-1">
                              {day.date ? (
                                <>
                                  {format(parseISO(day.date), 'EEE', { locale: ptBR })} {format(parseISO(day.date), 'dd/MM')}
                                </>
                              ) : 'N/A'}
                            </div>
                            <div className="flex justify-center items-end gap-1">
                              <span className="text-xl font-black">{day.created || 0}</span>
                              <span className="text-[10px] text-green-600 pb-1 font-bold">up</span>
                            </div>
                            <div className="text-xs font-bold text-red-400">-{day.banned || 0} quedas</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-12 text-center text-muted-foreground opacity-60">
                <Search className="h-16 w-16 mb-4" />
                <h3 className="text-xl font-bold">Resumo Individual</h3>
                <p>Selecione um ativador no ranking para ver o detalhamento diário de picos e quedas.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}


