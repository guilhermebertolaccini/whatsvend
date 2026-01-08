import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, RotateCcw, Eye, Loader2, FileText, ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { apiLogsService, ApiLog } from "@/services/api";
import { format } from "date-fns";

interface LogEntry {
  id: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  statusCode: number;
  ip: string;
  date: string;
  requestPayload?: object;
  responsePayload?: object;
  userAgent?: string;
}

const methodColors: Record<string, string> = {
  GET: "bg-primary",
  POST: "bg-success",
  PATCH: "bg-warning text-warning-foreground",
  DELETE: "bg-destructive"
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function LogsAPI() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  // Data de hoje no formato YYYY-MM-DD
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const [filters, setFilters] = useState({
    endpoint: '',
    method: 'POST', // Fixo em POST
    statusCode: '',
    startDate: getTodayDate(), // Data de hoje fixa
    endDate: getTodayDate() // Data de hoje fixa
  });
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const mapApiToLocal = (apiLog: ApiLog): LogEntry => {
    // Tentar formatar a data de forma segura
    let formattedDate = '';
    try {
      if (apiLog.date) {
        const dateObj = typeof apiLog.date === 'string' ? new Date(apiLog.date) : apiLog.date;
        if (!isNaN(dateObj.getTime())) {
          formattedDate = format(dateObj, 'yyyy-MM-dd HH:mm:ss');
        } else {
          formattedDate = String(apiLog.date);
        }
      } else if (apiLog.createdAt) {
        const dateObj = typeof apiLog.createdAt === 'string' ? new Date(apiLog.createdAt) : apiLog.createdAt;
        if (!isNaN(dateObj.getTime())) {
          formattedDate = format(dateObj, 'yyyy-MM-dd HH:mm:ss');
        } else {
          formattedDate = String(apiLog.createdAt);
        }
      }
    } catch (error) {
      console.error('Error formatting date:', error);
      formattedDate = String(apiLog.date || apiLog.createdAt || '');
    }

    return {
      id: apiLog.id.toString(),
      endpoint: apiLog.endpoint,
      method: apiLog.method,
      statusCode: apiLog.statusCode,
      ip: apiLog.ip || apiLog.ipAddress || '',
      date: formattedDate,
      requestPayload: apiLog.requestPayload,
      responsePayload: apiLog.responsePayload,
      userAgent: apiLog.userAgent,
    };
  };

  const loadLogs = useCallback(async (searchParams?: {
    endpoint?: string;
    method?: string;
    statusCode?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    try {
      const data = await apiLogsService.list(searchParams);
      setLogs(data.map(mapApiToLocal));
    } catch (error) {
      toast({
        title: "Erro ao carregar logs",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      // Carregar automaticamente com filtros: POST, endpoint /api/messages/*, data de hoje
      const today = getTodayDate();
      await loadLogs({
        method: 'POST',
        endpoint: '/api/messages*',
        startDate: `${today}T00:00:00.000Z`,
        endDate: `${today}T23:59:59.999Z`,
      });
      setIsLoading(false);
    };
    init();
  }, [loadLogs]);

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const today = getTodayDate();
      const params: {
        endpoint?: string;
        method?: string;
        statusCode?: number;
        startDate?: string;
        endDate?: string;
      } = {
        method: 'POST', // Sempre POST
        endpoint: '/api/messages*', // Sempre endpoint de messages (com * para pegar todos)
        startDate: `${today}T00:00:00.000Z`,
        endDate: `${today}T23:59:59.999Z`,
      };

      if (filters.statusCode.trim()) {
        const statusCode = parseInt(filters.statusCode);
        if (!isNaN(statusCode)) {
          params.statusCode = statusCode;
        }
      }

      await loadLogs(params);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearFilters = async () => {
    const today = getTodayDate();
    setFilters({
      endpoint: '',
      method: 'POST',
      statusCode: '',
      startDate: today,
      endDate: today
    });
    setIsSearching(true);
    const todayISO = getTodayDate();
    await loadLogs({
      method: 'POST',
      endpoint: '/api/messages*',
      startDate: `${todayISO}T00:00:00.000Z`,
      endDate: `${todayISO}T23:59:59.999Z`,
    });
    setIsSearching(false);
  };

  const handleViewDetails = async (log: LogEntry) => {
    setSelectedLog(log);
    
    // If we don't have full details, fetch them
    if (!log.requestPayload && !log.responsePayload && !log.userAgent) {
      setIsLoadingDetails(true);
      try {
        const details = await apiLogsService.getById(parseInt(log.id));
        setSelectedLog(mapApiToLocal(details));
      } catch (error) {
        console.error('Error loading log details:', error);
      } finally {
        setIsLoadingDetails(false);
      }
    }
  };

  // Pagination calculations
  const totalItems = logs.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return logs.slice(startIndex, startIndex + pageSize);
  }, [logs, currentPage, pageSize]);

  const handlePageSizeChange = useCallback((value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  }, []);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }
    return pages;
  }, [totalPages, currentPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const getStatusBadge = (statusCode: number) => {
    const isSuccess = statusCode >= 200 && statusCode < 300;
    return (
      <Badge className={isSuccess ? "bg-success" : "bg-destructive"}>
        {statusCode}
      </Badge>
    );
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
      toast({
        title: "Copiado!",
        description: `${label} copiado para a área de transferência`,
      });
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto scrollbar-content">
        <div className="space-y-6 animate-fade-in">
        {/* Filters */}
        <GlassCard>
          <h2 className="text-xl font-semibold text-foreground mb-6">Logs de API</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="statusCode">Status Code</Label>
              <Input
                id="statusCode"
                value={filters.statusCode}
                onChange={(e) => setFilters({ ...filters, statusCode: e.target.value })}
                placeholder="200, 404..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">Data (Hoje)</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button className="flex-1" onClick={handleSearch} disabled={isSearching}>
                {isSearching ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Buscar
              </Button>
              <Button variant="outline" size="icon" onClick={handleClearFilters} disabled={isSearching}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Filtros Ativos</Label>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">POST</Badge>
                <Badge variant="outline">/api/messages/*</Badge>
                <Badge variant="outline">Hoje</Badge>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Logs Table */}
        <GlassCard padding="none">
          <div className="p-4 md:p-6 border-b border-border/50 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Resultados</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {logs.length} {logs.length === 1 ? 'registro encontrado' : 'registros encontrados'}
              </p>
            </div>
            <Badge variant="outline" className="hidden sm:flex">
              {paginatedLogs.length} nesta página
            </Badge>
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Nenhum log encontrado</p>
              <p className="text-sm">Ajuste os filtros e tente novamente</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-20">ID</TableHead>
                      <TableHead className="min-w-[200px]">Endpoint</TableHead>
                      <TableHead className="w-28">Método</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="min-w-[120px]">IP</TableHead>
                      <TableHead className="min-w-[160px]">Data/Hora</TableHead>
                      <TableHead className="w-20 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="font-mono text-xs">{log.id}</TableCell>
                        <TableCell className="font-mono text-xs break-all max-w-[300px] truncate" title={log.endpoint}>
                          {log.endpoint}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${methodColors[log.method]} text-xs`}>
                            {log.method}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(log.statusCode)}</TableCell>
                        <TableCell className="font-mono text-xs">{log.ip}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {log.date}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleViewDetails(log)}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Mostrando {startItem}-{endItem} de {totalItems}</span>
                    <span className="hidden sm:inline">|</span>
                    <div className="flex items-center gap-2">
                      <span className="hidden sm:inline">Por página:</span>
                      <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                        <SelectTrigger className="w-[70px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map((size) => (
                            <SelectItem key={size} value={String(size)}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    {pageNumbers.map((page, index) => (
                      page === 'ellipsis' ? (
                        <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">...</span>
                      ) : (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => goToPage(page)}
                        >
                          {page}
                        </Button>
                      )
                    ))}
                    
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </GlassCard>
      </div>

      {/* Log Details Modal */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="sm:max-w-5xl max-w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detalhes do Log #{selectedLog?.id}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <>
              {isLoadingDetails ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Tabs defaultValue="info" className="flex-1 flex flex-col min-h-0">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="info">Informações</TabsTrigger>
                    <TabsTrigger value="request">Request Payload</TabsTrigger>
                    <TabsTrigger value="response">Response Payload</TabsTrigger>
                  </TabsList>

                  <TabsContent value="info" className="flex-1 overflow-auto mt-4">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <GlassCard className="p-4">
                          <Label className="text-xs text-muted-foreground uppercase">ID</Label>
                          <p className="font-mono text-sm mt-1">{selectedLog.id}</p>
                        </GlassCard>
                        <GlassCard className="p-4">
                          <Label className="text-xs text-muted-foreground uppercase">Data/Hora</Label>
                          <p className="text-sm mt-1">{selectedLog.date}</p>
                        </GlassCard>
                        <GlassCard className="p-4">
                          <Label className="text-xs text-muted-foreground uppercase">Endpoint</Label>
                          <p className="font-mono text-sm mt-1 break-all">{selectedLog.endpoint}</p>
                        </GlassCard>
                        <GlassCard className="p-4">
                          <Label className="text-xs text-muted-foreground uppercase">IP Address</Label>
                          <p className="font-mono text-sm mt-1">{selectedLog.ip}</p>
                        </GlassCard>
                        <GlassCard className="p-4">
                          <Label className="text-xs text-muted-foreground uppercase">Método HTTP</Label>
                          <div className="mt-1">
                            <Badge className={methodColors[selectedLog.method]}>{selectedLog.method}</Badge>
                          </div>
                        </GlassCard>
                        <GlassCard className="p-4">
                          <Label className="text-xs text-muted-foreground uppercase">Status Code</Label>
                          <div className="mt-1">
                            {getStatusBadge(selectedLog.statusCode)}
                          </div>
                        </GlassCard>
                      </div>

                      {selectedLog.userAgent && (
                        <GlassCard className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-xs text-muted-foreground uppercase">User Agent</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2"
                              onClick={() => copyToClipboard(selectedLog.userAgent || '', 'User Agent')}
                            >
                              {copiedText === 'User Agent' ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground break-all font-mono">{selectedLog.userAgent}</p>
                        </GlassCard>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="request" className="flex-1 flex flex-col min-h-0 mt-4">
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-semibold">Request Payload</Label>
                        {selectedLog.requestPayload && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(JSON.stringify(selectedLog.requestPayload, null, 2), 'Request Payload')}
                          >
                            {copiedText === 'Request Payload' ? (
                              <>
                                <Check className="h-4 w-4 mr-2" />
                                Copiado
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4 mr-2" />
                                Copiar JSON
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      {selectedLog.requestPayload ? (
                        <ScrollArea className="flex-1 border rounded-lg bg-muted/30">
                          <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words">
                            {JSON.stringify(selectedLog.requestPayload, null, 2)}
                          </pre>
                        </ScrollArea>
                      ) : (
                        <div className="flex-1 flex items-center justify-center border rounded-lg bg-muted/30">
                          <p className="text-muted-foreground">Nenhum payload de request disponível</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="response" className="flex-1 flex flex-col min-h-0 mt-4">
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-semibold">Response Payload</Label>
                        {selectedLog.responsePayload && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(JSON.stringify(selectedLog.responsePayload, null, 2), 'Response Payload')}
                          >
                            {copiedText === 'Response Payload' ? (
                              <>
                                <Check className="h-4 w-4 mr-2" />
                                Copiado
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4 mr-2" />
                                Copiar JSON
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      {selectedLog.responsePayload ? (
                        <ScrollArea className="flex-1 border rounded-lg bg-muted/30">
                          <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words">
                            {JSON.stringify(selectedLog.responsePayload, null, 2)}
                          </pre>
                        </ScrollArea>
                      ) : (
                        <div className="flex-1 flex items-center justify-center border rounded-lg bg-muted/30">
                          <p className="text-muted-foreground">Nenhum payload de response disponível</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </MainLayout>
  );
}
