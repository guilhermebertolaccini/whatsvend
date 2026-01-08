import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usersService, segmentsService, linesService, type Segment } from "@/services/api";
import { Loader2, Users, RefreshCw, Wifi, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OperatorLine {
  id: number;
  phone: string;
  lineStatus: 'active' | 'ban';
}

interface OnlineOperator {
  id: number;
  name: string;
  email: string;
  role: string;
  segment: number | null;
  segmentName: string | null;
  status: 'Online' | 'Offline';
  lines: OperatorLine[];
  oneToOneActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function OperadoresOnline() {
  const [operators, setOperators] = useState<OnlineOperator[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState<OnlineOperator | null>(null);
  const [availableLines, setAvailableLines] = useState<Array<{ id: number; phone: string; segmentName: string | null; operatorsCount: number }>>([]);
  const [isLoadingLines, setIsLoadingLines] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const segmentId = selectedSegment === 'all' ? undefined : parseInt(selectedSegment);
      const operatorsData = await usersService.getOnlineOperators(segmentId);
      setOperators(operatorsData as any);
    } catch (error) {
      console.error('Error loading operators:', error);
      toast({
        title: "Erro ao carregar operadores",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedSegment]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const loadSegments = async () => {
      try {
        const segmentsData = await segmentsService.list();
        setSegments(segmentsData);
      } catch (error) {
        console.error('Error loading segments:', error);
      }
    };
    loadSegments();
  }, []);

  const getLineStatusBadge = (status: 'active' | 'ban') => {
    if (status === 'active') {
      return <Badge className="bg-success text-success-foreground">Ativa</Badge>;
    }
    return <Badge className="bg-destructive text-destructive-foreground">Banida</Badge>;
  };

  const handleOpenAssignDialog = async (operator: OnlineOperator) => {
    setSelectedOperator(operator);
    setAssignDialogOpen(true);
    setIsLoadingLines(true);
    try {
      const lines = await linesService.getAvailableForOperator(operator.id);
      setAvailableLines(lines);
    } catch (error) {
      toast({
        title: "Erro ao carregar linhas",
        description: error instanceof Error ? error.message : "Não foi possível carregar linhas disponíveis",
        variant: "destructive",
      });
    } finally {
      setIsLoadingLines(false);
    }
  };

  const handleAssignLine = async (lineId: number) => {
    if (!selectedOperator) return;
    setIsAssigning(true);
    try {
      await linesService.assignOperator(lineId, selectedOperator.id);
      toast({
        title: "Linha atribuída",
        description: `Linha atribuída ao operador ${selectedOperator.name} com sucesso`,
      });
      setAssignDialogOpen(false);
      loadData(); // Recarregar dados
    } catch (error) {
      toast({
        title: "Erro ao atribuir linha",
        description: error instanceof Error ? error.message : "Não foi possível atribuir a linha",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const filteredOperators = operators;

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto scrollbar-content">
        <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <GlassCard>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Operadores Online</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredOperators.length} operador{filteredOperators.length !== 1 ? 'es' : ''} online
                </p>
              </div>
            </div>
            <Button
              onClick={loadData}
              disabled={isRefreshing}
              variant="outline"
              size="sm"
            >
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

          {/* Filter */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="segment">Filtrar por Segmento</Label>
              <Select value={selectedSegment} onValueChange={setSelectedSegment}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os segmentos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os segmentos</SelectItem>
                  {segments.map((segment) => (
                    <SelectItem key={segment.id} value={segment.id.toString()}>
                      {segment.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </GlassCard>

        {/* Operators List */}
        {isLoading ? (
          <GlassCard>
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Carregando operadores...</p>
            </div>
          </GlassCard>
        ) : filteredOperators.length === 0 ? (
          <GlassCard>
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Users className="h-20 w-20 mb-4 opacity-50" />
              <p className="text-lg font-medium">Nenhum operador online</p>
              <p className="text-sm">
                {selectedSegment !== 'all' 
                  ? 'Não há operadores online neste segmento no momento'
                  : 'Não há operadores online no momento'}
              </p>
            </div>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredOperators.map((operator) => (
              <GlassCard key={operator.id}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                        <Wifi className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{operator.name}</h3>
                        <p className="text-sm text-muted-foreground">{operator.email}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      {/* Segment */}
                      <div>
                        <Label className="text-xs text-muted-foreground">Segmento</Label>
                        <p className="text-sm font-medium text-foreground">
                          {operator.segmentName || 'Sem segmento'}
                        </p>
                      </div>

                      {/* Status */}
                      <div>
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        <div className="mt-1">
                          <Badge className="bg-success text-success-foreground">
                            {operator.status}
                          </Badge>
                        </div>
                      </div>

                      {/* One to One */}
                      {operator.oneToOneActive !== undefined && (
                        <div>
                          <Label className="text-xs text-muted-foreground">1x1 Ativo</Label>
                          <div className="mt-1">
                            <Badge variant={operator.oneToOneActive ? "default" : "secondary"}>
                              {operator.oneToOneActive ? "Sim" : "Não"}
                            </Badge>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Lines */}
                    <div className="mt-4">
                      <Label className="text-xs text-muted-foreground mb-2 block">Linhas Vinculadas</Label>
                      {operator.lines && operator.lines.length > 0 ? (
                        <div className="space-y-2">
                          {operator.lines.map((line) => (
                            <div
                              key={line.id}
                              className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border"
                            >
                              <div className="flex items-center gap-3">
                                <div className="font-mono text-sm font-medium text-foreground">
                                  {line.phone}
                                </div>
                                {getLineStatusBadge(line.lineStatus)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          Nenhuma linha vinculada
                        </p>
                      )}
                    </div>

                    {/* Assign Button */}
                    <div className="mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAssignDialog(operator)}
                        className="w-full"
                      >
                        <Link2 className="mr-2 h-4 w-4" />
                        Atribuir Linha Rápida
                      </Button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Assign Line Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Atribuir Linha para {selectedOperator?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {isLoadingLines ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Carregando linhas disponíveis...</p>
              </div>
            ) : availableLines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma linha disponível no momento</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {availableLines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent cursor-pointer"
                    onClick={() => !isAssigning && handleAssignLine(line.id)}
                  >
                    <div className="flex-1">
                      <div className="font-mono text-sm font-medium">{line.phone}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {line.segmentName} • {line.operatorsCount} operador(es)
                      </div>
                    </div>
                    {isAssigning && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </MainLayout>
  );
}

