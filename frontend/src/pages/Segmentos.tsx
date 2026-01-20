import { useState, useEffect, useCallback, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { CrudTable, Column } from "@/components/crud/CrudTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { segmentsService, Segment as APISegment } from "@/services/api";
import { Upload, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Segment {
  id: string;
  name: string;
  allowsFreeMessage: boolean;
  identifier?: 'cliente' | 'proprietario';
}

export default function Segmentos() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [formData, setFormData] = useState({ name: '', allowsFreeMessage: true, identifier: 'proprietario' as 'cliente' | 'proprietario' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mapApiToLocal = (apiSegment: APISegment): Segment => ({
    id: apiSegment.id.toString(),
    name: apiSegment.name,
    allowsFreeMessage: apiSegment.allowsFreeMessage ?? true,
    identifier: (apiSegment as any).identifier || 'proprietario',
  });

  const loadSegments = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await segmentsService.list();
      setSegments(data.map(mapApiToLocal));
    } catch (error) {
      toast({
        title: "Erro ao carregar segmentos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  const columns: Column<Segment>[] = [
    { key: "name", label: "Nome" },
    {
      key: "allowsFreeMessage",
      label: "Mensagem Livre",
      render: (segment) => (
        segment.allowsFreeMessage ? (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            Sim
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            Apenas Templates
          </Badge>
        )
      )
    }
  ];

  const handleAdd = () => {
    setEditingSegment(null);
    setFormData({ name: '', allowsFreeMessage: true, identifier: 'proprietario' });
    setIsFormOpen(true);
  };

  const handleEdit = (segment: Segment) => {
    setEditingSegment(segment);
    setFormData({ name: segment.name, allowsFreeMessage: segment.allowsFreeMessage, identifier: segment.identifier || 'proprietario' });
    setIsFormOpen(true);
  };

  const handleDelete = async (segment: Segment) => {
    try {
      await segmentsService.delete(parseInt(segment.id));
      setSegments(segments.filter(s => s.id !== segment.id));
      toast({
        title: "Segmento excluído",
        description: "Segmento removido com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: error instanceof Error ? error.message : "Erro ao excluir segmento",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "O nome do segmento é obrigatório",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingSegment) {
        const updated = await segmentsService.update(parseInt(editingSegment.id), {
          name: formData.name.trim(),
          allowsFreeMessage: formData.allowsFreeMessage,
          identifier: formData.identifier
        });
        setSegments(segments.map(s => s.id === editingSegment.id ? mapApiToLocal(updated) : s));
        toast({
          title: "Segmento atualizado",
          description: "Segmento atualizado com sucesso",
        });
      } else {
        const created = await segmentsService.create(formData.name.trim(), formData.allowsFreeMessage, formData.identifier);
        setSegments([...segments, mapApiToLocal(created)]);
        toast({
          title: "Segmento criado",
          description: "Segmento criado com sucesso",
        });
      }
      setIsFormOpen(false);
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro ao salvar segmento",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione um arquivo CSV",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const result = await segmentsService.uploadCSV(file);
      toast({
        title: "Importação concluída",
        description: `${result.message}. ${result.errors.length > 0 ? `${result.errors.length} erro(s) encontrado(s).` : ''}`,
        variant: result.errors.length > 0 ? "default" : "success",
      });

      if (result.errors.length > 0) {
        console.warn('Erros na importação:', result.errors);
      }

      // Recarregar lista de segmentos
      await loadSegments();
    } catch (error) {
      console.error('Error uploading CSV:', error);
      toast({
        title: "Erro ao importar",
        description: error instanceof Error ? error.message : "Não foi possível importar o arquivo CSV",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Limpar input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const renderForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome do Segmento *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox
          id="allowsFreeMessage"
          checked={formData.allowsFreeMessage}
          onCheckedChange={(checked) => setFormData({ ...formData, allowsFreeMessage: checked === true })}
        />
        <Label htmlFor="allowsFreeMessage" className="text-sm font-normal cursor-pointer">
          Permitir mensagens livres no 1x1
        </Label>
      </div>
      <div className="text-xs text-muted-foreground">
        {formData.allowsFreeMessage
          ? "Operadores deste segmento podem enviar qualquer mensagem no 1x1"
          : "Operadores deste segmento só podem enviar mensagens através de templates no 1x1"}
      </div>
      <div className="space-y-2">
        <Label htmlFor="identifier">Identificador</Label>
        <Select value={formData.identifier} onValueChange={(value: 'cliente' | 'proprietario') => setFormData({ ...formData, identifier: value })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="proprietario">Proprietário (vê todos os dados)</SelectItem>
            <SelectItem value="cliente">Cliente (vê apenas seus dados)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Cliente só vê seus dados nos relatórios. Proprietário vê tudo.
        </p>
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
          <div className="mb-4 flex justify-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleUploadCSV}
              className="hidden"
              id="csv-upload-segments"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar CSV
                </>
              )}
            </Button>
          </div>
          <CrudTable
            title="Segmentos"
            subtitle="Gerenciar segmentos de atendimento"
            columns={columns}
            data={segments}
            searchPlaceholder="Buscar segmentos..."
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            renderForm={renderForm}
            isFormOpen={isFormOpen}
            onFormOpenChange={setIsFormOpen}
            editingItem={editingSegment}
          />
        </div>
      </div>
    </MainLayout>
  );
}
