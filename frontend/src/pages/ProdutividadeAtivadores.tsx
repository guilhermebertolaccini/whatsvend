import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Phone, CheckCircle, XCircle, Calendar, Users, UserPlus, UserMinus } from "lucide-react";
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
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";

interface ActivatorProductivity {
  id: number;
  name: string;
  email: string;
  totalLines: number;
  activeLines: number;
  bannedLines: number;
  linesByMonth: Record<string, number>;
  createdAt: string;
  updatedAt: string; // Última atualização (pode indicar último login)
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

  useEffect(() => {
    loadProductivity();
  }, []);

  const loadProductivity = async () => {
    setIsLoading(true);
    try {
      const [productivityData, statsData] = await Promise.all([
        linesService.getActivatorsProductivity(),
        linesService.getAllocationStats(),
      ]);
      setProductivity(productivityData);
      setAllocationStats(statsData);
    } catch (error) {
      console.error("Erro ao carregar produtividade:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalLines = productivity.reduce((sum, p) => sum + p.totalLines, 0);
  const totalActive = productivity.reduce((sum, p) => sum + p.activeLines, 0);
  const totalBanned = productivity.reduce((sum, p) => sum + p.bannedLines, 0);

  // Preparar dados para gráfico mensal
  const chartData = selectedActivator
    ? Object.entries(selectedActivator.linesByMonth).map(([month, count]) => ({
        month,
        count,
      }))
    : [];

  if (isLoading) {
    return (
      <MainLayout>
        <div className="h-full overflow-y-auto scrollbar-content">
          <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Produtividade dos Ativadores</h1>
          <p className="text-muted-foreground mt-2">
            Acompanhe a quantidade de linhas criadas por cada ativador
          </p>
        </div>

        {/* Cards de resumo - Produtividade */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Linhas</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLines}</div>
              <p className="text-xs text-muted-foreground">
                Criadas por {productivity.length} ativador(es)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Linhas Ativas</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{totalActive}</div>
              <p className="text-xs text-muted-foreground">
                {totalLines > 0 ? Math.round((totalActive / totalLines) * 100) : 0}% do total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Linhas Banidas</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{totalBanned}</div>
              <p className="text-xs text-muted-foreground">
                {totalLines > 0 ? Math.round((totalBanned / totalLines) * 100) : 0}% do total
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Cards de alocação de operadores */}
        {allocationStats && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Linhas com Operador</CardTitle>
                <Users className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{allocationStats.linesWithOperators}</div>
                <p className="text-xs text-muted-foreground">
                  {allocationStats.totalActiveLines > 0 
                    ? Math.round((allocationStats.linesWithOperators / allocationStats.totalActiveLines) * 100) 
                    : 0}% do total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Linhas sem Operador</CardTitle>
                <UserMinus className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{allocationStats.linesWithoutOperators}</div>
                <p className="text-xs text-muted-foreground">
                  {allocationStats.totalActiveLines > 0 
                    ? Math.round((allocationStats.linesWithoutOperators / allocationStats.totalActiveLines) * 100) 
                    : 0}% do total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Linhas com 1 Operador</CardTitle>
                <UserPlus className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{allocationStats.linesWithOneOperator}</div>
                <p className="text-xs text-muted-foreground">
                  {allocationStats.linesWithOperators > 0 
                    ? Math.round((allocationStats.linesWithOneOperator / allocationStats.linesWithOperators) * 100) 
                    : 0}% das alocadas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Linhas com 2 Operadores</CardTitle>
                <Users className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">{allocationStats.linesWithTwoOperators}</div>
                <p className="text-xs text-muted-foreground">
                  {allocationStats.linesWithOperators > 0 
                    ? Math.round((allocationStats.linesWithTwoOperators / allocationStats.linesWithOperators) * 100) 
                    : 0}% das alocadas
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Tabela de ativadores */}
          <Card>
            <CardHeader>
              <CardTitle>Ranking de Ativadores</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ativador</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Ativas</TableHead>
                    <TableHead className="text-right">Banidas</TableHead>
                    <TableHead className="text-right">Último Login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productivity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Nenhum ativador encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    productivity.map((activator) => {
                      const lastLoginDate = new Date(activator.updatedAt);
                      const now = new Date();
                      const diffMs = now.getTime() - lastLoginDate.getTime();
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                      const diffMinutes = Math.floor(diffMs / (1000 * 60));
                      
                      let lastLoginText = '';
                      if (diffMinutes < 60) {
                        lastLoginText = `${diffMinutes} min atrás`;
                      } else if (diffHours < 24) {
                        lastLoginText = `${diffHours}h atrás`;
                      } else if (diffDays === 1) {
                        lastLoginText = 'Ontem';
                      } else if (diffDays < 7) {
                        lastLoginText = `${diffDays} dias atrás`;
                      } else {
                        lastLoginText = lastLoginDate.toLocaleDateString('pt-BR', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric' 
                        });
                      }

                      return (
                        <TableRow
                          key={activator.id}
                          className={selectedActivator?.id === activator.id ? "bg-muted" : "cursor-pointer hover:bg-muted/50"}
                          onClick={() => setSelectedActivator(activator)}
                        >
                          <TableCell>
                            <div>
                              <div className="font-medium">{activator.name}</div>
                              <div className="text-sm text-muted-foreground">{activator.email}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold">{activator.totalLines}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              {activator.activeLines}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              {activator.bannedLines}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="text-sm text-muted-foreground">
                              {lastLoginText}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Gráfico mensal */}
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedActivator
                  ? `Linhas Criadas por Mês - ${selectedActivator.name}`
                  : "Selecione um ativador para ver o gráfico"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedActivator && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              ) : selectedActivator ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Nenhum dado disponível para este ativador
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <Calendar className="h-12 w-12 opacity-50" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}

