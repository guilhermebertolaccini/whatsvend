import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { useAuth } from "@/contexts/AuthContext";

export function Toaster() {
  const { user } = useAuth();
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.filter(toast => {
        // BLINDAGEM DE PANICO: Operadores não devem ver toasts de erro (vermelhos)
        // Isso evita que eles achem que quebraram o sistema quando é apenas uma instabilidade
        if (user?.role === 'operador' && toast.variant === 'destructive') {
          return false;
        }
        return true;
      }).map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
