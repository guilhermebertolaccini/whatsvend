import { useState, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { CrudTable, Column } from "@/components/crud/CrudTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  usersService,
  segmentsService,
  linesService,
  type User as ApiUser,
  type Segment,
  type Line,
} from "@/services/api";
import { Loader2, Upload } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "supervisor" | "operador" | "ativador" | "digital";
  segment?: number;
  line?: number;
  lineName?: string;
  lineEvolutionName?: string;
  isOnline: boolean;
  oneToOneActive?: boolean;
  identifier?: "cliente" | "proprietario";
  isActive: boolean;
}

const roleColors = {
  admin: "bg-destructive text-destructive-foreground",
  supervisor: "bg-warning text-warning-foreground",
  operador: "bg-success text-success-foreground",
  ativador: "bg-blue-600 text-white",
  digital: "bg-purple-600 text-white",
};

const roleLabels = {
  admin: "Admin",
  supervisor: "Supervisor",
  operador: "Operador",
  ativador: "Ativador",
  digital: "Digital",
};

// Map API role to frontend role
const mapRole = (
  apiRole: string
): "admin" | "supervisor" | "operador" | "ativador" | "digital" => {
  switch (apiRole) {
    case "admin":
      return "admin";
    case "supervisor":
      return "supervisor";
    case "operator":
      return "operador";
    case "ativador":
      return "ativador";
    case "digital":
      return "digital";
    default:
      return "operador";
  }
};

// Map frontend role to API role
const mapRoleToApi = (
  role: string
): "admin" | "supervisor" | "operator" | "ativador" | "digital" => {
  switch (role) {
    case "admin":
      return "admin";
    case "supervisor":
      return "supervisor";
    case "operador":
      return "operator";
    case "ativador":
      return "ativador";
    case "digital":
      return "digital";
    default:
      return "operator";
  }
};

