import { useState, useEffect } from 'react';
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Download, Play, Plus, Trash2, Loader2, Database, TableIcon, Filter } from "lucide-react";
import { API_BASE_URL, getAuthToken } from "@/services/api";

interface TableInfo {
    name: string;
    displayName: string;
    description: string;
}

interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
}

interface FilterItem {
    id: string;
    column: string;
    operator: string;
    value: string;
}

interface QueryResult {
    query: string;
    totalRows: number;
    data: Record<string, any>[];
}

const OPERATORS = [
    { value: '=', label: 'Igual a' },
    { value: '!=', label: 'Diferente de' },
    { value: '>', label: 'Maior que' },
    { value: '<', label: 'Menor que' },
    { value: '>=', label: 'Maior ou igual' },
    { value: '<=', label: 'Menor ou igual' },
    { value: 'ILIKE', label: 'Contém' },
    { value: 'IS NULL', label: 'É nulo' },
    { value: 'IS NOT NULL', label: 'Não é nulo' },
];

export default function CriadorRelatorio() {
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [columns, setColumns] = useState<ColumnInfo[]>([]);
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
    const [filters, setFilters] = useState<FilterItem[]>([]);
    const [limit, setLimit] = useState<number>(1000);
    const [result, setResult] = useState<QueryResult | null>(null);
    const [isLoadingTables, setIsLoadingTables] = useState(true);
    const [isLoadingColumns, setIsLoadingColumns] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);

    // Carregar tabelas disponíveis
    useEffect(() => {
        loadTables();
    }, []);

    // Carregar colunas quando tabela muda
    useEffect(() => {
        if (selectedTable) {
            loadColumns(selectedTable);
            setSelectedColumns([]);
            setFilters([]);
            setResult(null);
        }
    }, [selectedTable]);

    const loadTables = async () => {
        try {
            setIsLoadingTables(true);
            const response = await fetch(`${API_BASE_URL}/reports/builder/tables`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            const data = await response.json();
            setTables(data);
        } catch (error) {
            console.error('Error loading tables:', error);
            toast({
                title: "Erro ao carregar tabelas",
                description: "Não foi possível carregar a lista de tabelas",
                variant: "destructive"
            });
        } finally {
            setIsLoadingTables(false);
        }
    };

    const loadColumns = async (table: string) => {
        try {
            setIsLoadingColumns(true);
            const response = await fetch(`${API_BASE_URL}/reports/builder/columns?table=${table}`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            const data = await response.json();
            setColumns(data);
        } catch (error) {
            console.error('Error loading columns:', error);
            toast({
                title: "Erro ao carregar colunas",
                description: "Não foi possível carregar as colunas da tabela",
                variant: "destructive"
            });
        } finally {
            setIsLoadingColumns(false);
        }
    };

    const handleSelectAllColumns = () => {
        if (selectedColumns.length === columns.length) {
            setSelectedColumns([]);
        } else {
            setSelectedColumns(columns.map(c => c.name));
        }
    };

    const handleToggleColumn = (columnName: string) => {
        if (selectedColumns.includes(columnName)) {
            setSelectedColumns(prev => prev.filter(c => c !== columnName));
        } else {
            setSelectedColumns(prev => [...prev, columnName]);
        }
    };

    const addFilter = () => {
        if (columns.length === 0) return;
        setFilters(prev => [...prev, {
            id: crypto.randomUUID(),
            column: columns[0].name,
            operator: '=',
            value: '',
        }]);
    };

    const updateFilter = (id: string, field: keyof FilterItem, value: string) => {
        setFilters(prev => prev.map(f =>
            f.id === id ? { ...f, [field]: value } : f
        ));
    };

    const removeFilter = (id: string) => {
        setFilters(prev => prev.filter(f => f.id !== id));
    };

    const executeQuery = async () => {
        if (!selectedTable || selectedColumns.length === 0) {
            toast({
                title: "Configuração incompleta",
                description: "Selecione uma tabela e ao menos uma coluna",
                variant: "destructive"
            });
            return;
        }

        try {
            setIsExecuting(true);
            const response = await fetch(`${API_BASE_URL}/reports/builder/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    table: selectedTable,
                    columns: selectedColumns,
                    filters: filters.filter(f => f.value || f.operator === 'IS NULL' || f.operator === 'IS NOT NULL'),
                    limit,
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Erro ao executar query');
            }
            setResult(data);
            toast({
                title: "Query executada",
                description: `${data.totalRows} registro(s) encontrado(s)`,
            });
        } catch (error: any) {
            console.error('Error executing query:', error);
            toast({
                title: "Erro ao executar query",
                description: error.message || "Não foi possível executar a consulta",
                variant: "destructive"
            });
        } finally {
            setIsExecuting(false);
        }
    };

    const downloadCSV = () => {
        if (!result || result.data.length === 0) return;

        // Construir CSV
        const headers = selectedColumns.join(';');
        const rows = result.data.map(row =>
            selectedColumns.map(col => {
                const value = row[col];
                if (value === null || value === undefined) return '';
                if (typeof value === 'string' && (value.includes(';') || value.includes('\n'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return String(value);
            }).join(';')
        );

        const csv = [headers, ...rows].join('\n');
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const tableInfo = tables.find(t => t.name === selectedTable);
        const fileName = `relatorio_${tableInfo?.displayName || selectedTable}_${new Date().toISOString().split('T')[0]}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({
            title: "Download iniciado",
            description: `Arquivo ${fileName} sendo baixado`,
        });
    };

    const getTypeColor = (type: string) => {
        if (type.includes('int') || type.includes('numeric')) return 'bg-blue-500';
        if (type.includes('varchar') || type.includes('text')) return 'bg-green-500';
        if (type.includes('timestamp') || type.includes('date')) return 'bg-purple-500';
        if (type.includes('bool')) return 'bg-yellow-500';
        return 'bg-gray-500';
    };

    if (isLoadingTables) {
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
                    {/* Header */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="h-5 w-5" />
                                Criador de Relatórios
                            </CardTitle>
                            <CardDescription>
                                Selecione uma tabela, escolha as colunas desejadas, aplique filtros e exporte os dados em CSV.
                            </CardDescription>
                        </CardHeader>
                    </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Seleção de Tabela */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <TableIcon className="h-4 w-4" />
                                    1. Tabela
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Select value={selectedTable} onValueChange={setSelectedTable}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione uma tabela" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {tables.map(table => (
                                            <SelectItem key={table.name} value={table.name}>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{table.displayName}</span>
                                                    <span className="text-xs text-muted-foreground">{table.description}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </CardContent>
                        </Card>

                        {/* Seleção de Colunas */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <TableIcon className="h-4 w-4" />
                                    2. Colunas
                                    {selectedColumns.length > 0 && (
                                        <Badge variant="secondary">{selectedColumns.length} selecionada(s)</Badge>
                                    )}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {isLoadingColumns ? (
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : columns.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">Selecione uma tabela primeiro</p>
                                ) : (
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                        <div className="flex items-center space-x-2 pb-2 border-b">
                                            <Checkbox
                                                checked={selectedColumns.length === columns.length}
                                                onCheckedChange={handleSelectAllColumns}
                                            />
                                            <Label className="font-medium">Selecionar todas</Label>
                                        </div>
                                        {columns.map(col => (
                                            <div key={col.name} className="flex items-center space-x-2">
                                                <Checkbox
                                                    checked={selectedColumns.includes(col.name)}
                                                    onCheckedChange={() => handleToggleColumn(col.name)}
                                                />
                                                <Label className="flex items-center gap-2 cursor-pointer">
                                                    {col.name}
                                                    <Badge variant="outline" className={`text-xs text-white ${getTypeColor(col.type)}`}>
                                                        {col.type.split(' ')[0]}
                                                    </Badge>
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Filtros */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Filter className="h-4 w-4" />
                                    3. Filtros
                                    <Button size="sm" variant="outline" onClick={addFilter} disabled={columns.length === 0}>
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {filters.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">Nenhum filtro aplicado (opcional)</p>
                                ) : (
                                    <div className="space-y-3">
                                        {filters.map(filter => (
                                            <div key={filter.id} className="flex items-center gap-2">
                                                <Select
                                                    value={filter.column}
                                                    onValueChange={(v) => updateFilter(filter.id, 'column', v)}
                                                >
                                                    <SelectTrigger className="w-32">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {columns.map(col => (
                                                            <SelectItem key={col.name} value={col.name}>{col.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Select
                                                    value={filter.operator}
                                                    onValueChange={(v) => updateFilter(filter.id, 'operator', v)}
                                                >
                                                    <SelectTrigger className="w-28">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {OPERATORS.map(op => (
                                                            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {!['IS NULL', 'IS NOT NULL'].includes(filter.operator) && (
                                                    <Input
                                                        value={filter.value}
                                                        onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
                                                        placeholder="Valor"
                                                        className="w-24"
                                                    />
                                                )}
                                                <Button size="icon" variant="ghost" onClick={() => removeFilter(filter.id)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Ações */}
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <Label>Limite:</Label>
                                    <Input
                                        type="number"
                                        value={limit}
                                        onChange={(e) => setLimit(Math.min(10000, Math.max(1, parseInt(e.target.value) || 1)))}
                                        className="w-24"
                                        min={1}
                                        max={10000}
                                    />
                                </div>
                                <Button
                                    onClick={executeQuery}
                                    disabled={!selectedTable || selectedColumns.length === 0 || isExecuting}
                                >
                                    {isExecuting ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <Play className="h-4 w-4 mr-2" />
                                    )}
                                    Executar Query
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={downloadCSV}
                                    disabled={!result || result.data.length === 0}
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    Baixar CSV
                                </Button>
                                {result && (
                                    <span className="text-sm text-muted-foreground">
                                        {result.totalRows} registro(s) encontrado(s)
                                    </span>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Resultado */}
                    {result && result.data.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Resultado da Query</CardTitle>
                                <CardDescription className="font-mono text-xs bg-muted p-2 rounded">
                                    {result.query}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                {selectedColumns.map(col => (
                                                    <TableHead key={col}>{col}</TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {result.data.slice(0, 100).map((row, idx) => (
                                                <TableRow key={idx}>
                                                    {selectedColumns.map(col => (
                                                        <TableCell key={col} className="max-w-xs truncate">
                                                            {row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    {result.data.length > 100 && (
                                        <p className="text-center text-muted-foreground text-sm mt-4">
                                            Mostrando primeiros 100 de {result.data.length} registros. Baixe o CSV para ver todos.
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
