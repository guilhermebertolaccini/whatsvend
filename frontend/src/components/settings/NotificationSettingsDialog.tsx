import { Volume2, VolumeX, Bell, BellOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSettings } from "@/contexts/SettingsContext";
import { useNotificationSound } from "@/hooks/useNotificationSound";

interface NotificationSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationSettingsDialog({ open, onOpenChange }: NotificationSettingsDialogProps) {
  const { notifications, updateNotifications, resetNotifications } = useSettings();
  const { playSound } = useNotificationSound();

  const handleVolumeChange = (value: number[]) => {
    updateNotifications({ volume: value[0] });
  };

  const handleTestSound = (type: 'message' | 'success' | 'error') => {
    playSound(type);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configurações de Notificação
          </DialogTitle>
          <DialogDescription>
            Personalize os sons e alertas do sistema
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Master Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {notifications.soundEnabled ? (
                <Volume2 className="h-5 w-5 text-primary" />
              ) : (
                <VolumeX className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <Label htmlFor="sound-enabled" className="text-base font-medium">
                  Sons de Notificação
                </Label>
                <p className="text-sm text-muted-foreground">
                  Ativar ou desativar todos os sons
                </p>
              </div>
            </div>
            <Switch
              id="sound-enabled"
              checked={notifications.soundEnabled}
              onCheckedChange={(checked) => updateNotifications({ soundEnabled: checked })}
            />
          </div>

          <Separator />

          {/* Volume Control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Volume</Label>
              <span className="text-sm text-muted-foreground">{notifications.volume}%</span>
            </div>
            <Slider
              value={[notifications.volume]}
              onValueChange={handleVolumeChange}
              max={100}
              min={0}
              step={5}
              disabled={!notifications.soundEnabled}
              className="w-full"
            />
          </div>

          <Separator />

          {/* Individual Sound Toggles */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Tipos de Notificação</Label>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Novas mensagens</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={() => handleTestSound('message')}
                    disabled={!notifications.soundEnabled || !notifications.messageSound}
                  >
                    Testar
                  </Button>
                </div>
                <Switch
                  checked={notifications.messageSound}
                  onCheckedChange={(checked) => updateNotifications({ messageSound: checked })}
                  disabled={!notifications.soundEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Ações de sucesso</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={() => handleTestSound('success')}
                    disabled={!notifications.soundEnabled || !notifications.successSound}
                  >
                    Testar
                  </Button>
                </div>
                <Switch
                  checked={notifications.successSound}
                  onCheckedChange={(checked) => updateNotifications({ successSound: checked })}
                  disabled={!notifications.soundEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Erros e alertas</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={() => handleTestSound('error')}
                    disabled={!notifications.soundEnabled || !notifications.errorSound}
                  >
                    Testar
                  </Button>
                </div>
                <Switch
                  checked={notifications.errorSound}
                  onCheckedChange={(checked) => updateNotifications({ errorSound: checked })}
                  disabled={!notifications.soundEnabled}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Reset Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={resetNotifications}
            className="w-full"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar Padrões
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
