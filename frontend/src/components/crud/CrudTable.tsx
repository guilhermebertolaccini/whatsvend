import { useState, useMemo, useCallback, memo } from "react";
import { Plus, Search, Pencil, Trash2, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (item: T) => React.ReactNode;
}

interface CrudTableProps<T extends { id: string }> {
  title: string;
  subtitle?: string;
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  onAdd?: () => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  renderForm?: (item: T | null, onClose: () => void) => React.ReactNode;
  isFormOpen?: boolean;
  onFormOpenChange?: (open: boolean) => void;
  editingItem?: T | null;
  pageSize?: number;
  renderActions?: (item: T) => React.ReactNode;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Memoized table row component for performance
const TableRowMemo = memo(function TableRowMemo<T extends { id: string }>({
  item,
  columns,
  getValue,
  onEdit,
  onDelete,
  setDeleteItem,
  renderActions,
}: {
  item: T;
  columns: Column<T>[];
  getValue: (item: T, key: string) => unknown;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  setDeleteItem: (item: T) => void;
  renderActions?: (item: T) => React.ReactNode;
}) {
  return (
    <TableRow className="hover:bg-muted/20 transition-colors">
      {columns.map((col) => (
        <TableCell key={String(col.key)}>
          {col.render
            ? col.render(item)
            : String(getValue(item, String(col.key)) ?? '')}
        </TableCell>
      ))}
      {(onEdit || onDelete || renderActions) && (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {renderActions && renderActions(item)}
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(item)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleteItem(item)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}) as <T extends { id: string }>(props: {
  item: T;
  columns: Column<T>[];
  getValue: (item: T, key: string) => unknown;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  setDeleteItem: (item: T) => void;
  renderActions?: (item: T) => React.ReactNode;
}) => React.ReactElement;

export function CrudTable<T extends { id: string }>({
  title,
  subtitle,
  columns,
  data,
  searchPlaceholder = "Buscar...",
  onSearch,
  onAdd,
  onEdit,
  onDelete,
  renderForm,
  isFormOpen,
  onFormOpenChange,
  editingItem,
  pageSize: initialPageSize = 10,
  renderActions,
}: CrudTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteItem, setDeleteItem] = useState<T | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Reset to first page when data or search changes
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
    onSearch?.(value);
  }, [onSearch]);

  const handleDelete = useCallback(() => {
    if (deleteItem && onDelete) {
      onDelete(deleteItem);
      setDeleteItem(null);
    }
  }, [deleteItem, onDelete]);

  const getValue = useCallback((item: T, key: string) => {
    const keys = key.split('.');
    let value: unknown = item;
    for (const k of keys) {
      value = (value as Record<string, unknown>)?.[k];
    }
    return value;
  }, []);

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return data;
    }
    
    const query = searchQuery.toLowerCase().trim();
    return data.filter((item) => {
      // Search across all columns
      return columns.some((col) => {
        const value = getValue(item, String(col.key));
        return String(value ?? '').toLowerCase().includes(query);
      });
    });
  }, [data, searchQuery, columns, getValue]);

  // Pagination calculations
  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const handlePageSizeChange = useCallback((value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  }, []);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  // Generate page numbers to show
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

  return (
    <>
      <GlassCard padding="none">
        {/* Header */}
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{title}</h2>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {onAdd && (
              <Button onClick={onAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Novo
              </Button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Table */}
        {filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">
              {searchQuery.trim() ? 'Nenhum resultado encontrado' : 'Nenhum registro encontrado'}
            </p>
            <p className="text-sm">
              {searchQuery.trim() ? 'Tente uma busca diferente' : 'Clique em "Novo" para adicionar'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    {columns.map((col) => (
                      <TableHead key={String(col.key)} className="font-semibold">
                        {col.label}
                      </TableHead>
                    ))}
                    {(onEdit || onDelete || renderActions) && (
                      <TableHead className="w-24 text-right">Ações</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((item) => (
                    <TableRowMemo
                      key={item.id}
                      item={item}
                      columns={columns}
                      getValue={getValue}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      setDeleteItem={setDeleteItem}
                      renderActions={renderActions}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
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
          </>
        )}
      </GlassCard>

      {/* Form Dialog */}
      {renderForm && (
        <Dialog open={isFormOpen} onOpenChange={onFormOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Editar' : 'Novo'} {title.slice(0, -1)}</DialogTitle>
              <DialogDescription>
                Preencha os campos abaixo
              </DialogDescription>
            </DialogHeader>
            {renderForm(editingItem ?? null, () => onFormOpenChange?.(false))}
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
