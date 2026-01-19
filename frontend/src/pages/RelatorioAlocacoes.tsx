import { useState, useEffect, useRef } from "react";
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
import { Loader2, RefreshCw, Activity, Play, Pause, Phone, User, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { linesService } from "@/services/api";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AllocationLog {
    id: number;
    timestamp: string;
    operatorName: string;
    segmentName: string;
    linePhone: string;
}

export default function RelatorioAlocacoes() {
    const [data, setData] = useState<AllocationLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAutoRefresh, setIsAutoRefresh] = useState(true);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const loadData = async () => {
        try {
            const response = await linesService.getAllocationsLog(50);
            setData(response);
        } catch (error) {
            console.error("Erro ao carregar log de alocações:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (isAutoRefresh) {
            intervalRef.current = setInterval(() => {
                loadData();
            }, 3000); // Atualiza a cada 3 segundos
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isAutoRefresh]);

    const toggleAutoRefresh = () => {
        setIsAutoRefresh(!isAutoRefresh);
    };

    return (
        <MainLayout>
            <div className="space-y-6 pb-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <Activity className="h-8 w-8 text-primary" />
                            Log de Alocações
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Acompanhamento em tempo real das alocações de linha
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={toggleAutoRefresh}
                            variant={isAutoRefresh ? "default" : "outline"}
                            className="gap-2"
                        >
                            {isAutoRefresh ? (
                                <>
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </span>
                                    Ao Vivo
                                </>
                            ) : (
                                <>
                                    <Pause className="h-4 w-4" />
                                    Pausado
                                </>
                            )}
                        </Button>
                        <Button onClick={loadData} variant="outline" size="icon" disabled={isLoading}>
                            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>

                <Card className="shadow-md">
                    <CardHeader className="bg-muted/10 border-b">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Alocações Recentes</CardTitle>
                                <CardDescription>
                                    Últimas 50 alocações de linha para operadores
                                </CardDescription>
                            </div>
                            <Badge variant="outline" className="font-mono">
                                {data.length} registros
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {isLoading && data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                                <Loader2 className="h-8 w-8 animate-spin mb-2 text-primary" />
                                <p>Carregando dados...</p>
                            </div>
                        ) : data.length === 0 ? (
                            <div className="text-center p-12 text-muted-foreground">
                                <Activity className="h-12 w-12 mx-auto mb-4 opacity-30" />
                                <p className="text-lg font-medium">Nenhuma alocação registrada ainda</p>
                                <p className="text-sm">As alocações aparecerão aqui em tempo real</p>
                            </div>
                        ) : (
                            <div className="max-h-[600px] overflow-auto">
                                <Table>
                                    <TableHeader className="bg-muted/20 sticky top-0">
                                        <TableRow>
                                            <TableHead>Hora</TableHead>
                                            <TableHead>Operador</TableHead>
                                            <TableHead>Segmento</TableHead>
                                            <TableHead className="text-right">Linha Alocada</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.map((row) => (
                                            <TableRow key={row.id} className="hover:bg-muted/5">
                                                <TableCell className="text-muted-foreground text-sm">
                                                    {format(new Date(row.timestamp), "dd/MM HH:mm:ss", { locale: ptBR })}
                                                </TableCell>
                                                <TableCell className="font-medium flex items-center gap-2">
                                                    <User className="h-4 w-4 text-muted-foreground opacity-50" />
                                                    {row.operatorName}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className="font-normal gap-1">
                                                        <Layers className="h-3 w-3" />
                                                        {row.segmentName}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold text-primary flex items-center justify-end gap-2">
                                                    <Phone className="h-4 w-4 opacity-50" />
                                                    {row.linePhone}
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
