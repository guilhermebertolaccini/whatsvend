import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { CrudTable, Column } from "@/components/crud/CrudTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2, Wifi, WifiOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { evolutionService, type Evolution as ApiEvolution } from "@/services/api";

interface EvolutionInstance {
  id: string;
  name: string;
  url: string;
  apiKey?: string;
}

export default function Evolution() {
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<EvolutionInstance | null>(null);
  const [formData, setFormData] = useState({ name: '', url: '', apiKey: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await evolutionService.list();
      setInstances(data.map((e: ApiEvolution) => ({
        id: String(e.id),
        name: e.evolutionName,
        url: e.evolutionUrl,
        apiKey: e.evolutionKey
      })));
    } catch (error) {
      console.error('Error loading evolution instances:', error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as instâncias Evolution",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<EvolutionInstance>[] = [
    { key: "name", label: "Nome da Instância" },
    { key: "url", label: "URL" },
    {
      key: "id",
      label: "Conexão",
      render: (instance) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleTestConnection(instance);
          }}
          disabled={isTesting === instance.id}
        >
          {isTesting === instance.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wifi className="h-4 w-4" />
          )}
          <span className="ml-2">Testar</span>
        </Button>
      )
    }
  ];

  const handleTestConnection = async (instance: EvolutionInstance) => {
    setIsTesting(instance.id);
    try {
      const result = await evolutionService.test(instance.name);
      if (result.status === 'connected') {
        toast({
          title: "Conexão bem-sucedida",
          description: result.message,
        });
      } else {
        toast({
          title: "Falha na conexão",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      toast({
        title: "Erro ao testar",
        description: "Não foi possível testar a conexão",
        variant: "destructive"
      });
    } finally {
      setIsTesting(null);
    }
  };

  const handleAdd = () => {
    setEditingInstance(null);
    setFormData({ name: '', url: '', apiKey: '' });
    setIsFormOpen(true);
  };

  const handleEdit = (instance: EvolutionInstance) => {
    setEditingInstance(instance);
    setFormData({ name: instance.name, url: instance.url, apiKey: '' });
    setIsFormOpen(true);
  };

  const handleDelete = async (instance: EvolutionInstance) => {
    try {
      await evolutionService.delete(Number(instance.id));
      setInstances(instances.filter(i => i.id !== instance.id));
      toast({
        title: "Instância removida",
        description: `A instância ${instance.name} foi removida com sucesso`,
      });
    } catch (error) {
      console.error('Error deleting evolution instance:', error);
      toast({
        title: "Erro ao remover",
        description: "Não foi possível remover a instância",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o nome e a URL da instância",
        variant: "destructive"
      });
      return;
    }

    if (!editingInstance && !formData.apiKey.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Informe a API Key da instância",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingInstance) {
        const updateData: Parameters<typeof evolutionService.update>[1] = {
          evolutionUrl: formData.url
        };
        if (formData.apiKey) {
          updateData.evolutionKey = formData.apiKey;
        }
        
        const updated = await evolutionService.update(Number(editingInstance.id), updateData);
        setInstances(instances.map(i => i.id === editingInstance.id ? {
          id: String(updated.id),
          name: updated.evolutionName,
          url: updated.evolutionUrl,
          apiKey: updated.evolutionKey
        } : i));
        toast({
          title: "Instância atualizada",
          description: `A instância ${updated.evolutionName} foi atualizada com sucesso`,
        });
      } else {
        const created = await evolutionService.create({
          evolutionName: formData.name,
          evolutionUrl: formData.url,
          evolutionKey: formData.apiKey
        });
        setInstances([...instances, {
          id: String(created.id),
          name: created.evolutionName,
          url: created.evolutionUrl,
          apiKey: created.evolutionKey
        }]);
        toast({
          title: "Instância criada",
          description: `A instância ${created.evolutionName} foi criada com sucesso`,
        });
      }
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving evolution instance:', error);
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Não foi possível salvar a instância",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome da Instância</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Ex: Evolution Principal"
          disabled={!!editingInstance}
        />
        {editingInstance && (
          <p className="text-xs text-muted-foreground">O nome não pode ser alterado</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="url">URL da API</Label>
        <Input
          id="url"
          value={formData.url}
          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
          placeholder="https://api.evolution.example.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="apiKey">API Key {editingInstance && "(deixe em branco para manter)"}</Label>
        <Input
          id="apiKey"
          type="password"
          value={formData.apiKey}
          onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
          placeholder={editingInstance ? "••••••••••••••••" : "Sua API Key"}
        />
      </div>
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
      <div className="animate-fade-in">
          <CrudTable
          title="Evolution API"
          subtitle="Gerenciar instâncias da Evolution API"
          columns={columns}
          data={instances}
          searchPlaceholder="Buscar instâncias..."
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
          renderForm={renderForm}
          isFormOpen={isFormOpen}
          onFormOpenChange={setIsFormOpen}
          editingItem={editingInstance}
        />
      </div>
    </MainLayout>
  );
}