export default function Usuarios() {
  const [users, setUsers] = useState<User[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "operador",
    segment: "",
    line: "",
    oneToOneActive: false,
    identifier: "proprietario" as "cliente" | "proprietario",
    isActive: true,
  });

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [usersData, segmentsData, linesData] = await Promise.all([
        usersService.list(),
        segmentsService.list(),
        linesService.list(),
      ]);

      setUsers(
        usersData.map((u: ApiUser) => {
          const userLine = linesData.find((l) => l.id === u.line);
          return {
            id: String(u.id),
            name: u.name,
            email: u.email,
            role: mapRole(u.role),
            segment: u.segment ?? undefined,
            line: u.line ?? undefined,
            lineName: userLine?.phone,
            lineEvolutionName: userLine?.evolutionName,
            isOnline: u.status === "Online",
            oneToOneActive: u.oneToOneActive ?? false,
            identifier: (u as any).identifier || "proprietario",
            isActive: (u as any).isActive ?? true,
          };
        })
      );

      setSegments(segmentsData);
      setLines(linesData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar a lista de usuários",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<User>[] = [
    { key: "name", label: "Nome" },
    { key: "email", label: "Email" },
    {
      key: "role",
      label: "Perfil",
      render: (user) => (
        <Badge className={roleColors[user.role]}>{roleLabels[user.role]}</Badge>
      ),
    },
    {
      key: "lineName",
      label: "Linha",
      render: (user) => user.lineName || "-",
    },
    {
      key: "lineEvolutionName",
      label: "Evolution",
      render: (user) => user.lineEvolutionName || "-",
    },
    {
      key: "isOnline",
      label: "Status",
      render: (user) => (
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              user.isOnline ? "bg-success" : "bg-muted-foreground"
            )}
          />
          <span className="text-sm">
            {user.isOnline ? "Online" : "Offline"}
          </span>
        </div>
      ),
    },
    {
      key: "isActive",
      label: "Ativo",
      render: (user) => (
        <Badge className={user.isActive ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>
          {user.isActive ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
  ];

  const handleAdd = () => {
    setEditingUser(null);
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "operador",
      segment: "",
      line: "",
      oneToOneActive: false,
      identifier: "proprietario",
      isActive: true,
    });
    setIsFormOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      segment: user.segment ? String(user.segment) : "",
      line: user.line ? String(user.line) : "",
      oneToOneActive: user.oneToOneActive ?? false,
      identifier: user.identifier || "proprietario",
      isActive: user.isActive,
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (user: User) => {
    try {
      await usersService.delete(Number(user.id));
      setUsers(users.filter((u) => u.id !== user.id));
      toast({
        title: "Usuário removido",
        description: `O usuário ${user.name} foi removido com sucesso`,
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({
        title: "Erro ao remover",
        description: "Não foi possível remover o usuário",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.email) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o nome e email do usuário",
        variant: "destructive",
      });
      return;
    }

    if (!editingUser && !formData.password) {
      toast({
        title: "Senha obrigatória",
        description: "Informe uma senha para o novo usuário",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingUser) {
        const updateData: Parameters<typeof usersService.update>[1] = {
          name: formData.name,
          email: formData.email,
          role: mapRoleToApi(formData.role),
          segment: formData.segment ? Number(formData.segment) : null,
          line: formData.line ? Number(formData.line) : null,
          oneToOneActive: formData.oneToOneActive,
          identifier: formData.identifier,
          isActive: formData.isActive,
        };
        if (formData.password) {
          updateData.password = formData.password;
        }

        const updated = await usersService.update(
          Number(editingUser.id),
          updateData
        );
        setUsers(
          users.map((u) => {
            if (u.id === editingUser.id) {
              const userLine = lines.find((l) => l.id === updated.line);
              return {
                id: String(updated.id),
                name: updated.name,
                email: updated.email,
                role: mapRole(updated.role),
                segment: updated.segment ?? undefined,
                line: updated.line ?? undefined,
                lineName: userLine?.phone,
                lineEvolutionName: userLine?.evolutionName,
                isOnline: updated.status === "Online",
                oneToOneActive: updated.oneToOneActive ?? false,
                identifier: (updated as any).identifier || "proprietario",
                isActive: (updated as any).isActive ?? true,
              };
            }
            return u;
          })
        );
        toast({
          title: "Usuário atualizado",
          description: `O usuário ${updated.name} foi atualizado com sucesso`,
        });
      } else {
        const created = await usersService.create({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: mapRoleToApi(formData.role),
          segment: formData.segment ? Number(formData.segment) : undefined,
          line: formData.line ? Number(formData.line) : undefined,
          oneToOneActive: formData.oneToOneActive,
          identifier: formData.identifier,
          isActive: formData.isActive,
        });
        const newUserLine = lines.find((l) => l.id === created.line);
        setUsers([
          ...users,
          {
            id: String(created.id),
            name: created.name,
            email: created.email,
            role: mapRole(created.role),
            segment: created.segment ?? undefined,
            line: created.line ?? undefined,
            lineName: newUserLine?.phone,
            lineEvolutionName: newUserLine?.evolutionName,
            isOnline: created.status === "Online",
            oneToOneActive: created.oneToOneActive ?? false,
            identifier: (created as any).identifier || "proprietario",
            isActive: (created as any).isActive ?? true,
          },
        ]);
        toast({
          title: "Usuário criado",
          description: `O usuário ${created.name} foi criado com sucesso`,
        });
      }
      setIsFormOpen(false);
    } catch (error) {
      console.error("Error saving user:", error);
      toast({
        title: "Erro ao salvar",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o usuário",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">
          Senha {editingUser && "(deixe em branco para manter)"}
        </Label>
        <Input
          id="password"
          type="password"
          value={formData.password}
          onChange={(e) =>
            setFormData({ ...formData, password: e.target.value })
          }
          placeholder={editingUser ? "••••••••" : ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Perfil</Label>
        <Select
          value={formData.role}
          onValueChange={(value) => setFormData({ ...formData, role: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Administrador</SelectItem>
            <SelectItem value="supervisor">Supervisor</SelectItem>
            <SelectItem value="operador">Operador</SelectItem>
            <SelectItem value="ativador">Ativador</SelectItem>
            <SelectItem value="digital">Digital</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(formData.role === "operador" ||
        formData.role === "supervisor" ||
        formData.role === "digital") && (
          <div className="space-y-2">
            <Label htmlFor="segment">Segmento</Label>
            <Select
              value={formData.segment}
              onValueChange={(value) =>
                setFormData({ ...formData, segment: value })
              }
            >
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
        )}
      <div className="space-y-2">
        <Label htmlFor="line">Linha WhatsApp</Label>
        <Select
          value={formData.line}
          onValueChange={(value) => setFormData({ ...formData, line: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma linha" />
          </SelectTrigger>
          <SelectContent>
            {lines
              .filter((line) => {
                // Filtrar apenas linhas sem vínculo (que não estão atribuídas a nenhum usuário)
                const isLineInUse = users.some((user) => user.line === line.id);
                return !isLineInUse;
              })
              .map((line) => (
                <SelectItem key={line.id} value={String(line.id)}>
                  {line.phone}{" "}
                  {line.oficial ? "(Oficial)" : `(${line.evolutionName})`}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Define qual linha será usada para envio de mensagens (apenas linhas
          sem vínculo)
        </p>
      </div>
      {formData.role === "operador" && (
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">Permissão 1x1</Label>
            <p className="text-sm text-muted-foreground">
              Permitir que este operador inicie conversas 1x1
            </p>
          </div>
          <input
            type="checkbox"
            checked={formData.oneToOneActive}
            onChange={(e) =>
              setFormData({ ...formData, oneToOneActive: e.target.checked })
            }
            className="h-4 w-4 rounded border-gray-300"
          />
        </div>
      )}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label className="text-base font-medium">Usuário Ativo</Label>
          <p className="text-sm text-muted-foreground">
            Define se o usuário está ativado no sistema
          </p>
        </div>
        <input
          type="checkbox"
          checked={formData.isActive}
          onChange={(e) =>
            setFormData({ ...formData, isActive: e.target.checked })
          }
          className="h-4 w-4 rounded border-gray-300"
        />
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => setIsFormOpen(false)}
          disabled={isSaving}
        >
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );

  const handleUploadCSV = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione um arquivo CSV",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const result = await usersService.uploadCSV(file);
      toast({
        title: "Importação concluída",
        description: `${result.message}. ${result.errors.length > 0
          ? `${result.errors.length} erro(s) encontrado(s).`
          : ""
          }`,
        variant: result.errors.length > 0 ? "default" : "success",
      });

      if (result.errors.length > 0) {
        console.warn("Erros na importação:", result.errors);
      }

      // Recarregar lista de usuários
      await loadData();
    } catch (error) {
      console.error("Error uploading CSV:", error);
      toast({
        title: "Erro ao importar",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível importar o arquivo CSV",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Limpar input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

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
          <div className="mb-4 flex justify-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleUploadCSV}
              className="hidden"
              id="csv-upload-users"
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
            title="Usuários"
            subtitle="Gerenciar usuários do sistema"
            columns={columns}
            data={users}
            searchPlaceholder="Buscar usuários..."
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            renderForm={renderForm}
            isFormOpen={isFormOpen}
            onFormOpenChange={setIsFormOpen}
            editingItem={editingUser}
          />
        </div>
      </div>
    </MainLayout>
  );
}
