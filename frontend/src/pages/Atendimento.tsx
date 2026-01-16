import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Send,
  FileText,
  MessageCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Wifi,
  WifiOff,
  Edit,
  UserCheck,
  X,
  Check,
  Phone,
  AlertTriangle,
  RefreshCw,
  Search,
  Download,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { toast } from "@/hooks/use-toast";
import {
  conversationsService,
  tabulationsService,
  contactsService,
  templatesService,
  segmentsService,
  Contact,
  Conversation as APIConversation,
  Tabulation,
  Template,
  getAuthToken,
  API_BASE_URL,
} from "@/services/api";
import {
  useRealtimeConnection,
  useRealtimeSubscription,
} from "@/hooks/useRealtimeConnection";
import { WS_EVENTS, realtimeSocket } from "@/services/websocket";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";

interface ConversationGroup {
  contactPhone: string;
  contactName: string;
  lastMessage: string;
  lastMessageTime: string;
  isFromContact: boolean;
  unread?: boolean;
  messages: APIConversation[];
  isTabulated?: boolean; // Indica se a conversa foi tabulada
}

export default function Atendimento() {
  const { user } = useAuth();
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationGroup | null>(null);
  const [message, setMessage] = useState("");
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationGroup[]>([]);
  const [tabulations, setTabulations] = useState<Tabulation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactCpf, setNewContactCpf] = useState("");
  const [newContactContract, setNewContactContract] = useState("");
  const [newContactMessage, setNewContactMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { playMessageSound, playSuccessSound, playErrorSound } =
    useNotificationSound();
  const { isConnected: isRealtimeConnected } = useRealtimeConnection();

  // Estado para edição de contato
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editContactName, setEditContactName] = useState("");
  const [editContactCpf, setEditContactCpf] = useState("");
  const [editContactContract, setEditContactContract] = useState("");
  const [editContactIsCPC, setEditContactIsCPC] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const previousConversationsRef = useRef<ConversationGroup[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);

  // Estado para filtro de conversas
  type FilterType = "todas" | "stand-by" | "atendimento" | "finalizadas";
  const [conversationFilter, setConversationFilter] =
    useState<FilterType>("todas");

  // Estado para pesquisa de tabulação
  const [tabulationSearch, setTabulationSearch] = useState("");

  // Estado para notificação de linha banida
  const [lineBannedNotification, setLineBannedNotification] = useState<{
    bannedLinePhone: string;
    newLinePhone: string | null;
    contactsToRecall: Array<{ phone: string; name: string }>;
    message: string;
  } | null>(null);
  const [isRecallingContact, setIsRecallingContact] = useState<string | null>(
    null
  );

  // Estado para modo teste administrador (apenas admins)
  const [isAdminTestMode, setIsAdminTestMode] = useState(false);

  // Estado para templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null
  );
  const [templateVariables, setTemplateVariables] = useState<
    Record<string, string>
  >({});
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [segmentAllowsFreeMessage, setSegmentAllowsFreeMessage] =
    useState<boolean>(true); // Default true para não bloquear
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to new messages in real-time
  useRealtimeSubscription(
    WS_EVENTS.NEW_MESSAGE,
    (data: any) => {
      console.log("[Atendimento] New message received:", data);

      if (data.message) {
        const newMsg = data.message as APIConversation;

        // Play sound for incoming messages
        if (newMsg.sender === "contact") {
          playMessageSound();
        }

        setConversations((prev) => {
          const existing = prev.find(
            (c) => c.contactPhone === newMsg.contactPhone
          );

          if (existing) {
            // Add message to existing conversation
            const updated = prev.map((conv) => {
              if (conv.contactPhone === newMsg.contactPhone) {
                return {
                  ...conv,
                  messages: [...conv.messages, newMsg].sort(
                    (a, b) =>
                      new Date(a.datetime).getTime() -
                      new Date(b.datetime).getTime()
                  ),
                  lastMessage: newMsg.message,
                  lastMessageTime: newMsg.datetime,
                  isFromContact: newMsg.sender === "contact",
                };
              }
              return conv;
            });
            return updated.sort(
              (a, b) =>
                new Date(b.lastMessageTime).getTime() -
                new Date(a.lastMessageTime).getTime()
            );
          } else {
            // Create new conversation group
            const newGroup: ConversationGroup = {
              contactPhone: newMsg.contactPhone,
              contactName: newMsg.contactName,
              lastMessage: newMsg.message,
              lastMessageTime: newMsg.datetime,
              isFromContact: newMsg.sender === "contact",
              messages: [newMsg],
              unread: true,
            };
            return [newGroup, ...prev];
          }
        });

        // Update selected conversation if it's the same contact (usando ref)
        if (selectedPhoneRef.current === newMsg.contactPhone) {
          setSelectedConversation((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              messages: [...prev.messages, newMsg].sort(
                (a, b) =>
                  new Date(a.datetime).getTime() -
                  new Date(b.datetime).getTime()
              ),
              lastMessage: newMsg.message,
              lastMessageTime: newMsg.datetime,
              isFromContact: newMsg.sender === "contact",
            };
          });
        }
      }
    },
    [playMessageSound]
  ); // Removido selectedConversation da dependência

  // Subscribe to message sent confirmation
  useRealtimeSubscription(
    "message-sent",
    (data: any) => {
      console.log("[Atendimento] Message sent confirmation:", data);
      if (data?.message) {
        // Adicionar mensagem à conversa ativa
        const newMsg = data.message as APIConversation;

        // Resetar loading de envio de mensagem
        setIsSending(false);

        // Mostrar toast de sucesso
        playSuccessSound();
        toast({
          title: "Mensagem enviada",
          description: "Sua mensagem foi enviada com sucesso",
        });

        // Se estava criando nova conversa, resetar loading
        // O modal já foi fechado anteriormente, apenas resetar o estado
        setIsCreatingConversation(false);

        setConversations((prev) => {
          const existing = prev.find(
            (c) => c.contactPhone === newMsg.contactPhone
          );

          if (existing) {
            return prev
              .map((conv) => {
                if (conv.contactPhone === newMsg.contactPhone) {
                  return {
                    ...conv,
                    messages: [...conv.messages, newMsg].sort(
                      (a, b) =>
                        new Date(a.datetime).getTime() -
                        new Date(b.datetime).getTime()
                    ),
                    lastMessage: newMsg.message,
                    lastMessageTime: newMsg.datetime,
                    isFromContact: false,
                  };
                }
                return conv;
              })
              .sort(
                (a, b) =>
                  new Date(b.lastMessageTime).getTime() -
                  new Date(a.lastMessageTime).getTime()
              );
          } else {
            // Nova conversa criada
            const newGroup: ConversationGroup = {
              contactPhone: newMsg.contactPhone,
              contactName: newMsg.contactName,
              lastMessage: newMsg.message,
              lastMessageTime: newMsg.datetime,
              isFromContact: false,
              messages: [newMsg],
            };
            return [newGroup, ...prev];
          }
        });

        // Atualizar conversa selecionada se for a mesma (usando ref)
        if (selectedPhoneRef.current === newMsg.contactPhone) {
          setSelectedConversation((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              messages: [...prev.messages, newMsg].sort(
                (a, b) =>
                  new Date(a.datetime).getTime() -
                  new Date(b.datetime).getTime()
              ),
              lastMessage: newMsg.message,
              lastMessageTime: newMsg.datetime,
            };
          });
        }
      }
    },
    [playSuccessSound, isNewConversationOpen]
  ); // Adicionar dependências

  // Subscribe to message errors (bloqueios CPC, repescagem, etc)
  useRealtimeSubscription(
    "message-error",
    (data: any) => {
      console.log("[Atendimento] Message error received:", data);
      if (data?.error) {
        playErrorSound();

        // Resetar loading de envio de mensagem
        setIsSending(false);

        // Resetar loading de criação de conversa
        setIsCreatingConversation(false);

        // Determinar título baseado no tipo de erro
        let title = "Mensagem bloqueada";
        if (data.error.includes("CPC")) {
          title = "Bloqueio de CPC";
        } else if (data.error.includes("alocação de linha")) {
          title = "Aguarde alocação";
        } else if (
          data.error.includes("repescagem") ||
          (data.error.includes("Aguarde") && !data.error.includes("alocação"))
        ) {
          title = "Bloqueio de Repescagem";
        } else if (data.error.includes("permissão")) {
          title = "Sem permissão";
        }

        toast({
          title,
          description: data.error,
          variant: "destructive",
          duration: data.hoursRemaining ? 8000 : 5000, // Mostrar por mais tempo se tiver horas restantes
        });
      }
    },
    [playErrorSound]
  );

  const scrollToBottom = () => {
    if (messagesScrollRef.current) {
      const scrollContainer = messagesScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  // Ref para armazenar o contactPhone selecionado (evita loop infinito)
  const selectedPhoneRef = useRef<string | null>(null);

  // Atualizar ref quando selectedConversation mudar
  useEffect(() => {
    selectedPhoneRef.current = selectedConversation?.contactPhone || null;
  }, [selectedConversation?.contactPhone]);

  const loadConversations = useCallback(async () => {
    try {
      // Carregar tanto conversas ativas quanto tabuladas para ter todos os dados
      const [activeData, tabulatedData] = await Promise.all([
        conversationsService.getActive(),
        conversationsService.getTabulated().catch(() => []), // Se falhar, retorna array vazio
      ]);

      // Combinar todos os dados
      const allData = [...activeData, ...tabulatedData];

      // Group conversations by contact phone
      const groupedMap = new Map<string, ConversationGroup>();

      allData.forEach((conv) => {
        const existing = groupedMap.get(conv.contactPhone);
        const isTabulated =
          conv.tabulation !== null && conv.tabulation !== undefined;

        if (existing) {
          existing.messages.push(conv);
          // Update last message if this one is more recent
          const convTime = new Date(conv.datetime).getTime();
          const existingTime = new Date(existing.lastMessageTime).getTime();
          if (convTime > existingTime) {
            existing.lastMessage = conv.message;
            existing.lastMessageTime = conv.datetime;
            existing.isFromContact = conv.sender === "contact";
            existing.isTabulated = isTabulated;
          }
          // Se qualquer mensagem for tabulada, a conversa é tabulada
          if (isTabulated) {
            existing.isTabulated = true;
          }
        } else {
          groupedMap.set(conv.contactPhone, {
            contactPhone: conv.contactPhone,
            contactName: conv.contactName,
            lastMessage: conv.message,
            lastMessageTime: conv.datetime,
            isFromContact: conv.sender === "contact",
            isTabulated: isTabulated,
            messages: [conv],
          });
        }
      });

      // Sort messages within each group and groups by last message time
      let groups = Array.from(groupedMap.values())
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

      // Aplicar filtro com regras de 6 horas
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

      if (conversationFilter !== "todas") {
        groups = groups.filter((group) => {
          const lastMsgTime = new Date(group.lastMessageTime);

          if (conversationFilter === "finalizadas") {
            // Finalizadas: apenas tabuladas nas últimas 6 horas
            return group.isTabulated === true && lastMsgTime >= sixHoursAgo;
          }
          // Para stand-by e atendimento, só mostrar não tabuladas
          if (group.isTabulated === true) {
            return false;
          }
          if (conversationFilter === "stand-by") {
            // Stand By: SEM resposta do cliente há mais de 6 horas
            return group.isFromContact === false && lastMsgTime < sixHoursAgo;
          }
          if (conversationFilter === "atendimento") {
            // Atendimento: TODAS as conversas ativas que não estão em stand-by
            // Mostra se: cliente respondeu OU operador enviou há menos de 6h
            return group.isFromContact === true || lastMsgTime >= sixHoursAgo;
          }
          return true;
        });
      }

      setConversations(groups);

      // Update selected conversation if it exists (usando ref para evitar loop)
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
      console.error("Error loading conversations:", error);
    } finally {
      setIsLoading(false);
    }
  }, [conversationFilter]); // Adicionar conversationFilter como dependência

  // Subscribe to line reallocation (depois de loadConversations estar definido)
  useRealtimeSubscription(
    "line-reallocated",
    (data: any) => {
      console.log("[Atendimento] Line reallocated:", data);
      if (data?.newLinePhone) {
        playSuccessSound();
        toast({
          title: "Linha realocada",
          description:
            data.message ||
            `Nova linha ${data.newLinePhone} foi atribuída automaticamente.`,
          duration: 8000,
        });

        // Recarregar conversas para atualizar com a nova linha
        setTimeout(() => {
          loadConversations();
        }, 1000);
      }
    },
    [playSuccessSound, loadConversations]
  );

  const loadTabulations = useCallback(async () => {
    try {
      const data = await tabulationsService.list();
      setTabulations(data);
    } catch (error) {
      console.error("Error loading tabulations:", error);
    }
  }, []);

  // Carregar dados do contato para edição
  const openEditContact = useCallback(async () => {
    if (!selectedConversation) return;

    try {
      const contact = await contactsService.getByPhone(
        selectedConversation.contactPhone
      );
      if (contact) {
        setEditingContact(contact);
        setEditContactName(contact.name);
        setEditContactCpf(contact.cpf || "");
        setEditContactContract(contact.contract || "");
        setEditContactIsCPC(contact.isCPC || false);
        setIsEditContactOpen(true);
      } else {
        // Contato não existe, criar com dados básicos
        setEditingContact(null);
        setEditContactName(selectedConversation.contactName);
        setEditContactCpf("");
        setEditContactContract("");
        setEditContactIsCPC(false);
        setIsEditContactOpen(true);
      }
    } catch (error) {
      console.error("Error loading contact:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados do contato",
        variant: "destructive",
      });
    }
  }, [selectedConversation]);

  // Salvar alterações do contato
  const handleSaveContact = useCallback(async () => {
    if (!selectedConversation) return;

    setIsSavingContact(true);
    try {
      const updateData = {
        name: editContactName.trim(),
        cpf: editContactCpf.trim() || undefined,
        contract: editContactContract.trim() || undefined,
        isCPC: editContactIsCPC,
      };

      if (editingContact) {
        await contactsService.updateByPhone(
          selectedConversation.contactPhone,
          updateData
        );
      } else {
        // Criar contato se não existir
        await contactsService.create({
          name: editContactName.trim(),
          phone: selectedConversation.contactPhone,
          cpf: editContactCpf.trim() || undefined,
          contract: editContactContract.trim() || undefined,
          isCPC: editContactIsCPC,
          segment: user?.segmentId,
        });
      }

      // Atualizar nome na conversa selecionada
      if (editContactName.trim() !== selectedConversation.contactName) {
        setSelectedConversation((prev) =>
          prev
            ? {
              ...prev,
              contactName: editContactName.trim(),
            }
            : null
        );

        // Atualizar na lista de conversas
        setConversations((prev) =>
          prev.map((c) =>
            c.contactPhone === selectedConversation.contactPhone
              ? { ...c, contactName: editContactName.trim() }
              : c
          )
        );
      }

      playSuccessSound();
      toast({
        title: "Contato atualizado",
        description: editContactIsCPC
          ? "Contato marcado como CPC"
          : "Dados salvos com sucesso",
      });
      setIsEditContactOpen(false);
    } catch (error) {
      playErrorSound();
      toast({
        title: "Erro ao salvar",
        description:
          error instanceof Error ? error.message : "Erro ao salvar contato",
        variant: "destructive",
      });
    } finally {
      setIsSavingContact(false);
    }
  }, [
    selectedConversation,
    editingContact,
    editContactName,
    editContactCpf,
    editContactContract,
    editContactIsCPC,
    user,
    playSuccessSound,
    playErrorSound,
  ]);

  // Carregar templates e informações do segmento
  const loadTemplates = useCallback(async () => {
    try {
      setIsLoadingTemplates(true);
      const data = await templatesService.list({ segmentId: user?.segmentId });
      setTemplates(data);

      // Carregar informações do segmento para verificar allowsFreeMessage
      if (user?.segmentId) {
        try {
          const segment = await segmentsService.getById(user.segmentId);
          setSegmentAllowsFreeMessage(segment.allowsFreeMessage ?? true);
        } catch (error) {
          console.error("Error loading segment info:", error);
          // Se não conseguir carregar, assume true (permite mensagens livres)
          setSegmentAllowsFreeMessage(true);
        }
      } else {
        setSegmentAllowsFreeMessage(true);
      }
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [user?.segmentId]);

  useEffect(() => {
    loadConversations();
    loadTabulations();
    loadTemplates();
  }, [loadConversations, loadTabulations, loadTemplates]);

  // Detectar desconexão do WebSocket e sugerir atualização
  useEffect(() => {
    if (!isRealtimeConnected) {
      // Mostrar toast informando sobre desconexão após 5 segundos
      const timeout = setTimeout(() => {
        toast({
          title: "Conexão perdida",
          description:
            "A conexão com o servidor foi perdida. Atualize a página para reconectar.",
          variant: "destructive",
          duration: 10000,
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Atualizar
            </Button>
          ),
        });
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [isRealtimeConnected]);

  // Poll for new messages only if WebSocket not connected
  useEffect(() => {
    if (isRealtimeConnected) {
      console.log("[Atendimento] WebSocket connected, polling disabled");
      return;
    }

    console.log(
      "[Atendimento] WebSocket not connected, using polling fallback"
    );
    const interval = setInterval(() => {
      loadConversations();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadConversations, isRealtimeConnected]);

  useEffect(() => {
    scrollToBottom();
  }, [selectedConversation?.messages]);

  // Scroll para o final quando selecionar uma conversa
  useEffect(() => {
    if (selectedConversation) {
      // Pequeno delay para garantir que o DOM foi atualizado
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [selectedConversation?.contactPhone]);

  // Função para determinar o tipo de mídia baseado no mimetype
  const getMessageTypeFromMime = (
    mimeType: string
  ): "image" | "video" | "audio" | "document" => {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    return "document";
  };

  // Função para fazer upload de arquivo
  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!selectedConversation || isUploadingFile) return;

      // Validações de arquivo
      const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
      const ALLOWED_TYPES = [
        // Imagens
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/bmp",
        "image/tiff",
        "image/svg+xml",
        "image/heic",
        "image/heif",
        // Vídeos
        "video/mp4",
        "video/mpeg",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-ms-wmv",
        "video/webm",
        "video/3gpp",
        "video/x-flv",
        "video/x-matroska",
        // Áudios
        "audio/mpeg",
        "audio/ogg",
        "audio/mp4",
        "audio/wav",
        "audio/x-wav",
        "audio/webm",
        "audio/aac",
        "audio/flac",
        "audio/x-m4a",
        // Documentos
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/rtf",
        "application/vnd.oasis.opendocument.text",
        "application/vnd.oasis.opendocument.spreadsheet",
        "application/vnd.oasis.opendocument.presentation",
        // Texto
        "text/plain",
        "text/csv",
        "text/html",
        "text/xml",
        "application/json",
        // Compactados
        "application/zip",
        "application/x-rar-compressed",
        "application/x-7z-compressed",
        "application/gzip",
        "application/x-tar",
      ];

      // Validar tamanho
      if (file.size > MAX_FILE_SIZE) {
        playErrorSound();
        toast({
          title: "Arquivo muito grande",
          description: `O arquivo não pode ser maior que ${Math.round(
            MAX_FILE_SIZE / 1024 / 1024
          )}MB. Tamanho atual: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
          variant: "destructive",
        });
        return;
      }

      // Validar tipo
      if (!ALLOWED_TYPES.includes(file.type)) {
        playErrorSound();
        toast({
          title: "Tipo de arquivo não permitido",
          description: `Tipos permitidos: Imagens, Vídeos, Áudios, PDF, Word, Excel, PowerPoint, TXT, CSV`,
          variant: "destructive",
        });
        return;
      }

      setIsUploadingFile(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const token = getAuthToken();
        if (!token) {
          throw new Error("Não autenticado");
        }

        const response = await fetch(`${API_BASE_URL}/media/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Erro ao fazer upload do arquivo");
        }

        const data = await response.json();
        const messageType = getMessageTypeFromMime(data.mimeType);
        const mediaUrl = data.mediaUrl.startsWith("http")
          ? data.mediaUrl
          : `${API_BASE_URL}${data.mediaUrl}`;

        // Enviar mensagem com mídia via WebSocket
        if (isRealtimeConnected) {
          realtimeSocket.send("send-message", {
            contactPhone: selectedConversation.contactPhone,
            message:
              message.trim() ||
              (messageType === "image"
                ? "Imagem enviada"
                : messageType === "video"
                  ? "Vídeo enviado"
                  : messageType === "audio"
                    ? "Áudio enviado"
                    : "Documento enviado"),
            messageType,
            mediaUrl,
            fileName: data.originalName || data.fileName, // Incluir nome do arquivo para documentos
            isAdminTest: isAdminTestMode && user?.role === "admin",
          });
        } else {
          // Fallback: salvar via REST API
          await conversationsService.create({
            contactName: selectedConversation.contactName,
            contactPhone: selectedConversation.contactPhone,
            message:
              message.trim() ||
              (messageType === "image"
                ? "Imagem enviada"
                : messageType === "video"
                  ? "Vídeo enviado"
                  : messageType === "audio"
                    ? "Áudio enviado"
                    : "Documento enviado"),
            sender: "operator",
            messageType,
            mediaUrl,
            userName: user?.name,
            userLine: user?.lineId,
            segment: user?.segmentId,
          });
        }

        setMessage(""); // Limpar input
        // NÃO mostrar toast de sucesso aqui - aguardar confirmação via WebSocket (event 'message-sent')
        // Isso garante que a mensagem realmente foi processada e aparece no chat
      } catch (error) {
        console.error("Erro ao fazer upload:", error);
        playErrorSound();
        toast({
          title: "Erro ao enviar arquivo",
          description:
            error instanceof Error ? error.message : "Erro desconhecido",
          variant: "destructive",
        });
      } finally {
        setIsUploadingFile(false);
        // Limpar input de arquivo
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [
      selectedConversation,
      isUploadingFile,
      isRealtimeConnected,
      message,
      user,
      playErrorSound,
    ]
  );

  // Handler para seleção de arquivo
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const handleSendMessage = useCallback(async () => {
    // Prevenir múltiplos cliques
    if (!message.trim() || !selectedConversation || isSending) {
      return;
    }

    setIsSending(true);
    const messageText = message.trim();
    setMessage(""); // Limpar input imediatamente para UX

    try {
      // Usar WebSocket para enviar mensagem via WhatsApp (se conectado)
      if (isRealtimeConnected) {
        console.log("[Atendimento] Enviando mensagem via WebSocket...", {
          isAdminTestMode,
        });
        realtimeSocket.send("send-message", {
          contactPhone: selectedConversation.contactPhone,
          message: messageText,
          messageType: "text",
          isAdminTest: isAdminTestMode && user?.role === "admin",
        });

        // A resposta virá via evento 'message-sent' (sucesso) ou 'message-error' (erro)
        // O isSending será resetado quando receber a confirmação, não aqui no finally
        // Não mostrar sucesso imediatamente - aguardar confirmação
      } else {
        // Fallback: Usar REST API (apenas salva no banco, não envia via WhatsApp)
        console.log(
          "[Atendimento] WebSocket não conectado, salvando via REST..."
        );
        await conversationsService.create({
          contactName: selectedConversation.contactName,
          contactPhone: selectedConversation.contactPhone,
          message: messageText,
          sender: "operator",
          messageType: "text",
          userName: user?.name,
          userLine: user?.lineId,
          segment: user?.segmentId,
        });

        playSuccessSound();
        toast({
          title: "Mensagem salva",
          description: "Mensagem salva (WebSocket desconectado)",
          variant: "default",
        });

        await loadConversations();
        setIsSending(false); // Resetar apenas no fallback (REST API)
      }
    } catch (error) {
      setMessage(messageText); // Restaurar mensagem se falhou
      setIsSending(false); // Resetar em caso de erro
      playErrorSound();
      toast({
        title: "Erro ao enviar",
        description:
          error instanceof Error ? error.message : "Erro ao enviar mensagem",
        variant: "destructive",
      });
    }
    // Não usar finally para WebSocket - o reset será feito via eventos
  }, [
    message,
    selectedConversation,
    isSending,
    user,
    isRealtimeConnected,
    isAdminTestMode,
    playSuccessSound,
    playErrorSound,
    loadConversations,
  ]);

  const handleTabulate = useCallback(
    async (tabulationId: number) => {
      if (!selectedConversation) return;

      try {
        await conversationsService.tabulate(
          selectedConversation.contactPhone,
          tabulationId
        );
        playSuccessSound();
        toast({
          title: "Conversa tabulada",
          description: "A conversa foi tabulada com sucesso",
        });

        // Remove from active conversations
        setConversations((prev) =>
          prev.filter(
            (c) => c.contactPhone !== selectedConversation.contactPhone
          )
        );
        setSelectedConversation(null);
      } catch (error) {
        playErrorSound();
        toast({
          title: "Erro ao tabular",
          description:
            error instanceof Error ? error.message : "Erro ao tabular conversa",
          variant: "destructive",
        });
      }
    },
    [selectedConversation, playSuccessSound, playErrorSound]
  );

  const handleNewConversation = useCallback(async () => {
    // Prevenir múltiplos cliques
    if (isCreatingConversation) {
      return;
    }

    if (!newContactName.trim() || !newContactPhone.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome e telefone são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    // Se estiver usando template, verificar variáveis
    if (selectedTemplate) {
      const requiredVars = selectedTemplate.variables || [];
      const missingVars = requiredVars.filter(
        (v) => !templateVariables[v]?.trim()
      );
      if (missingVars.length > 0) {
        toast({
          title: "Variáveis obrigatórias",
          description: `Preencha: ${missingVars.join(", ")}`,
          variant: "destructive",
        });
        return;
      }
    } else {
      // Se não permite mensagem livre e não está usando template, bloquear
      if (!segmentAllowsFreeMessage) {
        toast({
          title: "Template obrigatório",
          description:
            "Este segmento não permite mensagens livres. Selecione um template para enviar a primeira mensagem.",
          variant: "destructive",
        });
        return;
      }
      // Se permite mensagem livre, verificar se há mensagem
      if (!newContactMessage.trim()) {
        toast({
          title: "Mensagem obrigatória",
          description:
            "Digite a mensagem que deseja enviar ou selecione um template",
          variant: "destructive",
        });
        return;
      }
    }

    setIsCreatingConversation(true);

    // Salvar valores antes de limpar
    const contactNameValue = newContactName.trim();
    const contactPhoneValue = newContactPhone.trim();
    const contactCpfValue = newContactCpf.trim();
    const contactContractValue = newContactContract.trim();
    const contactMessageValue = newContactMessage.trim();
    const selectedTemplateValue = selectedTemplate;
    const templateVariablesValue = { ...templateVariables };

    // Fechar modal imediatamente e limpar campos
    setIsNewConversationOpen(false);
    setNewContactName("");
    setNewContactPhone("");
    setNewContactCpf("");
    setNewContactContract("");
    setNewContactMessage("");
    setSelectedTemplate(null);
    setTemplateVariables({});

    // Mostrar toast de "Enviando mensagem..."
    toast({
      title: "Enviando mensagem...",
      description: "Aguarde a confirmação de envio",
    });

    try {
      // Primeiro, criar ou atualizar o contato (se já existir, apenas ignorar erro)
      try {
        await contactsService.create({
          name: contactNameValue,
          phone: contactPhoneValue,
          cpf: contactCpfValue || undefined,
          contract: contactContractValue || undefined,
          segment: user.segmentId,
        });
      } catch (error) {
        // Contato pode já existir (erro 500), ignorar erro para não bloquear envio da mensagem
        console.warn("Contato possivelmente já existe, continuando com envio...", error);
      }

      // Usar WebSocket para enviar a mensagem escrita pelo operador
      if (isRealtimeConnected) {
        console.log("[Atendimento] Criando nova conversa via WebSocket...");

        if (selectedTemplateValue) {
          // Enviar template com variáveis
          const variables = (selectedTemplateValue.variables || []).map(
            (v) => ({
              key: v,
              value: templateVariablesValue[v] || "",
            })
          );

          realtimeSocket.send("send-message", {
            contactPhone: contactPhoneValue,
            templateId: selectedTemplateValue.id,
            templateVariables: variables,
            isNewConversation: true,
            isAdminTest: isAdminTestMode && user?.role === "admin",
          });
        } else {
          // Enviar mensagem normal
          realtimeSocket.send("send-message", {
            contactPhone: contactPhoneValue,
            message: contactMessageValue,
            messageType: "text",
            isNewConversation: true, // Indica que é 1x1 para verificar permissão
            isAdminTest: isAdminTestMode && user?.role === "admin",
          });
        }

        // O sucesso/erro será mostrado quando receber 'message-sent' ou 'message-error'
      } else {
        // Fallback: Apenas salvar no banco
        await conversationsService.create({
          contactName: contactNameValue,
          contactPhone: contactPhoneValue,
          message: `Olá ${contactNameValue}, tudo bem?`,
          sender: "operator",
          messageType: "text",
          userName: user.name,
          userLine: user.lineId,
          segment: user.segmentId,
        });

        playSuccessSound();
        toast({
          title: "Conversa salva",
          description: "Salvo no sistema (WhatsApp não enviado - offline)",
          variant: "default",
        });

        await loadConversations();
        setIsCreatingConversation(false);
      }
      // Se usar WebSocket, o isCreatingConversation será resetado quando receber 'message-sent' ou 'message-error'
      // Não resetar aqui no finally para não interferir com o fluxo do WebSocket
    } catch (error) {
      // Erro ao criar contato ou enviar (fallback REST)
      setIsCreatingConversation(false);
      playErrorSound();
      toast({
        title: "Erro ao criar conversa",
        description:
          error instanceof Error ? error.message : "Erro ao criar conversa",
        variant: "destructive",
      });
    }
  }, [
    newContactName,
    newContactPhone,
    newContactCpf,
    newContactContract,
    newContactMessage,
    user,
    isRealtimeConnected,
    playSuccessSound,
    playErrorSound,
    loadConversations,
    selectedTemplate,
    templateVariables,
    isCreatingConversation,
    segmentAllowsFreeMessage,
  ]);

  // Quando selecionar template no modal, preencher nome automaticamente
  useEffect(() => {
    if (selectedTemplate && newContactName.trim()) {
      const vars = selectedTemplate.variables || [];
      const newVars: Record<string, string> = {};

      vars.forEach((v) => {
        if (v.toLowerCase() === "nome" && newContactName.trim()) {
          newVars[v] = newContactName.trim();
        } else {
          newVars[v] = templateVariables[v] || "";
        }
      });

      setTemplateVariables(newVars);
    }
  }, [selectedTemplate, newContactName]);

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
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-foreground">Atendimentos</h2>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${isRealtimeConnected
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                          }`}
                      >
                        {isRealtimeConnected ? (
                          <Wifi className="h-3 w-3" />
                        ) : (
                          <WifiOff className="h-3 w-3" />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isRealtimeConnected
                        ? "Conectado em tempo real"
                        : "WebSocket desconectado - Atualize a página"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.reload()}
                className="h-8 w-8 p-0"
                title="Atualizar página"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Dialog
                open={isNewConversationOpen}
                onOpenChange={(open) => {
                  if (!isCreatingConversation) {
                    setIsNewConversationOpen(open);
                    if (!open) {
                      // Limpar estados ao fechar
                      setIsCreatingConversation(false);
                      setSelectedTemplate(null);
                      setTemplateVariables({});
                    }
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button size="icon" className="h-8 w-8">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova Conversa</DialogTitle>
                    <DialogDescription>
                      Inicie uma nova conversa com um contato
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome *</Label>
                      <Input
                        id="name"
                        placeholder="Nome do contato"
                        value={newContactName}
                        onChange={(e) => setNewContactName(e.target.value)}
                        disabled={isCreatingConversation}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone *</Label>
                      <Input
                        id="phone"
                        placeholder="+55 11 99999-9999"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(e.target.value)}
                        disabled={isCreatingConversation}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cpf">CPF</Label>
                      <Input
                        id="cpf"
                        placeholder="000.000.000-00"
                        value={newContactCpf}
                        onChange={(e) => setNewContactCpf(e.target.value)}
                        disabled={isCreatingConversation}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contract">Contrato</Label>
                      <Input
                        id="contract"
                        placeholder="Número do contrato"
                        value={newContactContract}
                        onChange={(e) => setNewContactContract(e.target.value)}
                        disabled={isCreatingConversation}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="template">Template (opcional)</Label>
                      <Select
                        value={selectedTemplate?.id.toString() || undefined}
                        onValueChange={(value) => {
                          if (value === "none") {
                            setSelectedTemplate(null);
                            setTemplateVariables({});
                            setNewContactMessage("");
                          } else {
                            const template = templates.find(
                              (t) => t.id.toString() === value
                            );
                            setSelectedTemplate(template || null);
                            setNewContactMessage(""); // Limpar mensagem quando selecionar template
                          }
                        }}
                        disabled={isLoadingTemplates || isCreatingConversation}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              isLoadingTemplates
                                ? "Carregando..."
                                : "Selecione um template (opcional)"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Mensagem normal</SelectItem>
                          {templates.map((template) => (
                            <SelectItem
                              key={template.id}
                              value={template.id.toString()}
                            >
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Campos de Variáveis do Template */}
                    {selectedTemplate &&
                      selectedTemplate.variables &&
                      selectedTemplate.variables.length > 0 && (
                        <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
                          <Label className="text-sm font-medium">
                            Preencha as variáveis:
                          </Label>
                          {selectedTemplate.variables.map((varName) => (
                            <div key={varName} className="space-y-1">
                              <Label
                                htmlFor={`new-var-${varName}`}
                                className="text-xs"
                              >
                                {varName}:
                              </Label>
                              <Input
                                id={`new-var-${varName}`}
                                placeholder={`Valor para ${varName}`}
                                value={templateVariables[varName] || ""}
                                onChange={(e) =>
                                  setTemplateVariables((prev) => ({
                                    ...prev,
                                    [varName]: e.target.value,
                                  }))
                                }
                                className="h-8"
                                disabled={isCreatingConversation}
                              />
                            </div>
                          ))}
                          <p className="text-xs text-muted-foreground mt-2">
                            Preview:{" "}
                            {selectedTemplate.bodyText.replace(
                              /\{\{(\w+)\}\}/g,
                              (match, varName) => {
                                return templateVariables[varName] || match;
                              }
                            )}
                          </p>
                        </div>
                      )}

                    {/* Input de Mensagem - Habilitado apenas se o segmento permitir mensagens livres */}
                    {!selectedTemplate && segmentAllowsFreeMessage && (
                      <div className="space-y-2">
                        <Label htmlFor="message">Mensagem *</Label>
                        <Input
                          id="message"
                          placeholder="Digite sua mensagem..."
                          value={newContactMessage}
                          onChange={(e) => setNewContactMessage(e.target.value)}
                          disabled={isCreatingConversation}
                        />
                      </div>
                    )}
                    {!selectedTemplate && !segmentAllowsFreeMessage && (
                      <div className="space-y-2">
                        <Label htmlFor="message">Mensagem</Label>
                        <Input
                          id="message"
                          placeholder="Selecione um template para enviar a primeira mensagem"
                          value={newContactMessage}
                          onChange={(e) => setNewContactMessage(e.target.value)}
                          disabled={true}
                        />
                        <p className="text-xs text-muted-foreground">
                          Este segmento não permite mensagens livres. Selecione
                          um template para enviar a primeira mensagem.
                        </p>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsNewConversationOpen(false);
                        setSelectedTemplate(null);
                        setTemplateVariables({});
                        setIsCreatingConversation(false);
                      }}
                      disabled={isCreatingConversation}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleNewConversation}
                      disabled={
                        isCreatingConversation ||
                        (!selectedTemplate &&
                          (!segmentAllowsFreeMessage ||
                            !newContactMessage.trim()))
                      }
                    >
                      {isCreatingConversation ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enviando...
                        </>
                      ) : selectedTemplate ? (
                        "Enviar Template"
                      ) : segmentAllowsFreeMessage ? (
                        "Enviar Mensagem"
                      ) : (
                        "Selecione um Template"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Botões de Filtro */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={conversationFilter === "todas" ? "default" : "outline"}
                size="sm"
                onClick={() => setConversationFilter("todas")}
              >
                Todas
              </Button>
              <Button
                variant={
                  conversationFilter === "atendimento" ? "default" : "outline"
                }
                size="sm"
                onClick={() => setConversationFilter("atendimento")}
              >
                Atendimento
              </Button>
              <Button
                variant={
                  conversationFilter === "stand-by" ? "default" : "outline"
                }
                size="sm"
                onClick={() => setConversationFilter("stand-by")}
              >
                Stand By
              </Button>
              <Button
                variant={
                  conversationFilter === "finalizadas" ? "default" : "outline"
                }
                size="sm"
                onClick={() => setConversationFilter("finalizadas")}
              >
                Finalizadas
              </Button>
            </div>
          </div>

          {/* Conversations */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <MessageCircle className="h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma conversa ativa</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {conversations.map((conv) => (
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
                      {conv.unread && (
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                      )}
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={openEditContact}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Editar Contato</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-2">
                  {user?.role === "admin" ||
                    (user?.role === "digital" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                if (!selectedConversation) return;
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
                                  a.download = `conversa-${selectedConversation.contactPhone
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
                          </TooltipTrigger>
                          <TooltipContent>
                            Baixar conversa em PDF
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        Tabular
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <div
                        className="p-2 border-b"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Pesquisar tabulação..."
                            value={tabulationSearch}
                            onChange={(e) =>
                              setTabulationSearch(e.target.value)
                            }
                            className="pl-8 h-8"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {tabulations
                          .filter((tab) =>
                            tab.name
                              .toLowerCase()
                              .includes(tabulationSearch.toLowerCase())
                          )
                          .map((tab) => (
                            <DropdownMenuItem
                              key={tab.id}
                              onClick={() => handleTabulate(tab.id)}
                            >
                              {tab.name}
                            </DropdownMenuItem>
                          ))}
                        {tabulations.filter((tab) =>
                          tab.name
                            .toLowerCase()
                            .includes(tabulationSearch.toLowerCase())
                        ).length === 0 && (
                            <DropdownMenuItem disabled>
                              {tabulationSearch
                                ? "Nenhuma tabulação encontrada"
                                : "Nenhuma tabulação disponível"}
                            </DropdownMenuItem>
                          )}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Modal de Edição de Contato */}
              <Dialog
                open={isEditContactOpen}
                onOpenChange={setIsEditContactOpen}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Editar Contato</DialogTitle>
                    <DialogDescription>
                      Edite as informações do contato
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-name">Nome</Label>
                      <Input
                        id="edit-name"
                        placeholder="Nome do contato"
                        value={editContactName}
                        onChange={(e) => setEditContactName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-cpf">CPF</Label>
                      <Input
                        id="edit-cpf"
                        placeholder="000.000.000-00"
                        value={editContactCpf}
                        onChange={(e) => setEditContactCpf(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-contract">Contrato</Label>
                      <Input
                        id="edit-contract"
                        placeholder="Número do contrato"
                        value={editContactContract}
                        onChange={(e) => setEditContactContract(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label className="text-base font-medium">
                          Marcar como CPC
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Contato foi contatado com sucesso
                        </p>
                      </div>
                      <Switch
                        checked={editContactIsCPC}
                        onCheckedChange={setEditContactIsCPC}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditContactOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSaveContact}
                      disabled={isSavingContact}
                    >
                      {isSavingContact ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Salvar
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Messages */}
              <ScrollArea ref={messagesScrollRef} className="flex-1 p-4">
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
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-cyan flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-primary-foreground">
                            OP
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t border-border/50">
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    id="file-upload-input"
                    disabled={
                      isUploadingFile || !selectedConversation || isSending
                    }
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={
                      isUploadingFile || !selectedConversation || isSending
                    }
                    title="Enviar arquivo"
                  >
                    {isUploadingFile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </Button>
                  <Input
                    placeholder="Digite sua mensagem..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !e.shiftKey && handleSendMessage()
                    }
                    className="flex-1"
                    disabled={isSending}
                  />
                  {user?.role === "admin" && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2 mr-2">
                            <Switch
                              id="admin-test-mode"
                              checked={isAdminTestMode}
                              onCheckedChange={setIsAdminTestMode}
                              className="data-[state=checked]:bg-amber-500"
                            />
                            <Label
                              htmlFor="admin-test-mode"
                              className={cn(
                                "text-xs font-medium cursor-pointer",
                                isAdminTestMode && "text-amber-500 font-bold"
                              )}
                            >
                              🧪 Teste Admin
                            </Label>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            Ativar modo teste administrador - ações não
                            aparecerão nos relatórios
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={isSending || !message.trim()}
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageCircle className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Selecione uma conversa</p>
              <p className="text-sm">
                Escolha uma conversa para começar o atendimento
              </p>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Dialog de Notificação de Linha Banida */}
      <Dialog
        open={!!lineBannedNotification}
        onOpenChange={(open) => !open && setLineBannedNotification(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Linha Banida
            </DialogTitle>
            <DialogDescription>
              {lineBannedNotification?.message}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Linha banida:</p>
              <p className="text-sm text-muted-foreground">
                {lineBannedNotification?.bannedLinePhone}
              </p>
              {lineBannedNotification?.newLinePhone && (
                <>
                  <p className="text-sm font-medium mt-3 mb-1">
                    Nova linha atribuída:
                  </p>
                  <p className="text-sm text-success">
                    {lineBannedNotification.newLinePhone}
                  </p>
                </>
              )}
            </div>

            {lineBannedNotification &&
              lineBannedNotification.contactsToRecall.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-3">
                    Contatos para rechamar (
                    {lineBannedNotification.contactsToRecall.length}):
                  </p>
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-2">
                      {lineBannedNotification.contactsToRecall.map(
                        (contact) => (
                          <div
                            key={contact.phone}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {contact.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {contact.phone}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              onClick={async () => {
                                if (isRecallingContact === contact.phone)
                                  return;

                                setIsRecallingContact(contact.phone);
                                try {
                                  await conversationsService.recallContact(
                                    contact.phone
                                  );
                                  toast({
                                    title: "✅ Contato rechamado",
                                    description: `Conversa reiniciada com ${contact.name}`,
                                  });

                                  // Recarregar conversas
                                  await loadConversations();

                                  // Selecionar a conversa recém-criada
                                  await loadConversations();
                                  // Usar setTimeout para garantir que o estado foi atualizado
                                  setTimeout(() => {
                                    setConversations((prev) => {
                                      const found = prev.find(
                                        (c) => c.contactPhone === contact.phone
                                      );
                                      if (found) {
                                        setSelectedConversation(found);
                                      }
                                      return prev;
                                    });
                                  }, 100);

                                  // Remover da lista de contatos para rechamar
                                  setLineBannedNotification((prev) => {
                                    if (!prev) return null;
                                    const updated =
                                      prev.contactsToRecall.filter(
                                        (c) => c.phone !== contact.phone
                                      );
                                    if (updated.length === 0) {
                                      return null; // Fechar dialog se não houver mais contatos
                                    }
                                    return {
                                      ...prev,
                                      contactsToRecall: updated,
                                    };
                                  });
                                } catch (error) {
                                  toast({
                                    title: "Erro ao rechamar contato",
                                    description:
                                      error instanceof Error
                                        ? error.message
                                        : "Erro desconhecido",
                                    variant: "destructive",
                                  });
                                } finally {
                                  setIsRecallingContact(null);
                                }
                              }}
                              disabled={
                                isRecallingContact === contact.phone ||
                                !!isRecallingContact
                              }
                            >
                              {isRecallingContact === contact.phone ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Rechamando...
                                </>
                              ) : (
                                <>
                                  <Phone className="mr-2 h-4 w-4" />
                                  Rechamar
                                </>
                              )}
                            </Button>
                          </div>
                        )
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}

            {lineBannedNotification &&
              lineBannedNotification.contactsToRecall.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum contato para rechamar.
                </p>
              )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLineBannedNotification(null)}
            >
              Fechar
            </Button>
            {lineBannedNotification &&
              lineBannedNotification.contactsToRecall.length > 0 && (
                <Button
                  onClick={async () => {
                    // Rechamar todos os contatos
                    if (!lineBannedNotification) return;

                    const contacts = [
                      ...lineBannedNotification.contactsToRecall,
                    ];
                    for (const contact of contacts) {
                      try {
                        setIsRecallingContact(contact.phone);
                        await conversationsService.recallContact(contact.phone);
                        await new Promise((resolve) =>
                          setTimeout(resolve, 500)
                        ); // Pequeno delay entre chamadas
                      } catch (error) {
                        console.error(
                          `Erro ao rechamar ${contact.phone}:`,
                          error
                        );
                      } finally {
                        setIsRecallingContact(null);
                      }
                    }

                    toast({
                      title: "✅ Contatos rechamados",
                      description: `${contacts.length} contato(s) rechamado(s) com sucesso`,
                    });

                    await loadConversations();
                    setLineBannedNotification(null);
                  }}
                  disabled={!!isRecallingContact}
                >
                  {isRecallingContact ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Rechamando todos...
                    </>
                  ) : (
                    <>
                      <Phone className="mr-2 h-4 w-4" />
                      Rechamar Todos
                    </>
                  )}
                </Button>
              )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
