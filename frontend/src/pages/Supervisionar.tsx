import { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageCircle,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Loader2,
  FileText,
  Download,
  Search,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { MainLayout } from "@/components/layout/MainLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  conversationsService,
  usersService,
  Conversation as APIConversation,
  User,
  API_BASE_URL,
  getAuthToken,
} from "@/services/api";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

interface ConversationGroup {
  contactPhone: string;
  contactName: string;
  operatorName: string;
  lastMessage: string;
  lastMessageTime: string;
  isFromContact: boolean;
  messages: APIConversation[];
}

export default function Supervisionar() {
  const [conversations, setConversations] = useState<ConversationGroup[]>([]);
  const [operators, setOperators] = useState<User[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationGroup | null>(null);
  const [selectedOperator, setSelectedOperator] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [operatorSearch, setOperatorSearch] = useState("");

  const { user } = useAuth();

  const loadOperators = useCallback(async () => {
    try {
      const params: any = { role: "operator" };
      if (user?.role === "supervisor" && user.segmentId) {
        params.segment = user.segmentId;
      } // Para supervisor e digital, filtrar por domínio de email
      if (user?.role === "supervisor" || user?.role === "digital") {
        const emailDomain = user.email.split("@")[1];
        if (emailDomain) {
          params.emailDomain = `@${emailDomain}`;
        }
      }
      const data = await usersService.list(params);
      setOperators(data);
    } catch (error) {
      console.error("Error loading operators:", error);
    }
  }, [user]);

  // Ref para evitar loop infinito
  const selectedPhoneRef = useRef<string | null>(null);
  const isFirstLoad = useRef(true);

  // Atualizar ref quando selectedConversation mudar
  useEffect(() => {
    selectedPhoneRef.current = selectedConversation?.contactPhone || null;
  }, [selectedConversation?.contactPhone]);

  const loadConversations = useCallback(async () => {
    try {
      // Só mostrar loading na primeira vez
      if (isFirstLoad.current) {
        setIsLoading(true);
      }

      const data = await conversationsService.getActive();

      // Group conversations by contact phone
      const groupedMap = new Map<string, ConversationGroup>();

      data.forEach((conv) => {
        const existing = groupedMap.get(conv.contactPhone);
        if (existing) {
          existing.messages.push(conv);
          // Update last message if this one is more recent
          const convTime = new Date(conv.datetime).getTime();
          const existingTime = new Date(existing.lastMessageTime).getTime();
          if (convTime > existingTime) {
            existing.lastMessage = conv.message;
            existing.lastMessageTime = conv.datetime;
            existing.isFromContact = conv.sender === "contact";
            existing.operatorName = conv.userName || "Sem operador";
          }
        } else {
          groupedMap.set(conv.contactPhone, {
            contactPhone: conv.contactPhone,
            contactName: conv.contactName,
            operatorName: conv.userName || "Sem operador",
            lastMessage: conv.message,
            lastMessageTime: conv.datetime,
            isFromContact: conv.sender === "contact",
            messages: [conv],
          });
        }
      });

      // Sort messages within each group and groups by last message time
      const groups = Array.from(groupedMap.values())
        .map((group) => ({
          ...group,
          messages: group.messages.sort(
            (a, b) =>
              new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
          ),
        }))
        .sort(
          (a, b) =>
            new Date(b.lastMessageTime).getTime() -
            new Date(a.lastMessageTime).getTime()
        );

      setConversations(groups);

      // Update selected conversation if it exists (usando ref)
      const currentSelectedPhone = selectedPhoneRef.current;
      if (currentSelectedPhone) {
        const updated = groups.find(
          (g) => g.contactPhone === currentSelectedPhone
        );
        if (updated) {
          setSelectedConversation(updated);
        }
      }
    } catch (error) {
      toast({
        title: "Erro ao carregar conversas",
        description:
          error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      isFirstLoad.current = false;
    }
  }, []); // Sem dependências - usa ref

  useEffect(() => {
    loadOperators();
    loadConversations();
  }, [loadOperators, loadConversations]);

  // Set initial selectedOperator based on user role
  useEffect(() => {
    if (user?.role === "supervisor" && operators.length > 0) {
      setSelectedOperator(operators[0].id.toString());
    } else if (user?.role === "digital") {
      setSelectedOperator("all");
    }
  }, [user, operators]);

  // Poll for new messages - intervalo maior para não sobrecarregar
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversations();
    }, 10000); // 10 segundos

    return () => clearInterval(interval);
  }, [loadConversations]);

  const filteredConversations =
    selectedOperator === "all"
      ? conversations
      : conversations.filter((c) => {
          const operator = operators.find(
            (o) => o.id.toString() === selectedOperator
          );
          return operator && c.operatorName === operator.name;
        });

  const filteredOperators = operators.filter((op) =>
    op.name.toLowerCase().includes(operatorSearch.toLowerCase())
  );

  const formatTime = (datetime: string) => {
    try {
      return format(new Date(datetime), "HH:mm");
    } catch {
      return "";
    }
  };

  return (
    <MainLayout>
      <div className="h-[calc(100vh-6rem)] flex gap-4">
        {/* Conversations List */}
        <GlassCard className="w-80 flex flex-col" padding="none">
          {/* Header */}
          <div className="p-4 border-b border-border/50 space-y-3">
            <h2 className="font-semibold text-foreground">Supervisionar</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar operador..."
                value={operatorSearch}
                onChange={(e) => setOperatorSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={selectedOperator}
              onValueChange={setSelectedOperator}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    user?.role === "supervisor"
                      ? "Selecione um Operador"
                      : "Todos os Operadores"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {user?.role !== "supervisor" && (
                  <SelectItem value="all">Todos os Operadores</SelectItem>
                )}
                {filteredOperators.map((op) => (
                  <SelectItem key={op.id} value={op.id.toString()}>
                    {op.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conversations */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <MessageCircle className="h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma conversa ativa</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredConversations.map((conv) => (
                  <button
                    key={conv.contactPhone}
                    onClick={() => setSelectedConversation(conv)}
                    className={cn(
                      "w-full p-3 rounded-xl text-left transition-colors",
                      "hover:bg-primary/5",
                      selectedConversation?.contactPhone ===
                        conv.contactPhone && "bg-primary/10"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-cyan flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-primary-foreground">
                          {conv.contactName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm text-foreground truncate">
                            {conv.contactName}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(conv.lastMessageTime)}
                          </span>
                        </div>
                        <p className="text-xs text-warning truncate">
                          Op: {conv.operatorName}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {conv.isFromContact ? (
                            <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ArrowRight className="h-3 w-3 text-primary" />
                          )}
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.lastMessage}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </GlassCard>

        {/* Chat Area */}
        <GlassCard className="flex-1 flex flex-col" padding="none">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-cyan flex items-center justify-center">
                    <span className="text-sm font-medium text-primary-foreground">
                      {selectedConversation.contactName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {selectedConversation.contactName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedConversation.contactPhone}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(user?.role === "admin" || user?.role === "digital") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          // Fazer download do PDF via API
                          const response = await fetch(
                            `${API_BASE_URL}/conversations/download-pdf/${selectedConversation.contactPhone}`,
                            {
                              method: "GET",
                              headers: {
                                Authorization: `Bearer ${getAuthToken()}`,
                              },
                            }
                          );

                          if (!response.ok) {
                            throw new Error("Erro ao baixar PDF");
                          }

                          // Criar blob do PDF e download
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `conversa-${
                            selectedConversation.contactPhone
                          }-${format(new Date(), "yyyy-MM-dd")}.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);

                          toast({
                            title: "Download iniciado",
                            description: "Conversa baixada com sucesso",
                          });
                        } catch (error) {
                          toast({
                            title: "Erro ao baixar",
                            description:
                              error instanceof Error
                                ? error.message
                                : "Erro ao baixar conversa",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Baixar PDF
                    </Button>
                  )}
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Atendente</p>
                    <p className="text-sm font-medium text-warning">
                      {selectedConversation.operatorName}
                    </p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {selectedConversation.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-2",
                        msg.sender === "contact"
                          ? "justify-start"
                          : "justify-end"
                      )}
                    >
                      {msg.sender === "contact" && (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium">
                            {selectedConversation.contactName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[70%] rounded-2xl px-4 py-2",
                          msg.sender === "contact"
                            ? "bg-card border border-border"
                            : "bg-primary text-primary-foreground"
                        )}
                      >
                        {/* Renderizar mídia baseado no messageType */}
                        {msg.messageType === "image" && msg.mediaUrl ? (
                          <div className="mb-2">
                            <img
                              src={
                                msg.mediaUrl.startsWith("http")
                                  ? msg.mediaUrl
                                  : `${API_BASE_URL}${msg.mediaUrl}`
                              }
                              alt="Imagem"
                              className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ maxHeight: "300px" }}
                              onClick={() =>
                                window.open(
                                  msg.mediaUrl!.startsWith("http")
                                    ? msg.mediaUrl!
                                    : `${API_BASE_URL}${msg.mediaUrl}`,
                                  "_blank"
                                )
                              }
                            />
                            {msg.message &&
                              !msg.message.includes("recebida") && (
                                <p className="text-sm mt-2">{msg.message}</p>
                              )}
                          </div>
                        ) : msg.messageType === "audio" && msg.mediaUrl ? (
                          <div className="mb-2">
                            <audio
                              controls
                              className="max-w-full"
                              src={
                                msg.mediaUrl.startsWith("http")
                                  ? msg.mediaUrl
                                  : `${API_BASE_URL}${msg.mediaUrl}`
                              }
                            >
                              Seu navegador não suporta áudio.
                            </audio>
                          </div>
                        ) : msg.messageType === "video" && msg.mediaUrl ? (
                          <div className="mb-2">
                            <video
                              controls
                              className="max-w-full rounded-lg"
                              style={{ maxHeight: "300px" }}
                              src={
                                msg.mediaUrl.startsWith("http")
                                  ? msg.mediaUrl
                                  : `${API_BASE_URL}${msg.mediaUrl}`
                              }
                            >
                              Seu navegador não suporta vídeo.
                            </video>
                            {msg.message &&
                              !msg.message.includes("recebido") && (
                                <p className="text-sm mt-2">{msg.message}</p>
                              )}
                          </div>
                        ) : msg.messageType === "document" && msg.mediaUrl ? (
                          <div className="mb-2">
                            <a
                              href={
                                msg.mediaUrl.startsWith("http")
                                  ? msg.mediaUrl
                                  : `${API_BASE_URL}${msg.mediaUrl}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm underline hover:no-underline"
                            >
                              <FileText className="h-4 w-4" />
                              {msg.message || "Documento"}
                            </a>
                          </div>
                        ) : (
                          <p className="text-sm">{msg.message}</p>
                        )}
                        <p
                          className={cn(
                            "text-xs mt-1",
                            msg.sender === "contact"
                              ? "text-muted-foreground"
                              : "text-primary-foreground/70"
                          )}
                        >
                          {formatTime(msg.datetime)}
                        </p>
                      </div>
                      {msg.sender === "operator" && (
                        <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-warning">
                            OP
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Read Only Banner */}
              <div className="p-3 bg-warning/10 border-t border-warning/30">
                <div className="flex items-center gap-2 justify-center text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Modo supervisão - Somente leitura
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageCircle className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Selecione uma conversa</p>
              <p className="text-sm">Escolha uma conversa para supervisionar</p>
            </div>
          )}
        </GlassCard>
      </div>
    </MainLayout>
  );
}
