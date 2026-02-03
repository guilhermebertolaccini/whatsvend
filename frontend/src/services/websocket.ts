// Socket.IO Service for Real-time Updates
import { io, Socket } from 'socket.io-client';

const WS_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type MessageHandler = (data: any) => void;
type ConnectionHandler = () => void;

class RealtimeWebSocket {
  private socket: Socket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private disconnectionHandlers: Set<ConnectionHandler> = new Set();
  private currentToken: string | null = null;
  private isConnecting: boolean = false;
  private connectPromise: Promise<void> | null = null;

  connect(token: string): Promise<void> {
    // Se já está conectado com o mesmo token, apenas resolver
    if (this.socket?.connected && this.currentToken === token) {
      return Promise.resolve();
    }

    // Se já está tentando conectar, retornar a promise existente
    if (this.isConnecting && this.currentToken === token && this.connectPromise) {
      return this.connectPromise;
    }

    this.currentToken = token;
    this.isConnecting = true;

    this.connectPromise = new Promise((resolve, reject) => {
      // Se existe socket mas não está conectado, reutilizar
      if (this.socket && !this.socket.connected) {
        this.socket.auth = { token };
        this.socket.connect();
        
        const onConnect = () => {
          this.isConnecting = false;
          console.log('[Socket.IO] Connected');
          this.connectionHandlers.forEach(handler => handler());
          this.socket?.off('connect', onConnect);
          this.socket?.off('connect_error', onError);
          resolve();
        };
        
        const onError = (error: Error) => {
          this.isConnecting = false;
          console.error('[Socket.IO] Connection Error:', error.message);
          this.socket?.off('connect', onConnect);
          this.socket?.off('connect_error', onError);
          reject(error);
        };
        
        this.socket.once('connect', onConnect);
        this.socket.once('connect_error', onError);
        return;
      }

      try {
        // Criar nova conexão Socket.IO com autenticação
        this.socket = io(WS_BASE_URL, {
          auth: {
            token: token
          },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 3000,
          autoConnect: true,
        });

        // Handler de conexão bem-sucedida
        this.socket.on('connect', () => {
          this.isConnecting = false;
          console.log('[Socket.IO] Connected');
          this.connectionHandlers.forEach(handler => handler());
          resolve();
        });

        // Handler de erro de conexão
        this.socket.on('connect_error', (error) => {
          this.isConnecting = false;
          console.error('[Socket.IO] Connection Error:', error.message);
          // Não rejeitar aqui para permitir reconexão automática
        });

        // Handler de desconexão
        this.socket.on('disconnect', (reason) => {
          console.log('[Socket.IO] Disconnected:', reason);
          this.disconnectionHandlers.forEach(handler => handler());
        });

        // Handler de erro genérico
        this.socket.on('error', (error) => {
          console.error('[Socket.IO] Error:', error);
        });

        // Configurar listeners para eventos existentes
        this.setupEventListeners();

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });

    return this.connectPromise;
  }

  private registeredEvents: Set<string> = new Set();

  private setupEventListeners() {
    if (!this.socket) return;

    // Reconfigurar todos os event handlers registrados
    this.handlers.forEach((_, eventType) => {
      this.registerEventOnSocket(eventType);
    });
  }

  private registerEventOnSocket(eventType: string) {
    if (!this.socket || eventType === 'all' || this.registeredEvents.has(eventType)) return;

    this.registeredEvents.add(eventType);
    this.socket.on(eventType, (data) => {
      console.log('[Socket.IO] Message received:', eventType, data);
      const handlerSet = this.handlers.get(eventType);
      if (handlerSet) {
        handlerSet.forEach(handler => handler(data));
      }
      
      // Também disparar para handlers 'all'
      const allHandlers = this.handlers.get('all');
      if (allHandlers) {
        allHandlers.forEach(handler => handler({ type: eventType, ...data }));
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentToken = null;
      this.registeredEvents.clear(); // Limpar eventos registrados
    }
  }

  reconnect() {
    if (this.currentToken) {
      console.log('[Socket.IO] Reconnecting...');
      this.disconnect();
      // Pequeno delay para garantir que a desconexão foi processada
      setTimeout(() => {
        this.connect(this.currentToken!);
      }, 500);
    }
  }

  subscribe(eventType: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    // Registrar listener no socket se já estiver conectado (sem duplicação)
    if (this.socket) {
      this.registerEventOnSocket(eventType);
    }

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        // Não remover o listener do socket, apenas o handler
        // O listener continuará ativo para outros handlers
      }
    };
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectionHandlers.add(handler);
    return () => this.disconnectionHandlers.delete(handler);
  }

  send(event: string, data?: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('[Socket.IO] Cannot send, not connected');
    }
  }

  // Método legado para compatibilidade
  emit(event: string, data?: any) {
    this.send(event, data);
  }

  get isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Singleton instance
export const realtimeSocket = new RealtimeWebSocket();

// Event types
export const WS_EVENTS = {
  NEW_CONVERSATION: 'new_conversation',
  NEW_MESSAGE: 'new_message',
  CONVERSATION_UPDATED: 'conversation_updated',
  OPERATOR_STATUS: 'operator_status',
  METRICS_UPDATE: 'metrics_update',
  LINE_STATUS: 'line_status',
  LINE_BANNED: 'line-banned',
  LINE_ASSIGNED: 'line-assigned',
  MESSAGE_ERROR: 'message-error',
} as const;

export type WSEventType = typeof WS_EVENTS[keyof typeof WS_EVENTS];
