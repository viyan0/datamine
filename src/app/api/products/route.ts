import { requireSession } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { createProduct, listProducts } from '@/lib/products';
import { wakeAutomation } from '@/lib/automation';

export async function GET() {
  try {
    const session = await requireSession();
    return Response.json(
      { products: await listProducts(session.user) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const session = await requireSession();
    const product = await createProduct(session.user, await bodyJson(request));
    await wakeAutomation();
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
