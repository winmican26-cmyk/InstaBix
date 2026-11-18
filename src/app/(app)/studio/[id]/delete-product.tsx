"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProductAction } from "@/lib/actions/studio";
import { Button } from "@/components/ui/button";

export function DeleteProductButton({ productId, title }: { productId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      loading={pending}
      onClick={() => {
        if (!window.confirm(`Delete “${title}” and its chapters, drafts and citations? Orders will block the delete.`)) return;
        startTransition(async () => {
          const result = await deleteProductAction(productId);
          if (result.error) toast.error(result.error);
          else {
            toast.success(result.success ?? "Product deleted.");
            router.replace("/studio");
          }
        });
      }}
    >
      <Trash2 /> Delete
    </Button>
  );
}
