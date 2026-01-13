import { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart3, Download, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { reportsService, segmentsService, Segment } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

interface ReportType {
  value: string;
  label: string;
  adminOnly?: boolean;
}

const reportTypes: ReportType[] = [
  { value: "op_sintetico", label: "OP Sintético" },
  { value: "kpi", label: "KPI" },
  { value: "hsm", label: "HSM" },
  { value: "status_linha", label: "Status de Linha" },
  { value: "adm_linhas", label: "Adm Linhas", adminOnly: true },
  { value: "envios", label: "Envios" },
  { value: "indicadores", label: "Indicadores" },
  { value: "tempos", label: "Tempos" },
  { value: "templates", label: "Templates" },
  { value: "completo_csv", label: "Completo CSV" },
  { value: "equipe", label: "Equipe" },
  { value: "dados_transacionados", label: "Dados Transacionados" },
  { value: "detalhado_conversas", label: "Detalhado Conversas" },
  { value: "linhas", label: "Linhas" },
  { value: "mensagens_por_linha", label: "Mensagens por Linha" },
  { value: "resumo_atendimentos", label: "Resumo Atendimentos" },
  { value: "usuarios", label: "Usuários" },
  { value: "hiper_personalizado", label: "Hiper Personalizado" },
  { value: "consolidado", label: "Consolidado" },
];

// Helper para formatar data como YYYY-MM-DD
const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export default function Relatorios() {
  const { user } = useAuth();

  // Definir datas padrão como hoje
  const today = formatDateForInput(new Date());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [segment, setSegment] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [reportType, setReportType] = useState("resumo_atendimentos"); // Tipo padrão
  const [isLoading, setIsLoading] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [reportBlob, setReportBlob] = useState<Blob | null>(null);
  const [onlyMovimentedLines, setOnlyMovimentedLines] = useState(false); // Para relatório de linhas
  const [lastGeneratedReportLabel, setLastGeneratedReportLabel] = useState(""); // Nome do último relatório gerado

  // Filtrar tipos de relatório baseado no role do usuário
  const filteredReportTypes = useMemo(() => {
    return reportTypes.filter(type => {
      if (type.adminOnly && user?.role !== 'admin') {
        return false;
      }
      return true;
    });
  }, [user?.role]);

  const loadSegments = useCallback(async () => {
    try {
      const data = await segmentsService.list();
      setSegments(data);
    } catch (error) {
      console.error('Error loading segments:', error);
    }
  }, []);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      toast({
        title: "Campos obrigatórios",
        description: "Data inicial e final são obrigatórias",
        variant: "destructive",
      });
      return;
    }

    if (!reportType) {
      toast({
        title: "Tipo de relatório",
        description: "Selecione um tipo de relatório",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setReportGenerated(false);
    setReportBlob(null);

    try {
      const blob = await reportsService.generate({
        startDate,
        endDate,
        segment: segment && segment !== 'all' ? parseInt(segment) : undefined,
        type: reportType,
        onlyMovimentedLines: reportType === 'linhas' ? onlyMovimentedLines : undefined,
      });

      setReportBlob(blob);
      setReportGenerated(true);
      // Atualizar nome do último relatório gerado apenas quando gerar com sucesso
      const reportLabel = reportTypes.find(r => r.value === reportType)?.label || '';
      setLastGeneratedReportLabel(reportLabel);
      toast({
        title: "Relatório gerado",
        description: "O relatório foi gerado com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar relatório",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!reportBlob) return;

    const url = URL.createObjectURL(reportBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${reportType}_${startDate}_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Download iniciado",
      description: "O arquivo está sendo baixado",
    });
  };

  const getSelectedReportLabel = () => {
    return reportTypes.find(r => r.value === reportType)?.label || '';
  };

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto scrollbar-content">
        <div className="space-y-6 animate-fade-in">
          {/* Filters */}
          <GlassCard>
            <h2 className="text-xl font-semibold text-foreground mb-6">Relatórios</h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="space-y-2">
                <Label htmlFor="startDate">Data Inicial *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Data Final *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="segment">Segmento</Label>
                <Select value={segment} onValueChange={setSegment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {segments.map((seg) => (
                      <SelectItem key={seg.id} value={seg.id.toString()}>
                        {seg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleGenerate} className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    'Gerar Relatório'
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Relatório *</Label>
              <div className="flex flex-wrap gap-2">
                {filteredReportTypes.map((type) => (
                  <Button
                    key={type.value}
                    variant={reportType === type.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReportType(type.value)}
                    className="text-xs"
                  >
                    {type.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Opção adicional para relatório de linhas */}
            {reportType === 'linhas' && (
              <div className="mt-4 flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="onlyMovimentedLines"
                  checked={onlyMovimentedLines}
                  onChange={(e) => setOnlyMovimentedLines(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="onlyMovimentedLines" className="text-sm font-normal cursor-pointer">
                  Apenas linhas movimentadas (com conversas/campanhas no período)
                </Label>
              </div>
            )}
          </GlassCard>

          {/* Results */}
          <GlassCard padding="none">
            {!reportGenerated && !isLoading && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <BarChart3 className="h-20 w-20 mb-4 opacity-50" />
                <p className="text-lg font-medium">Selecione os filtros e gere um relatório</p>
                <p className="text-sm">Os dados serão exibidos aqui</p>
              </div>
            )}

            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Gerando relatório...</p>
              </div>
            )}

            {reportGenerated && reportBlob && (
              <div className="p-6">
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
                    <BarChart3 className="h-8 w-8 text-success" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-2">
                    Relatório Gerado com Sucesso!
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 text-center">
                    Relatório: <strong>{lastGeneratedReportLabel || getSelectedReportLabel()}</strong><br />
                    Período: {startDate} até {endDate}
                  </p>
                  <Button onClick={handleExport}>
                    <Download className="mr-2 h-4 w-4" />
                    Baixar CSV
                  </Button>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </MainLayout>
  );
}
