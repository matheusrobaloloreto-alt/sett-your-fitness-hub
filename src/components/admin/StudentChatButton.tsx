import { MessageSquare } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openStudentChat } from "@/lib/studentChat";

type StudentChatButtonProps = {
  studentId: string;
  studentName: string;
  phone?: string | null;
  chatId?: string | null;
  message?: string;
  variant?: "icon" | "compact";
  className?: string;
};

function routePrefixFromPath(pathname: string) {
  const prefix = pathname.split("/")[1];
  return prefix || "admin";
}

export function StudentChatButton({
  studentId,
  studentName,
  phone,
  chatId,
  message,
  variant = "icon",
  className,
}: StudentChatButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = routePrefixFromPath(location.pathname);
  const draft = message ?? "";

  const openChat = () => {
    void openStudentChat({
      navigate,
      routePrefix,
      chatId,
      studentId,
      phone,
      message: draft,
      onNoChat: () => toast.error(`${studentName} ainda não tem WhatsApp cadastrado.`),
    });
  };

  if (variant === "compact") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={className}
        onClick={openChat}
        title={`Abrir conversa com ${studentName}`}
        aria-label={`Abrir conversa com ${studentName}`}
      >
        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
        Chat
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={openChat}
      title={`Abrir conversa com ${studentName}`}
      aria-label={`Abrir conversa com ${studentName}`}
    >
      <MessageSquare className="h-4 w-4" />
    </Button>
  );
}
