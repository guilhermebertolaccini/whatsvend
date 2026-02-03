import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { CrudTable, Column } from "@/components/crud/CrudTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { tagsService, segmentsService, type Tag as ApiTag, type Segment } from "@/services/api";

interface Tag {
  id: string;
  name: string;
  description?: string;
  segment?: number;
  segmentName?: string;
}

export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', segment: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tagsData, segmentsData] = await Promise.all([
        tagsService.list(),
        segmentsService.list()
      ]);

      setSegments(segmentsData);
      setTags(tagsData.map((t: ApiTag) => ({
        id: String(t.id),
        name: t.name,
        description: t.description,
        segment: t.segment ?? undefined,
        segmentName: segmentsData.find(s => s.id === t.segment)?.name
      })));
    } catch (error) {
      console.error('Error loading tags:', error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as tags",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<Tag>[] = [
    { key: "name", label: "Nome" },
    { key: "description", label: "Descrição", render: (tag) => tag.description || "-" },
    { key: "segmentName", label: "Segmento", render: (tag) => tag.segmentName || "-" }
  ];

  const handleAdd = () => {
    setEditingTag(null);
    setFormData({ name: '', description: '', segment: '' });
    setIsFormOpen(true);
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setFormData({ 
      name: tag.name, 
      description: tag.description || '', 
      segment: tag.segment ? String(tag.segment) : '' 
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (tag: Tag) => {
    try {
      await tagsService.delete(Number(tag.id));
      setTags(tags.filter(t => t.id !== tag.id));
      toast({
        title: "Tag removida",
        description: `A tag ${tag.name} foi removida com sucesso`,
      });
    } catch (error) {
      console.error('Error deleting tag:', error);
      toast({
        title: "Erro ao remover",
        description: "Não foi possível remover a tag",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Informe o nome da tag",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const tagData = {
        name: formData.name,
        description: formData.description || undefined,
        segment: formData.segment ? Number(formData.segment) : undefined
      };

      if (editingTag) {
        const updated = await tagsService.update(Number(editingTag.id), tagData);
        setTags(tags.map(t => t.id === editingTag.id ? {
          id: String(updated.id),
          name: updated.name,
          description: updated.description,
          segment: updated.segment ?? undefined,
          segmentName: segments.find(s => s.id === updated.segment)?.name
        } : t));
        toast({
          title: "Tag atualizada",
          description: `A tag ${updated.name} foi atualizada com sucesso`,
        });
      } else {
        const created = await tagsService.create(tagData);
        setTags([...tags, {
          id: String(created.id),
          name: created.name,
          description: created.description,
          segment: created.segment ?? undefined,
          segmentName: segments.find(s => s.id === created.segment)?.name
        }]);
        toast({
          title: "Tag criada",
          description: `A tag ${created.name} foi criada com sucesso`,
        });
      }
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving tag:', error);
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Não foi possível salvar a tag",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome da Tag</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Ex: VIP, Urgente, Novo"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Descrição da tag..."
          rows={3}
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
          title="Tags"
          subtitle="Gerenciar etiquetas para contatos"
          columns={columns}
          data={tags}
          searchPlaceholder="Buscar tags..."
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
          renderForm={renderForm}
          isFormOpen={isFormOpen}
          onFormOpenChange={setIsFormOpen}
          editingItem={editingTag}
        />
      </div>
    </MainLayout>
  );
}
