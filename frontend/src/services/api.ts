// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Token management
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    localStorage.setItem('vend_token', token);
  } else {
    localStorage.removeItem('vend_token');
  }
};

export const getAuthToken = (): string | null => {
  if (authToken) return authToken;
  return localStorage.getItem('vend_token');
};

// API Request helper
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erro na requisição' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }

  return response.json();
}

// ==================== AUTH ====================
export interface LoginResponse {
  access_token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'supervisor' | 'operator' | 'ativador' | 'digital';
    segment: number | null;
    line: number | null;
    status: 'Online' | 'Offline';
  };
}

export const authService = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(response.access_token);
    return response;
  },

  logout: async (): Promise<void> => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },

  me: async () => {
    return apiRequest<LoginResponse['user']>('/auth/me');
  },
};

// ==================== USERS ====================
export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'operator' | 'ativador' | 'digital';
  segment: number | null;
  line: number | null;
  status: 'Online' | 'Offline';
  oneToOneActive?: boolean;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'supervisor' | 'operator' | 'ativador' | 'digital';
  segment?: number;
  line?: number;
  status?: 'Online' | 'Offline';
  oneToOneActive?: boolean;
  identifier?: 'cliente' | 'proprietario';
  isActive?: boolean;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  password?: string;
  role?: 'admin' | 'supervisor' | 'operator' | 'ativador' | 'digital';
  segment?: number | null;
  line?: number | null;
  status?: 'Online' | 'Offline';
  oneToOneActive?: boolean;
  identifier?: 'cliente' | 'proprietario';
  isActive?: boolean;
}

