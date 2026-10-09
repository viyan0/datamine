import { requireSession } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { updateProduct } from '@/lib/products';
import { wakeAutomation } from '@/lib/automation';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const session = await requireSession();
    const { id } = await params;
    const product = await updateProduct(session.user, id, await bodyJson(request));
    await wakeAutomation();
    return Response.json({ product });
  } catch (error) {
    return apiError(error);
  }
}
