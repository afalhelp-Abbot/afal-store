'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServiceClient } from '@/lib/supabaseService';

export async function deleteProductAction(productId: string) {
  const supabase = getSupabaseServiceClient();

  // Delete related records first (foreign key constraints)
  // Delete product_pixel
  await supabase.from('product_pixel').delete().eq('product_id', productId);
  
  // Delete variants (this will cascade to order_lines if set up, otherwise may fail)
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
