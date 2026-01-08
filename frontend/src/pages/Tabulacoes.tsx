import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { CrudTable, Column } from "@/components/crud/CrudTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { tabulationsService, type Tabulation as ApiTabulation } from "@/services/api";

interface Tabulation {
  id: string;
  name: string;
  isCPC: boolean;
}

export default function Tabulacoes() {
  const [tabulations, setTabulations] = useState<Tabulation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTabulation, setEditingTabulation] = useState<Tabulation | null>(null);
  const [formData, setFormData] = useState({ name: '', isCPC: false });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await tabulationsService.list();
      setTabulations(data.map((t: ApiTabulation) => ({
        id: String(t.id),
        name: t.name,
        isCPC: t.isCPC
      })));
    } catch (error) {
      console.error('Error loading tabulations:', error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as tabulações",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<Tabulation>[] = [
    { key: "name", label: "Nome" },
    {
      key: "isCPC",
      label: "CPC",
      render: (tab) => (
        <Badge variant={tab.isCPC ? "default" : "secondary"} className={tab.isCPC ? "bg-success" : ""}>
          {tab.isCPC ? "Sim" : "Não"}
        </Badge>
      )
    }
  ];

  const handleAdd = () => {
    setEditingTabulation(null);
    setFormData({ name: '', isCPC: false });
    setIsFormOpen(true);
  };

  const handleEdit = (tabulation: Tabulation) => {
    setEditingTabulation(tabulation);
    setFormData({ name: tabulation.name, isCPC: tabulation.isCPC });
    setIsFormOpen(true);
  };

  const handleDelete = async (tabulation: Tabulation) => {
    try {
      await tabulationsService.delete(Number(tabulation.id));
      setTabulations(tabulations.filter(t => t.id !== tabulation.id));
      toast({
        title: "Tabulação removida",
        description: `A tabulação ${tabulation.name} foi removida com sucesso`,
      });
    } catch (error) {
      console.error('Error deleting tabulation:', error);
      toast({
        title: "Erro ao remover",
        description: "Não foi possível remover a tabulação",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Informe o nome da tabulação",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingTabulation) {
        const updated = await tabulationsService.update(Number(editingTabulation.id), {
          name: formData.name,
          isCPC: formData.isCPC
        });
        setTabulations(tabulations.map(t => t.id === editingTabulation.id ? {
          id: String(updated.id),
          name: updated.name,
          isCPC: updated.isCPC
        } : t));
        toast({
          title: "Tabulação atualizada",
          description: `A tabulação ${updated.name} foi atualizada com sucesso`,
        });
      } else {
        const created = await tabulationsService.create(formData.name, formData.isCPC);
        setTabulations([...tabulations, {
          id: String(created.id),
          name: created.name,
          isCPC: created.isCPC
        }]);
        toast({
          title: "Tabulação criada",
          description: `A tabulação ${created.name} foi criada com sucesso`,
        });
      }
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving tabulation:', error);
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Não foi possível salvar a tabulação",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome da Tabulação</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Ex: Venda Realizada, Não Atendeu"
        />
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox
          id="isCPC"
          checked={formData.isCPC}
          onCheckedChange={(checked) => setFormData({ ...formData, isCPC: checked === true })}
        />
        <Label htmlFor="isCPC" className="text-sm font-normal">
          É CPC (Contato com a Pessoa Certa)
        </Label>
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
      <div className="h-full overflow-y-auto scrollbar-content">
        <div className="animate-fade-in">
          <CrudTable
            title="Tabulações"
            subtitle="Gerenciar tipos de finalização de atendimento"
            columns={columns}
            data={tabulations}
            searchPlaceholder="Buscar tabulações..."
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            renderForm={renderForm}
            isFormOpen={isFormOpen}
            onFormOpenChange={setIsFormOpen}
            editingItem={editingTabulation}
          />
        </div>
      </div>
    </MainLayout>
  );
}
