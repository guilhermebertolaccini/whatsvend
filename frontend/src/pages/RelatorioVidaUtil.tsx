import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Download, Loader2, Clock, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { linesService } from "@/services/api";

interface LifespanData {
    Telefone: string;
    Status: string;
    Segmento: string;
    "Data Criação": string;
    "Tempo de Vida": string;
}

export default function RelatorioVidaUtil() {
    const [data, setData] = useState<LifespanData[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const response = await linesService.getLineLifespan();
            setData(response);
        } catch (error) {
            console.error("Erro ao carregar relatório:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExport = () => {
        // Exportar para CSV
        const headers = ["Telefone", "Status", "Segmento", "Data Criação", "Tempo de Vida"];
        const csvContent = [
            headers.join(","),
            ...data.map(row => [
                row.Telefone,
                row.Status,
                row.Segmento,
                new Date(row["Data Criação"]).toLocaleDateString('pt-BR'),
                row["Tempo de Vida"]
            ].join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `relatorio_vida_util_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <MainLayout>
            <div className="space-y-6 pb-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Vida Útil das Linhas</h1>
                        <p className="text-muted-foreground mt-1">
                            Relatório de duração das linhas ativas
                        </p>
                    </div>
                    <Button onClick={handleExport} disabled={isLoading || data.length === 0} variant="outline" className="gap-2">
                        <Download className="h-4 w-4" />
                        Exportar CSV
                    </Button>
                </div>

                <Card className="shadow-md">
                    <CardHeader className="bg-muted/10 border-b">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-primary" />
                            <CardTitle>Linhas Ativas</CardTitle>
                        </div>
                        <CardDescription>
                            Listagem ordenada por tempo de atividade (mais antigas primeiro)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                                <Loader2 className="h-8 w-8 animate-spin mb-2 text-primary" />
                                <p>Carregando dados...</p>
                            </div>
                        ) : data.length === 0 ? (
                            <div className="text-center p-12 text-muted-foreground">
                                Nenhuma linha ativa encontrada.
                            </div>
                        ) : (
                            <div className="max-h-[600px] overflow-auto">
                                <Table>
                                    <TableHeader className="bg-muted/20 sticky top-0">
                                        <TableRow>
                                            <TableHead>Telefone</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Segmento</TableHead>
                                            <TableHead>Data Criação</TableHead>
                                            <TableHead className="text-right font-bold">Tempo de Vida</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.map((row, idx) => (
                                            <TableRow key={idx} className="hover:bg-muted/5">
                                                <TableCell className="font-mono font-medium flex items-center gap-2">
                                                    <Smartphone className="h-4 w-4 text-muted-foreground opacity-50" />
                                                    {row.Telefone}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 capitalize">
                                                        {row.Status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className="font-normal">
                                                        {row.Segmento}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground text-sm">
                                                    {new Date(row["Data Criação"]).toLocaleString('pt-BR')}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold text-primary">
                                                    {row["Tempo de Vida"]}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </MainLayout>
    );
}