export const usersService = {
  list: async (params?: { role?: string; segment?: number; status?: string }): Promise<User[]> => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return apiRequest<User[]>(`/users${query}`);
  },

  getOnlineOperators: async (segment?: number): Promise<User[]> => {
    const query = segment ? `?segment=${segment}` : '';
    return apiRequest<User[]>(`/users/online-operators${query}`);
  },

  getById: async (id: number): Promise<User> => {
    return apiRequest<User>(`/users/${id}`);
  },

  create: async (data: CreateUserData): Promise<User> => {
    return apiRequest<User>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: UpdateUserData): Promise<User> => {
    return apiRequest<User>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiRequest(`/users/${id}`, { method: 'DELETE' });
  },

  uploadCSV: async (file: File): Promise<{ message: string; success: number; errors: string[] }> => {
    const token = getAuthToken();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/users/upload-csv`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro na requisição' }));
      throw new Error(error.message || `HTTP error ${response.status}`);
    }

    return response.json();
  },
};

// ==================== SEGMENTS ====================
export interface Segment {
  id: number;
  name: string;
  allowsFreeMessage: boolean;
  createdAt: string;
  updatedAt: string;
}

export const segmentsService = {
  list: async (search?: string): Promise<Segment[]> => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiRequest<Segment[]>(`/segments${query}`);
  },

  getById: async (id: number): Promise<Segment> => {
    return apiRequest<Segment>(`/segments/${id}`);
  },

  create: async (name: string, allowsFreeMessage: boolean = true, identifier?: 'cliente' | 'proprietario'): Promise<Segment> => {
    return apiRequest<Segment>('/segments', {
      method: 'POST',
      body: JSON.stringify({ name, allowsFreeMessage, identifier }),
    });
  },

  update: async (id: number, name: string, allowsFreeMessage?: boolean, identifier?: 'cliente' | 'proprietario'): Promise<Segment> => {
    const body: any = { name };
    if (allowsFreeMessage !== undefined) {
      body.allowsFreeMessage = allowsFreeMessage;
    }
    if (identifier !== undefined) {
      body.identifier = identifier;
    }
    return apiRequest<Segment>(`/segments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiRequest(`/segments/${id}`, { method: 'DELETE' });
  },

  uploadCSV: async (file: File): Promise<{ message: string; success: number; errors: string[] }> => {
    const token = getAuthToken();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/segments/upload-csv`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro na requisição' }));
      throw new Error(error.message || `HTTP error ${response.status}`);
    }

    return response.json();
  },
};

// ==================== LINES ====================
export interface Line {
  id: number;
  phone: string;
  lineStatus: 'active' | 'ban';
  segment: number | null;
  segmentName?: string | null;
  linkedTo: number | null;
  evolutionName: string;
  oficial: boolean;
  token?: string | null;
  businessID?: string | null;
  numberId?: string | null;
  receiveMedia?: boolean;
  createdAt: string;
  updatedAt: string;
  operators?: Array<{
    id: number;
    name: string;
    email: string;
  }>;
}

export interface CreateLineData {
  phone: string;
  evolutionName: string;
  segment?: number;
  oficial?: boolean;
  lineStatus?: 'active' | 'ban';
  linkedTo?: number;
  token?: string;
  businessID?: string;
  numberId?: string;
  receiveMedia?: boolean;
}

export const linesService = {
  list: async (params?: { segment?: number; lineStatus?: string; evolutionName?: string }): Promise<Line[]> => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return apiRequest<Line[]>(`/lines${query}`);
  },

  getById: async (id: number): Promise<Line> => {
    return apiRequest<Line>(`/lines/${id}`);
  },

  getEvolutions: async (): Promise<Array<{ id: number; evolutionName: string; evolutionUrl: string }>> => {
    return apiRequest('/lines/evolutions');
  },

  getActivatorsProductivity: async (startDate?: string, endDate?: string): Promise<Array<{
    id: number;
    name: string;
    email: string;
    totalCreated: number;
    totalBannedInRange: number;
    currentlyActive: number;
    peakBanDay: { date: string; created: number; banned: number } | null;
    dailyHistory: Array<{ date: string; created: number; banned: number }>;
    lastActivity: string;
  }>> => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/lines/activators-productivity${query}`);
  },

  getAllocationStats: async (): Promise<{
    totalActiveLines: number;
    linesWithOperators: number;
    linesWithoutOperators: number;
    linesWithOneOperator: number;
    linesWithTwoOperators: number;
  }> => {
    return apiRequest('/lines/allocation-stats');
  },

  getInstances: async (evolutionName: string): Promise<Array<{ instanceName: string; status: string }>> => {
    return apiRequest(`/lines/instances/${evolutionName}`);
  },

  getAvailable: async (segment: number): Promise<Line[]> => {
    return apiRequest<Line[]>(`/lines/available/${segment}`);
  },

  getQrCode: async (id: number): Promise<{
    qrcode: string | null;
    connected?: boolean;
    pairingCode?: string;
    message?: string;
  }> => {
    return apiRequest(`/lines/${id}/qrcode`);
  },

  create: async (data: CreateLineData): Promise<Line> => {
    return apiRequest<Line>('/lines', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<CreateLineData>): Promise<Line> => {
    return apiRequest<Line>(`/lines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  ban: async (id: number): Promise<void> => {
    await apiRequest(`/lines/${id}/ban`, { method: 'POST' });
  },

  delete: async (id: number): Promise<void> => {
    await apiRequest(`/lines/${id}`, { method: 'DELETE' });
  },

  assignOperator: async (lineId: number, operatorId: number): Promise<void> => {
    await apiRequest(`/lines/${lineId}/assign-operator/${operatorId}`, { method: 'POST' });
  },

  getAvailableForOperator: async (operatorId: number): Promise<Array<{
    id: number;
    phone: string;
    segment: number | null;
    segmentName: string | null;
    operatorsCount: number;
  }>> => {
    return apiRequest(`/lines/available-for-operator/${operatorId}`);
  },
};

// ==================== CONTACTS ====================
export interface Contact {
  id: number;
  name: string;
  phone: string;
  segment: number | null;
  cpf?: string;
  contract?: string;
  isCPC?: boolean;
  lastCPCAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactData {
  name: string;
  phone: string;
  segment?: number;
  cpf?: string;
  contract?: string;
  isCPC?: boolean;
}

export const contactsService = {
  list: async (params?: { search?: string; segment?: number }): Promise<Contact[]> => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return apiRequest<Contact[]>(`/contacts${query}`);
  },

  getById: async (id: number): Promise<Contact> => {
    return apiRequest<Contact>(`/contacts/${id}`);
  },

  getByPhone: async (phone: string): Promise<Contact | null> => {
    try {
      return await apiRequest<Contact>(`/contacts/by-phone/${encodeURIComponent(phone)}`);
    } catch {
      return null;
    }
  },

  create: async (data: CreateContactData): Promise<Contact> => {
    return apiRequest<Contact>('/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<CreateContactData>): Promise<Contact> => {
    return apiRequest<Contact>(`/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  updateByPhone: async (phone: string, data: Partial<CreateContactData>): Promise<Contact> => {
    return apiRequest<Contact>(`/contacts/by-phone/${encodeURIComponent(phone)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiRequest(`/contacts/${id}`, { method: 'DELETE' });
  },
};

// ==================== CAMPAIGNS ====================
export interface Campaign {
  id: number;
  name: string;
  contactName: string;
  contactPhone: string;
  contactSegment: number;
  dateTime: string;
  lineReceptor: number;
  response: boolean;
  speed: 'fast' | 'medium' | 'slow';
  retryCount: number;
  createdAt: string;
}

export interface CampaignStats {
  campaignName?: string;
  totalContacts: number;
  sent: number;
  responses: number;
  pending: number;
  failed?: number;
  successRate?: string;
  responseRate?: string;
}

export interface CreateCampaignData {
  name: string;
  speed: 'fast' | 'medium' | 'slow';
  segment: string;
  useTemplate?: boolean;
  templateId?: number;
  templateVariables?: Array<{ key: string; value: string }>;
  endTime?: string; // Formato: "HH:mm" (ex: "19:00")
}

export const campaignsService = {
  list: async (): Promise<Campaign[]> => {
    return apiRequest<Campaign[]>('/campaigns');
  },

  getById: async (id: number): Promise<Campaign> => {
    return apiRequest<Campaign>(`/campaigns/${id}`);
  },

  getStats: async (name: string): Promise<CampaignStats> => {
    return apiRequest<CampaignStats>(`/campaigns/stats/${encodeURIComponent(name)}`);
  },

  create: async (data: CreateCampaignData): Promise<Campaign> => {
    return apiRequest<Campaign>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  uploadCSV: async (id: number, file: File, message?: string): Promise<{ contactsAdded: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (message) formData.append('message', message);

    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/campaigns/${id}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro no upload' }));
      throw new Error(error.message);
    }

    return response.json();
  },
};

// ==================== CONVERSATIONS ====================
export interface Conversation {
  id: number;
  contactName: string;
  contactPhone: string;
  segment: number | null;
  userName: string | null;
  userLine: number | null;
  message: string;
  sender: 'operator' | 'contact';
  datetime: string;
  tabulation: number | null;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document';
  mediaUrl: string | null;
  createdAt: string;
}

export interface CreateConversationData {
  contactName: string;
  contactPhone: string;
  segment?: number;
  userName?: string;
  userLine?: number;
  message: string;
  sender: 'operator' | 'contact';
  tabulation?: number | null;
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string | null;
}

export const conversationsService = {
  list: async (params?: { segment?: number; userLine?: number; contactPhone?: string }): Promise<Conversation[]> => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return apiRequest<Conversation[]>(`/conversations${query}`);
  },

  recallContact: async (phone: string): Promise<Conversation> => {
    return apiRequest<Conversation>(`/conversations/recall/${encodeURIComponent(phone)}`, {
      method: 'POST',
    });
  },

  getActive: async (): Promise<Conversation[]> => {
    return apiRequest<Conversation[]>('/conversations/active');
  },

  getTabulated: async (): Promise<Conversation[]> => {
    return apiRequest<Conversation[]>('/conversations/tabulated');
  },

  getBySegment: async (segment: number, tabulated?: boolean): Promise<Array<{ contactPhone: string; contactName: string; messages: Conversation[] }>> => {
    const query = tabulated !== undefined ? `?tabulated=${tabulated}` : '';
    return apiRequest(`/conversations/segment/${segment}${query}`);
  },

  getByContact: async (phone: string, tabulated?: boolean): Promise<Conversation[]> => {
    const query = tabulated !== undefined ? `?tabulated=${tabulated}` : '';
    return apiRequest<Conversation[]>(`/conversations/contact/${encodeURIComponent(phone)}${query}`);
  },

  getById: async (id: number): Promise<Conversation> => {
    return apiRequest<Conversation>(`/conversations/${id}`);
  },

  create: async (data: CreateConversationData): Promise<Conversation> => {
    return apiRequest<Conversation>('/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<CreateConversationData>): Promise<Conversation> => {
    return apiRequest<Conversation>(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  tabulate: async (phone: string, tabulationId: number): Promise<void> => {
    await apiRequest(`/conversations/tabulate/${encodeURIComponent(phone)}`, {
      method: 'POST',
      body: JSON.stringify({ tabulationId }),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiRequest(`/conversations/${id}`, { method: 'DELETE' });
  },
};

// ==================== TABULATIONS ====================
export interface Tabulation {
  id: number;
  name: string;
  isCPC: boolean;
  createdAt: string;
  updatedAt: string;
}

export const tabulationsService = {
  list: async (search?: string): Promise<Tabulation[]> => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiRequest<Tabulation[]>(`/tabulations${query}`);
  },

  getById: async (id: number): Promise<Tabulation> => {
    return apiRequest<Tabulation>(`/tabulations/${id}`);
  },

  create: async (name: string, isCPC: boolean = false): Promise<Tabulation> => {
    return apiRequest<Tabulation>('/tabulations', {
      method: 'POST',
      body: JSON.stringify({ name, isCPC }),
    });
  },

  update: async (id: number, data: { name?: string; isCPC?: boolean }): Promise<Tabulation> => {
    return apiRequest<Tabulation>(`/tabulations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiRequest(`/tabulations/${id}`, { method: 'DELETE' });
  },
};

// ==================== BLOCKLIST ====================
export interface BlocklistEntry {
  id: number;
  name?: string;
  phone?: string;
  cpf?: string;
  createdAt: string;
  updatedAt: string;
}

export const blocklistService = {
  list: async (search?: string): Promise<BlocklistEntry[]> => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiRequest<BlocklistEntry[]>(`/blocklist${query}`);
  },

  check: async (params: { phone?: string; cpf?: string }): Promise<{ blocked: boolean }> => {
    const query = `?${new URLSearchParams(params as Record<string, string>)}`;
    return apiRequest(`/blocklist/check${query}`);
  },

  getById: async (id: number): Promise<BlocklistEntry> => {
    return apiRequest<BlocklistEntry>(`/blocklist/${id}`);
  },

  create: async (data: { name?: string; phone?: string; cpf?: string }): Promise<BlocklistEntry> => {
    return apiRequest<BlocklistEntry>('/blocklist', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: { name?: string; phone?: string }): Promise<BlocklistEntry> => {
    return apiRequest<BlocklistEntry>(`/blocklist/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiRequest(`/blocklist/${id}`, { method: 'DELETE' });
  },
};

// ==================== EVOLUTION ====================
export interface Evolution {
  id: number;
  evolutionName: string;
  evolutionUrl: string;
  evolutionKey: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== SYSTEM EVENTS ====================
export interface SystemEvent {
  id: number;
  type: string;
  module: string;
  data: any;
  userId: number | null;
  severity: 'info' | 'warning' | 'error' | 'success';
  createdAt: string;
  user?: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
}

export interface SystemEventsResponse {
  events: SystemEvent[];
  total: number;
}

export const systemEventsService = {
  async getEvents(filters?: {
    type?: string;
    module?: string;
    userId?: number;
    severity?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<SystemEventsResponse> {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.module) params.append('module', filters.module);
    if (filters?.userId) params.append('userId', filters.userId.toString());
    if (filters?.severity) params.append('severity', filters.severity);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    return apiRequest<SystemEventsResponse>(`/system-events?${params.toString()}`);
  },

  async getMetrics(filters?: {
    startDate?: string;
    endDate?: string;
    groupBy?: 'type' | 'module' | 'severity' | 'hour' | 'day';
  }): Promise<Record<string, number>> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.groupBy) params.append('groupBy', filters.groupBy);

    return apiRequest<Record<string, number>>(`/system-events/metrics?${params.toString()}`);
  },

  async getEventsPerMinute(filters?: {
    startDate?: string;
    endDate?: string;
  }): Promise<{ time: string; count: number }[]> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);

    return apiRequest<{ time: string; count: number }[]>(`/system-events/events-per-minute?${params.toString()}`);
  },
};

export const evolutionService = {
  list: async (): Promise<Evolution[]> => {
    return apiRequest<Evolution[]>('/evolution');
  },

  getById: async (id: number): Promise<Evolution> => {
    return apiRequest<Evolution>(`/evolution/${id}`);
  },

  create: async (data: { evolutionName: string; evolutionUrl: string; evolutionKey: string }): Promise<Evolution> => {
    return apiRequest<Evolution>('/evolution', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: { evolutionUrl?: string; evolutionKey?: string }): Promise<Evolution> => {
    return apiRequest<Evolution>(`/evolution/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiRequest(`/evolution/${id}`, { method: 'DELETE' });
  },

  test: async (name: string): Promise<{ status: string; message: string }> => {
    return apiRequest(`/evolution/test/${encodeURIComponent(name)}`);
  },
};

// ==================== TAGS ====================
export interface Tag {
  id: number;
  name: string;
  description?: string;
  segment: number | null;
  createdAt: string;
  updatedAt: string;
}

export const tagsService = {
  list: async (params?: { search?: string; segment?: number }): Promise<Tag[]> => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return apiRequest<Tag[]>(`/tags${query}`);
  },

  getById: async (id: number): Promise<Tag> => {
    return apiRequest<Tag>(`/tags/${id}`);
  },

  create: async (data: { name: string; description?: string; segment?: number }): Promise<Tag> => {
    return apiRequest<Tag>('/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: { name?: string; description?: string; segment?: number }): Promise<Tag> => {
    return apiRequest<Tag>(`/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiRequest(`/tags/${id}`, { method: 'DELETE' });
  },
};

// ==================== TEMPLATES ====================
export interface Template {
  id: number;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  segmentId: number | null;  // Vinculado a segmento (null = global)
  lineId?: number;  // Mantido para compatibilidade
  namespace?: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  headerType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerContent?: string;
  bodyText: string;
  footerText?: string;
  variables?: string[];  // Array de nomes de variáveis
  buttons?: any[];  // Array de botões
  bodyText: string;
  footerText?: string;
  buttons?: Array<{ type: string; text: string }>;
  variables?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateData {
  name: string;
  language?: string;
  category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  segmentId?: number;  // Vinculado a segmento (opcional = global)
  lineId?: number;  // Mantido para compatibilidade
  namespace?: string;
  headerType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerContent?: string;
  bodyText: string;
  footerText?: string;
  buttons?: Array<{ type: string; text: string }>;
  variables?: string[];
}

export const templatesService = {
  list: async (params?: { search?: string; segmentId?: number; status?: string }): Promise<Template[]> => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return apiRequest<Template[]>(`/templates${query}`);
  },

  getById: async (id: number): Promise<Template> => {
    return apiRequest<Template>(`/templates/${id}`);
  },

  getBySegment: async (segmentId: number): Promise<Template[]> => {
    return apiRequest<Template[]>(`/templates/segment/${segmentId}`);
  },

  create: async (data: CreateTemplateData): Promise<Template> => {
    return apiRequest<Template>('/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<CreateTemplateData & { status: string }>): Promise<Template> => {
    return apiRequest<Template>(`/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiRequest(`/templates/${id}`, { method: 'DELETE' });
  },

  sync: async (id: number): Promise<{ success: boolean; message: string; templateId: string }> => {
    return apiRequest(`/templates/${id}/sync`, { method: 'POST' });
  },

  send: async (data: {
    templateId: number;
    phone: string;
    contactName?: string;
    variables?: Array<{ key: string; value: string }>;
    lineId?: number;
  }): Promise<{ success: boolean; messageId: string }> => {
    return apiRequest('/templates/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  sendMassive: async (data: {
    templateId: number;
    recipients: Array<{
      phone: string;
      name?: string;
      variables?: Array<{ key: string; value: string }>;
    }>;
    lineId?: number;
  }): Promise<{ success: boolean; total: number; sent: number }> => {
    return apiRequest('/templates/send/massive', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ==================== DASHBOARD STATS ====================
export interface DailyStats {
  date: string;
  conversations: number;
  messages: number;
  operators: number;
}

export const dashboardService = {
  getDailyStats: async (days: number = 7): Promise<DailyStats[]> => {
    return apiRequest<DailyStats[]>(`/dashboard/stats?days=${days}`);
  },
};

// ==================== REPORTS ====================
export interface ReportParams {
  startDate: string;
  endDate: string;
  segment?: number;
  type: string;
  onlyMovimentedLines?: boolean;
}

// Mapeamento de tipos de relatório para endpoints
const reportEndpoints: Record<string, string> = {
  'op_sintetico': 'op-sintetico',
  'kpi': 'kpi',
  'hsm': 'hsm',
  'status_linha': 'line-status',
  'adm_linhas': 'adm-linhas',
  'envios': 'envios',
  'indicadores': 'indicadores',
  'tempos': 'tempos',
  'templates': 'templates',
  'completo_csv': 'completo-csv',
  'equipe': 'equipe',
  'dados_transacionados': 'dados-transacionados',
  'detalhado_conversas': 'detalhado-conversas',
  'linhas': 'linhas',
  'mensagens_por_linha': 'mensagens-por-linha',
  'resumo_atendimentos': 'resumo-atendimentos',
  'usuarios': 'usuarios',
  'hiper_personalizado': 'hiper-personalizado',
  'consolidado': 'consolidado',
};

// Helper para converter array de objetos em CSV
const arrayToCSV = (data: any[]): string => {
  if (!data || data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        // Escapar valores com vírgulas ou aspas
        if (value === null || value === undefined) return '';
        const strValue = String(value);
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      }).join(',')
    ),
  ];

  // Adicionar BOM (Byte Order Mark) para UTF-8 para garantir encoding correto no Excel
  return '\ufeff' + csvRows.join('\n');
};

export const reportsService = {
  generate: async (params: ReportParams): Promise<Blob> => {
    const endpoint = reportEndpoints[params.type];
    if (!endpoint) {
      throw new Error(`Tipo de relatório não suportado: ${params.type}`);
    }

    // Construir query string
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.segment) queryParams.append('segment', params.segment.toString());
    if (params.onlyMovimentedLines !== undefined) queryParams.append('onlyMovimentedLines', params.onlyMovimentedLines.toString());

    const url = `${API_BASE_URL}/reports/${endpoint}?${queryParams.toString()}`;

    const token = getAuthToken();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Erro ao gerar relatório');
    }

    // Backend retorna JSON, precisamos converter para CSV
    const data = await response.json();
    const csvContent = arrayToCSV(Array.isArray(data) ? data : [data]);

    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  },
};

// ==================== API LOGS ====================
export interface ApiLog {
  id: number;
  endpoint: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  statusCode: number;
  ip?: string;
  ipAddress?: string;
  date?: string;
  createdAt?: string;
  requestPayload?: object;
  responsePayload?: object;
  userAgent?: string;
}

export const apiLogsService = {
  list: async (params?: {
    endpoint?: string;
    method?: string;
    statusCode?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<ApiLog[]> => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return apiRequest<ApiLog[]>(`/api-logs${query}`);
  },

  getById: async (id: number): Promise<ApiLog> => {
    return apiRequest<ApiLog>(`/api-logs/${id}`);
  },
};

// ==================== CONTROL PANEL ====================
export interface ControlPanelSettings {
  id: number | null;
  segmentId: number | null;
  blockPhrasesEnabled: boolean;
  blockPhrases: string[];
  blockTabulationId: number | null;
  cpcCooldownEnabled: boolean;
  cpcCooldownHours: number;
  resendCooldownEnabled: boolean;
  resendCooldownHours: number;
  repescagemEnabled: boolean;
  repescagemMaxMessages: number;
  repescagemCooldownHours: number;
  repescagemMaxAttempts: number;
  activeEvolutions: string[] | null; // Array de nomes de evolution (null = todas ativas)
}

export const controlPanelService = {
  get: async (segmentId?: number): Promise<ControlPanelSettings> => {
    const query = segmentId ? `?segmentId=${segmentId}` : '';
    return apiRequest<ControlPanelSettings>(`/control-panel${query}`);
  },

  update: async (settings: Partial<ControlPanelSettings>): Promise<ControlPanelSettings> => {
    return apiRequest<ControlPanelSettings>('/control-panel', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  },

  addBlockPhrase: async (phrase: string, segmentId?: number): Promise<ControlPanelSettings> => {
    const query = segmentId ? `?segmentId=${segmentId}` : '';
    return apiRequest<ControlPanelSettings>(`/control-panel/block-phrases${query}`, {
      method: 'POST',
      body: JSON.stringify({ phrase }),
    });
  },

  removeBlockPhrase: async (phrase: string, segmentId?: number): Promise<ControlPanelSettings> => {
    const query = segmentId ? `?segmentId=${segmentId}` : '';
    return apiRequest<ControlPanelSettings>(`/control-panel/block-phrases${query}`, {
      method: 'DELETE',
      body: JSON.stringify({ phrase }),
    });
  },

  checkCPC: async (phone: string, segmentId?: number): Promise<{ allowed: boolean; reason?: string; hoursRemaining?: number }> => {
    const query = segmentId ? `?segmentId=${segmentId}` : '';
    return apiRequest(`/control-panel/check-cpc/${encodeURIComponent(phone)}${query}`);
  },

  checkResend: async (phone: string, segmentId?: number): Promise<{ allowed: boolean; reason?: string; hoursRemaining?: number }> => {
    const query = segmentId ? `?segmentId=${segmentId}` : '';
    return apiRequest(`/control-panel/check-resend/${encodeURIComponent(phone)}${query}`);
  },

  markAsCPC: async (phone: string, isCPC: boolean): Promise<{ success: boolean }> => {
    return apiRequest(`/control-panel/mark-cpc/${encodeURIComponent(phone)}`, {
      method: 'POST',
      body: JSON.stringify({ isCPC }),
    });
  },

  assignLinesMass: async (): Promise<{
    success: boolean;
    assigned: number;
    skipped: number;
    details: Array<{
      operatorName: string;
      operatorId: number;
      segment: number | null;
      linePhone: string | null;
      lineId: number | null;
      status: 'assigned' | 'skipped' | 'already_has_line';
      reason?: string;
    }>;
  }> => {
    return apiRequest('/control-panel/assign-lines-mass', {
      method: 'POST',
    });
  },

  unassignAllLines: async (): Promise<{
    success: boolean;
    unassignedOperators: number;
    linesUpdated: number;
    reassignedOperators: number;
    message: string;
  }> => {
    return apiRequest('/control-panel/unassign-all-lines', {
      method: 'POST',
    });
  },
};
