import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, CheckCircle, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { CrudTable, Column } from "@/components/crud/CrudTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toast } from "@/hooks/use-toast";
import { 
  campaignsService, 
  segmentsService, 
  templatesService,
  Campaign as APICampaign, 
  CampaignStats,
  Segment,
  Template as APITemplate
} from "@/services/api";
import { format } from "date-fns";

interface Campaign {
  id: string;
  name: string;
  segment: string;
  segmentId: number;
  speed: 'fast' | 'medium' | 'slow';
  date: string;
  total?: number;
  sent?: number;
  failed?: number;
}

const speedColors = {
  fast: "bg-destructive",
  medium: "bg-warning text-warning-foreground",
  slow: "bg-success"
};

const speedLabels = {
  fast: "Rápida (3min)",
  medium: "Média (6min)",
  slow: "Lenta (10min)"
};

export default function Campanhas() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [templates, setTemplates] = useState<APITemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    segment: string;
    speed: 'fast' | 'medium' | 'slow';
    message: string;
    useTemplate: boolean;
    templateId: string;
    endTime: string;
  }>({
    name: '',
    segment: '',
    speed: 'medium',
    message: '',
    useTemplate: false,
    templateId: '',
    endTime: '19:00'
  });
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState({ total: 0, sent: 0, failed: 0 });
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignStats, setCampaignStats] = useState<CampaignStats | null>(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const mapApiToLocal = useCallback((apiCampaign: APICampaign): Campaign => {
    const segment = segments.find(s => s.id === apiCampaign.contactSegment);
    return {
      id: apiCampaign.id.toString(),
      name: apiCampaign.name,
      segment: segment?.name || `Segmento ${apiCampaign.contactSegment}`,
      segmentId: apiCampaign.contactSegment,
      speed: apiCampaign.speed,
      date: format(new Date(apiCampaign.createdAt), 'yyyy-MM-dd'),
    };
  }, [segments]);

  const loadCampaigns = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await campaignsService.list();
      
      // Group by campaign name and get unique campaigns
      const uniqueCampaigns = new Map<string, APICampaign>();
      data.forEach(c => {
        if (!uniqueCampaigns.has(c.name)) {
          uniqueCampaigns.set(c.name, c);
        }
      });
      
      setCampaigns(Array.from(uniqueCampaigns.values()).map(mapApiToLocal));
    } catch (error) {
      toast({
        title: "Erro ao carregar campanhas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [mapApiToLocal]);

  const loadSegments = useCallback(async () => {
    try {
      const data = await segmentsService.list();
      setSegments(data);
    } catch (error) {
      console.error('Error loading segments:', error);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await templatesService.list({ status: 'APPROVED' });
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  }, []);

  useEffect(() => {
    loadSegments();
    loadTemplates();
  }, [loadSegments, loadTemplates]);

  useEffect(() => {
    if (segments.length > 0) {
      loadCampaigns();
    }
  }, [segments, loadCampaigns]);

  const columns: Column<Campaign>[] = [
    { key: "name", label: "Nome" },
    { key: "segment", label: "Segmento" },
    {
      key: "speed",
      label: "Velocidade",
      render: (campaign) => (
        <Badge className={speedColors[campaign.speed]}>
          {speedLabels[campaign.speed]}
        </Badge>
      )
    },
    { key: "date", label: "Data" }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.segment) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome e segmento são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Create campaign
      const campaign = await campaignsService.create({
        name: formData.name.trim(),
        speed: formData.speed,
        segment: formData.segment,
        useTemplate: formData.useTemplate,
        templateId: formData.useTemplate && formData.templateId ? parseInt(formData.templateId) : undefined,
        endTime: formData.endTime || undefined,
      });

      // Upload CSV if provided
      if (csvFile) {
        const uploadResult = await campaignsService.uploadCSV(
          campaign.id, 
          csvFile, 
          formData.message.trim() || undefined
        );
        
        setResultData({
          total: uploadResult.contactsAdded,
          sent: uploadResult.contactsAdded,
          failed: 0,
        });
      } else {
        setResultData({ total: 0, sent: 0, failed: 0 });
      }

      setShowResult(true);
      toast({
        title: "Campanha criada",
        description: "Campanha criada com sucesso",
      });
      
      // Reset form
      setFormData({
        name: '',
        segment: '',
        speed: 'medium',
        message: '',
        useTemplate: false,
        templateId: '',
        endTime: '19:00'
      });
      setCsvFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Reload campaigns
      await loadCampaigns();
      
      setTimeout(() => setShowResult(false), 5000);
    } catch (error) {
      toast({
        title: "Erro ao criar campanha",
        description: error instanceof Error ? error.message : "Erro ao criar campanha",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewStats = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setIsStatsOpen(true);
    setIsLoadingStats(true);
    setCampaignStats(null);
    
    try {
      const stats = await campaignsService.getStats(campaign.name);
      setCampaignStats(stats);
    } catch (error) {
      toast({
        title: "Erro ao carregar estatísticas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
    }
  };

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto scrollbar-content">
        <div className="space-y-6 animate-fade-in">
        {/* Create Campaign */}
        <GlassCard>
          <h2 className="text-xl font-semibold text-foreground mb-6">Criar Campanha</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Campanha *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Promoção Janeiro"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="segment">Segmento *</Label>
                <Select value={formData.segment} onValueChange={(value) => setFormData({ ...formData, segment: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {segments.map((segment) => (
                      <SelectItem key={segment.id} value={segment.id.toString()}>
                        {segment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="speed">Velocidade</Label>
                <Select value={formData.speed} onValueChange={(value: 'fast' | 'medium' | 'slow') => setFormData({ ...formData, speed: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">Rápida (3min entre envios)</SelectItem>
                    <SelectItem value="medium">Média (6min entre envios)</SelectItem>
                    <SelectItem value="slow">Lenta (10min entre envios)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">Horário Limite de Envio</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  placeholder="19:00"
                />
                <p className="text-xs text-muted-foreground">
                  As mensagens serão distribuídas uniformemente até este horário
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Mensagem (opcional)</Label>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Digite a mensagem da campanha..."
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useTemplate"
                  checked={formData.useTemplate}
                  onCheckedChange={(checked) => setFormData({ ...formData, useTemplate: checked === true })}
                />
                <Label htmlFor="useTemplate" className="text-sm font-normal">
                  Usar Template
                </Label>
              </div>
              {formData.useTemplate && (
                <Select value={formData.templateId} onValueChange={(value) => setFormData({ ...formData, templateId: value })}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Selecione um template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="csv">Arquivo CSV</Label>
              <div className="flex items-center gap-4">
                <Input 
                  id="csv" 
                  type="file" 
                  accept=".csv" 
                  className="max-w-xs"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {isSubmitting ? 'Enviando...' : 'Enviar Campanha'}
                </Button>
              </div>
            </div>
          </form>

          {showResult && (
            <div className="mt-6 p-4 bg-success/10 border border-success/30 rounded-xl animate-fade-in">
              <div className="flex items-center gap-2 text-success mb-2">
                <CheckCircle className="h-5 w-5" />
                <span className="font-semibold">Campanha enviada com sucesso!</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {resultData.total} contatos processados • {resultData.sent} enviados • {resultData.failed} falhas
              </p>
            </div>
          )}
        </GlassCard>

        {/* Campaigns List */}
        <CrudTable
          title="Campanhas"
          subtitle="Histórico de campanhas enviadas"
          columns={columns}
          data={campaigns}
          searchPlaceholder="Buscar campanhas..."
          onEdit={handleViewStats}
        />
      </div>

      {/* Stats Modal */}
      <Dialog open={isStatsOpen} onOpenChange={setIsStatsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Estatísticas da Campanha</DialogTitle>
          </DialogHeader>
          {selectedCampaign && (
            <div className="py-4">
              <h3 className="font-semibold mb-4">{selectedCampaign.name}</h3>
              {isLoadingStats ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : campaignStats ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-primary/10 rounded-xl">
                    <p className="text-2xl font-bold text-primary">{campaignStats.totalContacts}</p>
                    <p className="text-sm text-muted-foreground">Total</p>
                  </div>
                  <div className="p-4 bg-success/10 rounded-xl">
                    <p className="text-2xl font-bold text-success">{campaignStats.sent}</p>
                    <p className="text-sm text-muted-foreground">Enviados</p>
                  </div>
                  <div className="p-4 bg-warning/10 rounded-xl">
                    <p className="text-2xl font-bold text-warning">{campaignStats.responses}</p>
                    <p className="text-sm text-muted-foreground">Respostas</p>
                  </div>
                  <div className="p-4 bg-muted rounded-xl">
                    <p className="text-2xl font-bold text-foreground">{campaignStats.pending}</p>
                    <p className="text-sm text-muted-foreground">Pendentes</p>
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  Nenhuma estatística disponível
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </MainLayout>
  );
}
