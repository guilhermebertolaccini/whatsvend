import { useState, useEffect, useCallback } from "react";
import { 
  Shield, 
  Clock, 
  MessageSquare, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Loader2, 
  Save,
  AlertTriangle,
  Timer,
  RotateCcw,
  Repeat,
  Users
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { controlPanelService, ControlPanelSettings, segmentsService, Segment, tabulationsService, Tabulation, evolutionService, Evolution } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

export default function PainelControle() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tabulations, setTabulations] = useState<Tabulation[]>([]);
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | undefined>(undefined);
  const [settings, setSettings] = useState<ControlPanelSettings | null>(null);
  const [newBlockPhrase, setNewBlockPhrase] = useState("");
  const [isAddingPhrase, setIsAddingPhrase] = useState(false);
  const [isAssigningLines, setIsAssigningLines] = useState(false);
  const [isUnassigningLines, setIsUnassigningLines] = useState(false);

  // Carregar segmentos, tabulações e evolutions
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [segs, tabs, evols] = await Promise.all([
          segmentsService.list(),
          tabulationsService.list(),
          evolutionService.list(),
        ]);
        setSegments(segs);
        setTabulations(tabs);
        setEvolutions(evols);
      } catch (error) {
        console.error('Error loading initial data:', error);
      }
    };
    loadInitialData();
  }, []);

  // Carregar configurações
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await controlPanelService.get(selectedSegmentId);
      setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as configurações",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedSegmentId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Salvar configurações
  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    try {
      await controlPanelService.update({
        segmentId: selectedSegmentId,
        blockPhrasesEnabled: settings.blockPhrasesEnabled,
        cpcCooldownEnabled: settings.cpcCooldownEnabled,
        cpcCooldownHours: settings.cpcCooldownHours,
        resendCooldownEnabled: settings.resendCooldownEnabled,
        resendCooldownHours: settings.resendCooldownHours,
        repescagemEnabled: settings.repescagemEnabled,
        repescagemMaxMessages: settings.repescagemMaxMessages,
        repescagemCooldownHours: settings.repescagemCooldownHours,
        repescagemMaxAttempts: settings.repescagemMaxAttempts,
        blockTabulationId: settings.blockTabulationId,
        activeEvolutions: settings.activeEvolutions,
      });

      toast({
        title: "Configurações salvas",
        description: "As configurações foram atualizadas com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro ao salvar configurações",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Adicionar frase de bloqueio
  const handleAddPhrase = async () => {
    if (!newBlockPhrase.trim()) return;

    setIsAddingPhrase(true);
    try {
      const updated = await controlPanelService.addBlockPhrase(newBlockPhrase.trim(), selectedSegmentId);
      setSettings(updated);
      setNewBlockPhrase("");
      toast({
        title: "Frase adicionada",
        description: "A frase de bloqueio foi adicionada com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao adicionar frase",
        variant: "destructive",
      });
    } finally {
      setIsAddingPhrase(false);
    }
  };

  // Remover frase de bloqueio
  const handleRemovePhrase = async (phrase: string) => {
    try {
      const updated = await controlPanelService.removeBlockPhrase(phrase, selectedSegmentId);
      setSettings(updated);
      toast({
        title: "Frase removida",
        description: "A frase de bloqueio foi removida",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao remover frase",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="h-full overflow-y-auto scrollbar-content">
          <div className="flex items-center justify-center h-[calc(100vh-6rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground bg-gradient-to-r from-primary to-cyan bg-clip-text text-transparent">
              Painel de Controle
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure as regras de automação e controle de mensagens
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select
              value={selectedSegmentId?.toString() || "global"}
              onValueChange={(v) => setSelectedSegmentId(v === "global" ? undefined : parseInt(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Selecione o segmento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (todos)</SelectItem>
                {segments.map((seg) => (
                  <SelectItem key={seg.id} value={seg.id.toString()}>
                    {seg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              {/* Botões de atribuição/desatribuição ocultos - funcionalidades mantidas no backend */}
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar Configurações
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Frases de Bloqueio */}
          <GlassCard className="col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-destructive/10">
                <Shield className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Frases de Bloqueio Automático</h2>
                <p className="text-sm text-muted-foreground">
                  Mensagens que acionam bloqueio automático do contato
                </p>
              </div>
            </div>

            <Separator className="mb-4" />

            {/* Ativar/Desativar */}
            <div className="flex items-center justify-between rounded-lg border p-4 mb-4">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Ativar Frases de Bloqueio</Label>
                <p className="text-sm text-muted-foreground">
                  Bloquear contatos automaticamente quando enviarem frases configuradas
                </p>
              </div>
              <Switch
                checked={settings?.blockPhrasesEnabled ?? true}
                onCheckedChange={(checked) => setSettings(s => s ? {...s, blockPhrasesEnabled: checked} : null)}
              />
            </div>

            {/* Lista de frases */}
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {settings?.blockPhrases && settings.blockPhrases.length > 0 ? (
                settings.blockPhrases.map((phrase, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <span className="text-sm">&quot;{phrase}&quot;</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemovePhrase(phrase)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma frase de bloqueio configurada
                </p>
              )}
            </div>

            {/* Adicionar nova frase */}
            <div className="flex gap-2">
              <Input
                placeholder="Digite a frase de bloqueio..."
                value={newBlockPhrase}
                onChange={(e) => setNewBlockPhrase(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPhrase()}
              />
              <Button onClick={handleAddPhrase} disabled={isAddingPhrase || !newBlockPhrase.trim()}>
                {isAddingPhrase ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>

            {/* Tabulação padrão */}
            <div className="mt-4 space-y-2">
              <Label>Tabulação ao bloquear</Label>
              <Select
                value={settings?.blockTabulationId?.toString() || ""}
                onValueChange={(v) => setSettings(s => s ? {...s, blockTabulationId: v ? parseInt(v) : null} : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a tabulação" />
                </SelectTrigger>
                <SelectContent>
                  {tabulations.map((tab) => (
                    <SelectItem key={tab.id} value={tab.id.toString()}>
                      {tab.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </GlassCard>

          {/* Temporizador CPC */}
          <GlassCard className="col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-warning/10">
                <Timer className="h-5 w-5 text-warning" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Temporizador de CPC</h2>
                <p className="text-sm text-muted-foreground">
                  Tempo de espera antes de contatar novamente um CPC
                </p>
              </div>
            </div>

            <Separator className="mb-4" />

            <div className="space-y-4">
              {/* Ativar/Desativar */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Ativar Temporizador de CPC</Label>
                  <p className="text-sm text-muted-foreground">
                    Controlar intervalo entre contatos com CPC
                  </p>
                </div>
                <Switch
                  checked={settings?.cpcCooldownEnabled ?? true}
                  onCheckedChange={(checked) => setSettings(s => s ? {...s, cpcCooldownEnabled: checked} : null)}
                />
              </div>

              {settings?.cpcCooldownEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="cpc-cooldown">Período de espera (horas)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="cpc-cooldown"
                        type="number"
                        min={1}
                        max={720}
                        value={settings?.cpcCooldownHours || 24}
                        onChange={(e) => setSettings(s => s ? {...s, cpcCooldownHours: parseInt(e.target.value) || 24} : null)}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">horas</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Após marcar um contato como CPC, só poderá ser contatado novamente após este período
                    </p>
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/5 border border-warning/20">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <span className="text-sm text-muted-foreground">
                      Exemplo: Com 24h, se CPC às 10h, só libera às 10h do dia seguinte
                    </span>
                  </div>
                </>
              )}
            </div>
          </GlassCard>

          {/* Reenvio */}
          <GlassCard className="col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Repeat className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Controle de Reenvio</h2>
                <p className="text-sm text-muted-foreground">
                  Intervalo mínimo entre campanhas para o mesmo telefone
                </p>
              </div>
            </div>

            <Separator className="mb-4" />

            <div className="space-y-4">
              {/* Ativar/Desativar */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Ativar Controle de Reenvio</Label>
                  <p className="text-sm text-muted-foreground">
                    Controlar intervalo mínimo entre campanhas
                  </p>
                </div>
                <Switch
                  checked={settings?.resendCooldownEnabled ?? true}
                  onCheckedChange={(checked) => setSettings(s => s ? {...s, resendCooldownEnabled: checked} : null)}
                />
              </div>

              {settings?.resendCooldownEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="resend-cooldown">Período de espera (horas)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="resend-cooldown"
                    type="number"
                    min={1}
                    max={720}
                    value={settings?.resendCooldownHours || 24}
                    onChange={(e) => setSettings(s => s ? {...s, resendCooldownHours: parseInt(e.target.value) || 24} : null)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">horas</span>
                </div>
                  <p className="text-xs text-muted-foreground">
                    Evita enviar múltiplas campanhas para o mesmo contato em um curto período
                  </p>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Repescagem */}
          <GlassCard className="col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-cyan/10">
                <RotateCcw className="h-5 w-5 text-cyan" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Controle de Repescagem</h2>
                <p className="text-sm text-muted-foreground">
                  Limite de mensagens seguidas sem resposta do cliente
                </p>
              </div>
            </div>

            <Separator className="mb-4" />

            <div className="space-y-4">
              {/* Ativar/Desativar */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Ativar Repescagem</Label>
                  <p className="text-sm text-muted-foreground">
                    Controlar mensagens seguidas do operador
                  </p>
                </div>
                <Switch
                  checked={settings?.repescagemEnabled || false}
                  onCheckedChange={(checked) => setSettings(s => s ? {...s, repescagemEnabled: checked} : null)}
                />
              </div>

              {settings?.repescagemEnabled && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="rep-max-msgs">Msgs até bloqueio</Label>
                      <Input
                        id="rep-max-msgs"
                        type="number"
                        min={1}
                        max={10}
                        value={settings?.repescagemMaxMessages || 2}
                        onChange={(e) => setSettings(s => s ? {...s, repescagemMaxMessages: parseInt(e.target.value) || 2} : null)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rep-cooldown">Horas de espera</Label>
                      <Input
                        id="rep-cooldown"
                        type="number"
                        min={1}
                        max={720}
                        value={settings?.repescagemCooldownHours || 24}
                        onChange={(e) => setSettings(s => s ? {...s, repescagemCooldownHours: parseInt(e.target.value) || 24} : null)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rep-max-attempts">Limite de repescagens (0 = ilimitado)</Label>
                    <Input
                      id="rep-max-attempts"
                      type="number"
                      min={0}
                      max={10}
                      value={settings?.repescagemMaxAttempts || 2}
                      onChange={(e) => setSettings(s => s ? {...s, repescagemMaxAttempts: parseInt(e.target.value) || 2} : null)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Após atingir o limite, operador só pode enviar se cliente responder
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-cyan/5 border border-cyan/20 space-y-2">
                    <p className="text-sm font-medium">Como funciona:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• Operador envia {settings?.repescagemMaxMessages || 2} msgs seguidas sem resposta</li>
                      <li>• Bloqueio por {settings?.repescagemCooldownHours || 24}h</li>
                      <li>• Após {settings?.repescagemMaxAttempts || 2} repescagens: bloqueio permanente</li>
                      <li>• Cliente responde: todos os bloqueios são resetados</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          </GlassCard>

          {/* Evolutions Ativas - Oculto (funcionalidade mantida no backend) */}
        </div>
      </div>
    </MainLayout>
  );
}

