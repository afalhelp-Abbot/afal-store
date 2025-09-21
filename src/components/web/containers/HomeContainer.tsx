'use client';

import React from 'react';
import HomePresenter from '../presenters/HomePresenter';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

export default function HomeContainer() {
  const [startingPrice, setStartingPrice] = React.useState<number | null>(null);
  const [colorPrices, setColorPrices] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    let mounted = true;
    async function run() {
      const { data: product } = await supabaseBrowser
        .from('products')
        .select('id')
        .eq('slug', 'air-tag')
        .maybeSingle();
      if (!product?.id) return;
      const { data, error } = await supabaseBrowser
        .from('variants')
        .select('id, price')
        .eq('product_id', product.id)
        .eq('active', true)
        .order('price', { ascending: true })
      ;
      if (!error && data && data.length) {
        if (mounted) setStartingPrice(Number(data[0].price));
        // fetch Color option_type id
        const { data: colorType } = await supabaseBrowser
          .from('option_types')
          .select('id')
          .eq('name', 'Color')
          .maybeSingle();
        const colorTypeId = colorType?.id;
        if (!colorTypeId) {
          return;
        }
        // fetch color mapping for these variants, filtered by Color type id
        const variantIds = data.map((v: any) => v.id);
        const { data: mapping } = await supabaseBrowser
          .from('variant_option_values')
          .select('variant_id, option_values(value, option_type_id)')
          .in('variant_id', variantIds)
          .eq('option_values.option_type_id', colorTypeId);
        const prices: Record<string, number> = {};
        for (const row of mapping ?? []) {
          const optionValues = (row as any).option_values;
          const color = String(optionValues?.value || '').trim();
          const variantId = (row as any).variant_id as string;
          const v = (data as any[]).find((x: any) => x.id === variantId);
          if (color && v) prices[color] = Number(v.price);
        }
        if (mounted) setColorPrices(prices);
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, []);

  const handleAddToCart = () => {
    // Cart functionality will be added later
    console.log('Add to cart clicked');
  };

  return (
    <HomePresenter 
      startingPrice={startingPrice}
      colorPrices={colorPrices}
      onAddToCart={handleAddToCart}
    />
  );
}
