import { toast } from "sonner";

export const showToast = {
  success: (msg: string) => toast.success(msg),
  error: (msg: string, detail?: string) => {
    toast.error(msg, {
      description: detail,
    });
  },
  info: (msg: string) => toast.info(msg),
  loading: (msg: string) => toast.loading(msg),
};
