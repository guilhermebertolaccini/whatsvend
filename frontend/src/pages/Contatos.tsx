import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { CrudTable, Column } from "@/components/crud/CrudTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { contactsService, segmentsService, Contact as APIContact, Segment } from "@/services/api";

interface Contact {
  id: string;
  name: string;
  phone: string;
  cpf: string;
  contract?: string;
  segment?: string;
  isCPC?: boolean;
}

export default function Contatos() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', cpf: '', contract: '', segment: '', isCPC: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const mapApiToLocal = (apiContact: APIContact): Contact => ({
    id: apiContact.id.toString(),
    name: apiContact.name,
    phone: apiContact.phone,
    cpf: apiContact.cpf || '',
    contract: apiContact.contract || '',
    segment: apiContact.segment?.toString() || '',
    isCPC: apiContact.isCPC || false,
  });

  const loadContacts = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await contactsService.list();
      setContacts(data.map(mapApiToLocal));
    } catch (error) {
      toast({
        title: "Erro ao carregar contatos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSegments = useCallback(async () => {
    try {
      const data = await segmentsService.list();
      setSegments(data);
    } catch (error) {
      console.error('Error loading segments:', error);
    }
  }, []);

  useEffect(() => {
    loadContacts();
    loadSegments();
  }, [loadContacts, loadSegments]);

  const columns: Column<Contact>[] = [
    { key: "name", label: "Nome" },
    { key: "phone", label: "Telefone" },
    { key: "cpf", label: "CPF" },
    { key: "contract", label: "Contrato" },
    { 
      key: "segment", 
      label: "Segmento",
      render: (contact) => {
        const segment = segments.find(s => s.id.toString() === contact.segment);
        return segment?.name || '-';
      }
    },
    {
      key: "isCPC",
      label: "CPC",
      render: (contact) => (
        <Badge variant={contact.isCPC ? "default" : "secondary"} className={contact.isCPC ? "bg-blue-600 text-white" : ""}>
          {contact.isCPC ? "Sim" : "Não"}
        </Badge>
      )
    },
  ];

  const handleAdd = () => {
    setEditingContact(null);
    setFormData({ name: '', phone: '', cpf: '', contract: '', segment: '', isCPC: false });
    setIsFormOpen(true);
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({ 
      name: contact.name, 
      phone: contact.phone, 
      cpf: contact.cpf, 
      contract: contact.contract || '',
      segment: contact.segment || '',
      isCPC: contact.isCPC || false,
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (contact: Contact) => {
    try {
      await contactsService.delete(parseInt(contact.id));
      setContacts(contacts.filter(c => c.id !== contact.id));
      toast({
        title: "Contato excluído",
        description: "Contato removido com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: error instanceof Error ? error.message : "Erro ao excluir contato",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome e telefone são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        cpf: formData.cpf.trim() || undefined,
        contract: formData.contract.trim() || undefined,
        segment: formData.segment ? parseInt(formData.segment) : undefined,
        isCPC: formData.isCPC,
      };

      if (editingContact) {
        const updated = await contactsService.update(parseInt(editingContact.id), payload);
        setContacts(contacts.map(c => c.id === editingContact.id ? mapApiToLocal(updated) : c));
        toast({
          title: "Contato atualizado",
          description: "Contato atualizado com sucesso",
        });
      } else {
        const created = await contactsService.create(payload);
        setContacts([...contacts, mapApiToLocal(created)]);
        toast({
          title: "Contato criado",
          description: "Contato criado com sucesso",
        });
      }
      setIsFormOpen(false);
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro ao salvar contato",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Telefone *</Label>
        <Input
          id="phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="+55 11 99999-9999"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cpf">CPF</Label>
        <Input
          id="cpf"
          value={formData.cpf}
          onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
          placeholder="000.000.000-00"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contract">Contrato</Label>
        <Input
          id="contract"
          value={formData.contract}
          onChange={(e) => setFormData({ ...formData, contract: e.target.value })}
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
              <SelectItem key={segment.id} value={segment.id.toString()}>
                {segment.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label className="text-base font-medium">Marcar como CPC</Label>
          <p className="text-sm text-muted-foreground">
            Indica se este contato é um CPC (Contato com a Pessoa Certa)
          </p>
        </div>
        <Switch
          id="isCPC"
          checked={formData.isCPC}
          onCheckedChange={(checked) => setFormData({ ...formData, isCPC: checked })}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar'}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto scrollbar-content">
        <div className="animate-fade-in">
          <CrudTable
          title="Contatos"
          subtitle="Gerenciar contatos do sistema"
          columns={columns}
          data={contacts}
          searchPlaceholder="Buscar contatos..."
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
          renderForm={renderForm}
          isFormOpen={isFormOpen}
          onFormOpenChange={setIsFormOpen}
          editingItem={editingContact}
        />
      </div>
      </div>
    </MainLayout>
  );
}
