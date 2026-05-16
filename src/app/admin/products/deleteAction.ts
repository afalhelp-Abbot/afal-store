'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServiceClient } from '@/lib/supabaseService';

export async function deleteProductAction(productId: string) {
  const supabase = getSupabaseServiceClient();

  // Check if product has orders (via variants -> order_lines)
  const { data: variants } = await supabase
    .from('variants')
    .select('id')
    .eq('product_id', productId);

  if (variants && variants.length > 0) {
    const variantIds = variants.map((v: any) => v.id);
    const { count } = await supabase
      .from('order_lines')
      .select('id', { count: 'exact', head: true })
      .in('variant_id', variantIds);

    if (count && count > 0) {
      return { 
        success: false, 
        error: `Cannot delete: This product has ${count} order(s). Deactivate it instead.` 
      };
    }
  }

  // Clear session references (set to null instead of delete)
  await supabase
    .from('sessions')
    .update({ entry_product_id: null })
    .eq('entry_product_id', productId);

  // Delete related records first (foreign key constraints)
  // Delete product_pixel
  await supabase.from('product_pixel').delete().eq('product_id', productId);
  
  // Delete variants
  await supabase.from('variants').delete().eq('product_id', productId);
  
  // Delete landing_pages
  await supabase.from('landing_pages').delete().eq('product_id', productId);

  // Delete the product
  const { error } = await supabase.from('products').delete().eq('id', productId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/products');
  return { success: true };
}
