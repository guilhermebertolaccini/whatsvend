import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface NotificationSettings {
  soundEnabled: boolean;
  volume: number; // 0-100
  messageSound: boolean;
  successSound: boolean;
  errorSound: boolean;
}

interface SettingsContextType {
  notifications: NotificationSettings;
  updateNotifications: (settings: Partial<NotificationSettings>) => void;
  resetNotifications: () => void;
}

const defaultNotificationSettings: NotificationSettings = {
  soundEnabled: true,
  volume: 50,
  messageSound: true,
  successSound: true,
  errorSound: true,
};

const STORAGE_KEY = 'vend-settings';

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...defaultNotificationSettings, ...parsed.notifications };
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage');
    }
    return defaultNotificationSettings;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ notifications }));
    } catch (e) {
      console.warn('Failed to save settings to localStorage');
    }
  }, [notifications]);

  const updateNotifications = useCallback((settings: Partial<NotificationSettings>) => {
    setNotifications(prev => ({ ...prev, ...settings }));
  }, []);

  const resetNotifications = useCallback(() => {
    setNotifications(defaultNotificationSettings);
  }, []);

  return (
    <SettingsContext.Provider value={{ notifications, updateNotifications, resetNotifications }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
