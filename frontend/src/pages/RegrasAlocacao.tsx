import { useState, useEffect } from 'react';
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { segmentsService, type Segment } from "@/services/api";
import { Settings, Users, Save, Loader2 } from "lucide-react";

export default function RegrasAlocacao() {
    const [segments, setSegments] = useState<(Segment & { maxOperatorsPerLine?: number })[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editValue, setEditValue] = useState<number>(2);
    const [savingId, setSavingId] = useState<number | null>(null);

    useEffect(() => {
        loadSegments();
    }, []);

    const loadSegments = async () => {
        try {
            setIsLoading(true);
            const data = await segmentsService.list();
            setSegments(data);
        } catch (error) {
            console.error('Error loading segments:', error);
            toast({
                title: "Erro ao carregar segmentos",
                description: "Não foi possível carregar a lista de segmentos",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleEdit = (segment: Segment & { maxOperatorsPerLine?: number }) => {
        setEditingId(segment.id);
        setEditValue(segment.maxOperatorsPerLine ?? 2);
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditValue(2);
    };

    const handleSave = async (segmentId: number) => {
        if (editValue < 1) {
            toast({
                title: "Valor inválido",
                description: "O mínimo é 1 operador por linha",
                variant: "destructive"
            });
            return;
        }

        try {
            setSavingId(segmentId);
            await segmentsService.update(segmentId, { maxOperatorsPerLine: editValue });

            // Atualizar lista local
            setSegments(prev => prev.map(s =>
                s.id === segmentId
                    ? { ...s, maxOperatorsPerLine: editValue }
                    : s
            ));

            setEditingId(null);
            toast({
                title: "Configuração salva",
                description: "O limite de operadores por linha foi atualizado. Operadores excedentes serão realocados automaticamente.",
            });
        } catch (error) {
            console.error('Error updating segment:', error);
            toast({
                title: "Erro ao salvar",
                description: "Não foi possível atualizar a configuração",
                variant: "destructive"
            });
        } finally {
            setSavingId(null);
        }
    };

    if (isLoading) {
        return (
            <MainLayout>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="h-full overflow-y-auto scrollbar-content">
                <div className="animate-fade-in space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="h-5 w-5" />
                                Regras de Alocação
                            </CardTitle>
                            <CardDescription>
                                Configure o número máximo de operadores permitidos por linha em cada segmento.
                                Ao reduzir o limite, operadores excedentes serão desvinculados e adicionados à fila para realocação.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Segmento</TableHead>
                                        <TableHead>Identificador</TableHead>
                                        <TableHead className="text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <Users className="h-4 w-4" />
                                                Máx. Operadores/Linha
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-center">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {segments.map((segment) => (
                                        <TableRow key={segment.id}>
                                            <TableCell className="font-medium">{segment.name}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {segment.identifier === 'cliente' ? 'Cliente' : 'Proprietário'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {editingId === segment.id ? (
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        max={10}
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(Math.max(1, parseInt(e.target.value) || 1))}
                                                        className="w-20 mx-auto text-center"
                                                    />
                                                ) : (
                                                    <span className="font-semibold text-lg">
                                                        {segment.maxOperatorsPerLine ?? 2}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {editingId === segment.id ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleSave(segment.id)}
                                                            disabled={savingId === segment.id}
                                                        >
                                                            {savingId === segment.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Save className="h-4 w-4" />
                                                            )}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={handleCancel}
                                                            disabled={savingId === segment.id}
                                                        >
                                                            Cancelar
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleEdit(segment)}
                                                    >
                                                        Editar
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {segments.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                                Nenhum segmento encontrado
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Como funciona</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-2">
                            <p>
                                • O limite define quantos operadores podem compartilhar a mesma linha WhatsApp
                            </p>
                            <p>
                                • Ao <strong>aumentar</strong> o limite, novos operadores poderão ser alocados às linhas existentes
                            </p>
                            <p>
                                • Ao <strong>reduzir</strong> o limite, operadores excedentes serão desvinculados automaticamente
                            </p>
                            <p>
                                • Operadores online desvinculados entram automaticamente na fila para receber nova linha
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </MainLayout>
    );
}
