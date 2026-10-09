import { requireSession } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { updateProduct } from '@/lib/products';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const session = await requireSession();
    const { id } = await params;
    return Response.json({
      product: await updateProduct(session.user, id, await bodyJson(request)),
    });
  } catch (error) {
    return apiError(error);
  }
}
