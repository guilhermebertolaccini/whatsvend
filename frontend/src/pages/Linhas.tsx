import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { CrudTable, Column } from "@/components/crud/CrudTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QrCode, Loader2, RefreshCw } from "lucide-react";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { toast } from "@/hooks/use-toast";
import { linesService, segmentsService, evolutionService, type Line as ApiLine, type Segment, type Evolution } from "@/services/api";

interface Line {
  id: string;
  phone: string;
  status: 'active' | 'banned';
  type: 'official' | 'evolution';
  evolutionName?: string;
  segment?: number;
  segmentName?: string | null;
  operators?: Array<{
    id: number;
    name: string;
    email: string;
  }>;
}

export default function Linhas() {
  const [lines, setLines] = useState<Line[]>([]);
  const [allLines, setAllLines] = useState<Line[]>([]); // Todas as linhas (sem filtro)
  const [segments, setSegments] = useState<Segment[]>([]);
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<Line | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    phone: '',
    segment: '',
    evolutionId: '',
    isOfficial: false,
    token: '',
    businessId: '',
    numberId: '',
    receiveMedia: false
  });
  const [isQrCodeOpen, setIsQrCodeOpen] = useState(false);
  const [qrCodeState, setQrCodeState] = useState<'loading' | 'success' | 'error'>('loading');
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const { playSuccessSound, playErrorSound, playWarningSound } = useNotificationSound();

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== 'all') {
        params.lineStatus = statusFilter;
      }
      const [linesData, segmentsData, evolutionsData] = await Promise.all([
        linesService.list(params),
        segmentsService.list(),
        evolutionService.list()
      ]);

      const mappedLines = linesData.map((l: ApiLine) => ({
        id: String(l.id),
        phone: l.phone,
        status: l.lineStatus === 'active' ? 'active' : 'banned',
        type: l.oficial ? 'official' : 'evolution',
        evolutionName: l.evolutionName,
        segment: l.segment ?? undefined,
        segmentName: l.segmentName ?? null,
        operators: l.operators || []
      }));
      setAllLines(mappedLines);
      
      // Aplicar filtro local se necessário
      let filtered = mappedLines;
      if (statusFilter !== 'all') {
        filtered = filtered.filter(l => l.status === statusFilter);
      }
      setLines(filtered);

      setSegments(segmentsData);
      setEvolutions(evolutionsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as linhas",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };


  const columns: Column<Line>[] = [
    { key: "phone", label: "Telefone" },
    {
      key: "status",
      label: "Status",
      render: (line) => (
        <Badge className={line.status === 'active' ? "bg-success" : "bg-destructive"}>
          {line.status === 'active' ? "Ativa" : "Banida"}
        </Badge>
      )
    },
    {
      key: "segmentName",
      label: "Segmento",
      render: (line) => (
        <span className="text-sm">
          {line.segmentName || <span className="text-muted-foreground">Sem segmento</span>}
        </span>
      )
    },
    // OCULTO: Coluna Tipo - Funcionalidade Cloud API oculta por enquanto
    // {
    //   key: "type",
    //   label: "Tipo",
    //   render: (line) => (
    //     <Badge variant={line.type === 'official' ? "default" : "secondary"} className={line.type === 'official' ? "bg-whatsapp" : ""}>
    //       {line.type === 'official' ? "Oficial" : "Evolution"}
    //     </Badge>
    //   )
    // },
    { 
      key: "evolutionName", 
      label: "Evolution" 
    },
    {
      key: "operators",
      label: "Operador(es)",
      render: (line) => {
        if (!line.operators || line.operators.length === 0) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <div className="flex flex-col gap-1">
            {line.operators.map((op) => (
              <span key={op.id} className="text-sm">
                {op.name}
              </span>
            ))}
          </div>
        );
      }
    }
  ];

  const handleAdd = () => {
    setEditingLine(null);
    setFormData({ phone: '', segment: '', evolutionId: '', isOfficial: false, token: '', businessId: '', numberId: '', receiveMedia: false });
    setIsFormOpen(true);
  };

  const handleEdit = async (line: Line) => {
    setEditingLine(line);
    // Buscar dados completos da linha para pegar receiveMedia
    try {
      const fullLine = await linesService.getById(Number(line.id));
      setFormData({
        phone: line.phone,
        segment: line.segment ? String(line.segment) : '',
        evolutionId: line.evolutionName || '',
        isOfficial: line.type === 'official',
        token: '',
        businessId: '',
        numberId: '',
        receiveMedia: fullLine.receiveMedia || false
      });
    } catch {
      setFormData({
        phone: line.phone,
        segment: line.segment ? String(line.segment) : '',
        evolutionId: line.evolutionName || '',
        isOfficial: line.type === 'official',
        token: '',
        businessId: '',
        numberId: '',
        receiveMedia: false
      });
    }
    setIsFormOpen(true);
  };

  const handleDelete = async (line: Line) => {
    try {
      await linesService.delete(Number(line.id));
      const newAllLines = allLines.filter(l => l.id !== line.id);
      setAllLines(newAllLines);
      // Aplicar filtro se necessário
      let filtered = newAllLines;
      if (statusFilter !== 'all') {
        filtered = filtered.filter(l => l.status === statusFilter);
      }
      setLines(filtered);
      playWarningSound();
      toast({
        title: "Linha removida",
        description: `A linha ${line.phone} foi removida com sucesso`,
        variant: "destructive"
      });
    } catch (error) {
      console.error('Error deleting line:', error);
      playErrorSound();
      toast({
        title: "Erro ao remover",
        description: "Não foi possível remover a linha",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    if (!formData.phone) {
      playErrorSound();
      toast({
        title: "Erro ao salvar",
        description: "Preencha o telefone da linha",
        variant: "destructive"
      });
      return;
    }

    if (!formData.evolutionId) {
      playErrorSound();
      toast({
        title: "Erro ao salvar",
        description: "Selecione uma Evolution",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const lineData = {
        phone: formData.phone,
        evolutionName: formData.evolutionId,
        segment: formData.segment ? Number(formData.segment) : undefined,
        oficial: formData.isOfficial,
        token: formData.isOfficial ? formData.token : undefined,
        businessID: formData.isOfficial ? formData.businessId : undefined,
        numberId: formData.isOfficial ? formData.numberId : undefined,
        receiveMedia: formData.receiveMedia,
      };

      if (editingLine) {
        const updated = await linesService.update(Number(editingLine.id), lineData);
        setLines(lines.map(l => l.id === editingLine.id ? {
          id: String(updated.id),
          phone: updated.phone,
          status: updated.lineStatus === 'active' ? 'active' : 'banned',
          type: updated.oficial ? 'official' : 'evolution',
          evolutionName: updated.evolutionName,
          segment: updated.segment ?? undefined
        } : l));
        playSuccessSound();
        toast({
          title: "Linha atualizada",
          description: `A linha ${updated.phone} foi atualizada com sucesso`,
        });
      } else {
        const created = await linesService.create(lineData);
        setLines([...lines, {
          id: String(created.id),
          phone: created.phone,
          status: created.lineStatus === 'active' ? 'active' : 'banned',
          type: created.oficial ? 'official' : 'evolution',
          evolutionName: created.evolutionName,
          segment: created.segment ?? undefined
        }]);
        playSuccessSound();
        toast({
          title: "Linha conectada",
          description: `A linha ${created.phone} foi conectada com sucesso`,
        });
      }
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving line:', error);
      playErrorSound();
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Não foi possível salvar a linha",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleShowQrCode = async (line?: Line) => {
    const targetLine = line || editingLine;
    if (!targetLine) return;

    setQrCodeState('loading');
    setQrCodeData(null);
    setIsQrCodeOpen(true);

    try {
      const response = await linesService.getQrCode(Number(targetLine.id));
      console.log('QR Code response:', response);
      
      if (response.connected) {
        setQrCodeState('success');
        playSuccessSound();
        toast({
          title: "Linha já conectada",
          description: "Esta linha já está conectada ao WhatsApp",
        });
        return;
      }
      
      if (response.qrcode) {
        setQrCodeData(response.qrcode);
        setQrCodeState('success');
        playSuccessSound();
        toast({
          title: "QR Code gerado",
          description: "Escaneie o QR Code com seu WhatsApp",
        });
      } else if (response.pairingCode) {
        setQrCodeData(null);
        setQrCodeState('success');
        toast({
          title: "Código de pareamento",
          description: `Use o código: ${response.pairingCode}`,
        });
      } else {
        setQrCodeState('error');
        playErrorSound();
        toast({
          title: "QR Code não disponível",
          description: response.message || "Aguarde a instância ficar pronta e tente novamente.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error getting QR code:', error);
      setQrCodeState('error');
      playErrorSound();
      toast({
        title: "Erro ao gerar QR Code",
        description: error instanceof Error ? error.message : "Não foi possível gerar o QR Code. Tente novamente.",
        variant: "destructive"
      });
    }
  };

  const renderForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="phone">Telefone</Label>
        <Input
          id="phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="5511999999999"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="segment">Segmento</Label>
        <Select value={formData.segment} onValueChange={(value) => setFormData({ ...formData, segment: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um segmento" />
          </SelectTrigger>
          <SelectContent>
            {segments.map((segment) => (
              <SelectItem key={segment.id} value={String(segment.id)}>
                {segment.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="evolution">Evolution</Label>
        <Select value={formData.evolutionId} onValueChange={(value) => setFormData({ ...formData, evolutionId: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma Evolution" />
          </SelectTrigger>
          <SelectContent>
            {evolutions.map((evolution) => (
              <SelectItem key={evolution.id} value={evolution.evolutionName}>
                {evolution.evolutionName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Receber Mídia - ativa webhook_base64 para receber imagens/áudios/docs */}
      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          id="receiveMedia"
          checked={formData.receiveMedia}
          onCheckedChange={(checked) => setFormData({ ...formData, receiveMedia: checked === true })}
        />
        <Label htmlFor="receiveMedia" className="text-sm font-normal">
          Receber Mídia (imagens, áudios, documentos)
        </Label>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Ativa o recebimento de arquivos de mídia via webhook Base64
      </p>

      {/* OCULTO: Opção Cloud API - Funcionalidade oculta por enquanto
      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          id="isOfficial"
          checked={formData.isOfficial}
          onCheckedChange={(checked) => setFormData({ ...formData, isOfficial: checked === true })}
        />
        <Label htmlFor="isOfficial" className="text-sm font-normal">
          WhatsApp Oficial (Cloud API)
        </Label>
      </div>
      */}

      {formData.isOfficial && (
        <div className="space-y-4 pt-2 border-t border-border">
          <div className="space-y-2">
            <Label htmlFor="token">Token de Acesso</Label>
            <Input
              id="token"
              value={formData.token}
              onChange={(e) => setFormData({ ...formData, token: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessId">Business ID</Label>
            <Input
              id="businessId"
              value={formData.businessId}
              onChange={(e) => setFormData({ ...formData, businessId: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="numberId">Number ID</Label>
            <Input
              id="numberId"
              value={formData.numberId}
              onChange={(e) => setFormData({ ...formData, numberId: e.target.value })}
            />
          </div>
        </div>
      )}

      {!formData.isOfficial && editingLine && (
        <Button
          type="button"
          variant="outline"
          className="w-full text-whatsapp border-whatsapp hover:bg-whatsapp/10"
          onClick={handleShowQrCode}
        >
          <QrCode className="mr-2 h-4 w-4" />
          Ver QR Code
        </Button>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );

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
      <div className="h-full overflow-y-auto scrollbar-content">
        <div className="animate-fade-in">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="statusFilter">Filtrar por Status:</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativas</SelectItem>
                  <SelectItem value="banned">Banidas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <CrudTable
            title="Linhas WhatsApp"
            subtitle="Gerenciar linhas de atendimento"
            columns={columns}
            data={lines}
            searchPlaceholder="Buscar linhas..."
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            renderForm={renderForm}
            isFormOpen={isFormOpen}
            onFormOpenChange={setIsFormOpen}
            editingItem={editingLine}
            renderActions={(line) => (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-whatsapp hover:text-whatsapp"
                onClick={() => handleShowQrCode(line)}
                title="Ver QR Code"
              >
                <QrCode className="h-4 w-4" />
              </Button>
            )}
          />
        </div>

        {/* QR Code Modal */}
        <Dialog open={isQrCodeOpen} onOpenChange={setIsQrCodeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code da Linha</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-6">
            {qrCodeState === 'loading' && (
              <div className="flex flex-col items-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <p className="text-muted-foreground mt-4">Gerando QR Code...</p>
              </div>
            )}
            {qrCodeState === 'success' && qrCodeData && (
              <>
                <div className="w-64 h-64 bg-white rounded-lg flex items-center justify-center overflow-hidden p-2">
                  <img src={qrCodeData} alt="QR Code" className="w-full h-full object-contain" />
                </div>
                <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
                  <p>1. Abra o WhatsApp no seu celular</p>
                  <p>2. Toque em "Dispositivos conectados"</p>
                  <p>3. Escaneie este QR Code</p>
                </div>
                <Button variant="outline" onClick={handleShowQrCode} className="mt-4">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Atualizar QR Code
                </Button>
              </>
            )}
            {qrCodeState === 'success' && !qrCodeData && (
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-foreground">Linha já conectada!</p>
                <p className="text-muted-foreground mt-2">Esta linha já está conectada ao WhatsApp.</p>
              </div>
            )}
            {qrCodeState === 'error' && (
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-destructive">Erro ao gerar QR Code</p>
                <p className="text-muted-foreground mt-2">Aguarde alguns segundos e tente novamente.</p>
                <Button variant="outline" onClick={handleShowQrCode} className="mt-4">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar novamente
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </MainLayout>
  );
}
