import { useEffect, useState, useCallback } from 'react';
import { realtimeSocket, WS_EVENTS } from '@/services/websocket';
import { getAuthToken } from '@/services/api';
import { useToast } from '@/components/ui/use-toast';

export function useRealtimeConnection() {
  // Inicializar com o estado atual do socket
  const [isConnected, setIsConnected] = useState(() => realtimeSocket.isConnected);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  const connect = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      console.log('[Realtime] No auth token, skipping connection');
      return;
    }

    // Se já está conectado, apenas atualizar o estado
    if (realtimeSocket.isConnected) {
      console.log('[Realtime] Already connected');
      setIsConnected(true);
      return;
    }

    setIsConnecting(true);
    try {
      await realtimeSocket.connect(token);
      // Atualizar estado após conexão bem-sucedida
      setIsConnected(true);
      console.log('[Realtime] Connected successfully');
    } catch (error) {
      console.error('[Realtime] Connection failed:', error);
      setIsConnected(false);
      toast({
        title: 'Conexão em tempo real',
        description: 'Não foi possível conectar. Tentando novamente...',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  useEffect(() => {
    // Registrar handlers ANTES de conectar
    const unsubConnect = realtimeSocket.onConnect(() => {
      setIsConnected(true);
      console.log('[Realtime] Connection established (handler)');
    });

    const unsubDisconnect = realtimeSocket.onDisconnect(() => {
      setIsConnected(false);
      console.log('[Realtime] Connection lost (handler)');
    });

    // Verificar estado atual primeiro
    if (realtimeSocket.isConnected) {
      setIsConnected(true);
    } else {
      connect();
    }

    return () => {
      unsubConnect();
      unsubDisconnect();
    };
  }, [connect]);

  // Sincronizar periodicamente com o estado real do socket
  useEffect(() => {
    const interval = setInterval(() => {
      const currentState = realtimeSocket.isConnected;
      setIsConnected(prev => {
        if (prev !== currentState) {
          console.log(`[Realtime] State sync: ${prev} -> ${currentState}`);
        }
        return currentState;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return { isConnected, isConnecting };
}

export function useRealtimeSubscription<T = any>(
  eventType: string,
  handler: (data: T) => void,
  dependencies: any[] = []
) {
  useEffect(() => {
    const unsubscribe = realtimeSocket.subscribe(eventType, handler);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, ...dependencies]);
}

export function useRealtimeMetrics() {
  const [metrics, setMetrics] = useState({
    activeConversations: 0,
    onlineOperators: 0,
    availableLines: 0,
  });

  useRealtimeSubscription(WS_EVENTS.METRICS_UPDATE, (data: any) => {
    if (data.metrics) {
      setMetrics(data.metrics);
    }
  });

  return metrics;
}
