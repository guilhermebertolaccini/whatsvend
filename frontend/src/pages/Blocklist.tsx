import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { CrudTable, Column } from "@/components/crud/CrudTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { blocklistService, type BlocklistEntry as ApiBlocklistEntry } from "@/services/api";

interface BlocklistItem {
  id: string;
  name?: string;
  phone?: string;
  cpf?: string;
}

export default function Blocklist() {
  const [items, setItems] = useState<BlocklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BlocklistItem | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', cpf: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await blocklistService.list();
      setItems(data.map((b: ApiBlocklistEntry) => ({
        id: String(b.id),
        name: b.name,
        phone: b.phone,
        cpf: b.cpf
      })));
    } catch (error) {
      console.error('Error loading blocklist:', error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar a blocklist",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<BlocklistItem>[] = [
    { key: "name", label: "Nome", render: (item) => item.name || "-" },
    { key: "phone", label: "Telefone", render: (item) => item.phone || "-" },
    { key: "cpf", label: "CPF", render: (item) => item.cpf || "-" }
  ];

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({ name: '', phone: '', cpf: '' });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleEdit = (item: BlocklistItem) => {
    setEditingItem(item);
    setFormData({ name: item.name || '', phone: item.phone || '', cpf: item.cpf || '' });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleDelete = async (item: BlocklistItem) => {
    try {
      await blocklistService.delete(Number(item.id));
      setItems(items.filter(i => i.id !== item.id));
      toast({
        title: "Contato removido",
        description: "O contato foi removido da blocklist",
      });
    } catch (error) {
      console.error('Error deleting blocklist item:', error);
      toast({
        title: "Erro ao remover",
        description: "Não foi possível remover o contato da blocklist",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    // Validate at least one field is filled
    if (!formData.phone && !formData.cpf) {
      setFormError('Preencha pelo menos o telefone ou CPF');
      return;
    }

    setIsSaving(true);
    setFormError('');
    
    try {
      const blocklistData = {
        name: formData.name || undefined,
        phone: formData.phone || undefined,
        cpf: formData.cpf || undefined
      };

      if (editingItem) {
        const updated = await blocklistService.update(Number(editingItem.id), {
          name: formData.name,
          phone: formData.phone
        });
        setItems(items.map(i => i.id === editingItem.id ? {
          id: String(updated.id),
          name: updated.name,
          phone: updated.phone,
          cpf: updated.cpf
        } : i));
        toast({
          title: "Contato atualizado",
          description: "O contato foi atualizado na blocklist",
        });
      } else {
        const created = await blocklistService.create(blocklistData);
        setItems([...items, {
          id: String(created.id),
          name: created.name,
          phone: created.phone,
          cpf: created.cpf
        }]);
        toast({
          title: "Contato bloqueado",
          description: "O contato foi adicionado à blocklist",
        });
      }
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving blocklist item:', error);
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Não foi possível salvar o contato",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderForm = () => (
    <div className="space-y-4 py-4">
      <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg flex gap-2 text-sm">
        <AlertCircle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
        <span className="text-muted-foreground">
          Preencha pelo menos o telefone ou CPF. Contatos que correspondam serão bloqueados.
        </span>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Nome do contato (opcional)"
        />
      </div>
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
        <Label htmlFor="cpf">CPF</Label>
        <Input
          id="cpf"
          value={formData.cpf}
          onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
          placeholder="12345678901"
        />
      </div>
      
      {formError && (
        <p className="text-sm text-destructive">{formError}</p>
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
          <CrudTable
            title="Blocklist"
            subtitle="Contatos bloqueados que não receberão mensagens"
            columns={columns}
            data={items}
            searchPlaceholder="Buscar na blocklist..."
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            renderForm={renderForm}
            isFormOpen={isFormOpen}
            onFormOpenChange={setIsFormOpen}
            editingItem={editingItem}
          />
        </div>
      </div>
    </MainLayout>
  );
}
