import { getSupabaseServerClient } from '@/lib/supabaseServer';
import BuyPanel from '@/components/web/landing/BuyPanel';
import dynamic from 'next/dynamic';
const ReviewsSection = dynamic(() => import('@/components/web/reviews/ReviewsSection'), { ssr: false });
const ReviewSummary = dynamic(() => import('@/components/web/reviews/ReviewSummary'), { ssr: false });
import Image from 'next/image';
import ImageGallery, { type MediaItem } from '@/components/web/product/ImageGallery';
import UTMCapture from '@/components/web/landing/UTMCapture';
import LPViewPixel from '@/components/web/pixel/LPViewPixel';
import SocialLinks from '@/components/web/landing/SocialLinks';
import TrackedVideo from '@/components/web/landing/TrackedVideo';
import LpGa4Tracker from '@/components/web/ga4/LpGa4Tracker';

// Render helper: if the string looks like HTML, inject as HTML. Otherwise, render paragraphs
// and preserve single line breaks. Urdu is rendered RTL with the Urdu font class.
function renderDescriptionBlock(text: string, lang: 'en' | 'ur') {
  if (!text) return null;
  const looksLikeHtml = /<[^>]+>/.test(text);
  const baseCls = 'prose max-w-none';
  const dir = lang === 'ur' ? 'rtl' : undefined;
  const langCls = lang === 'ur' ? 'font-urdu' : '';

  if (looksLikeHtml) {
    return (
      <div className={`${baseCls} ${langCls}`} dir={dir} dangerouslySetInnerHTML={{ __html: text }} />
    );
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className={`${baseCls} ${langCls}`} dir={dir}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split(/\n/).map((line, j) => (
            <>
              {j > 0 && <br />}
              {line}
            </>
          ))}
        </p>
      ))}
    </div>
  );
}

// Render spec value with basic URL linkification
function renderSpecValue(value: string) {
  if (!value) return null;
  const parts = value.split(/(https?:\/\/[^\s]+|www\.[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        const isUrl = /^(https?:\/\/|www\.)/.test(part);
        if (!isUrl) return <span key={i}>{part}</span>;
        const href = part.startsWith('http') ? part : `https://${part}`;
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-words">
            {part}
          </a>
        );
      })}
    </>
  );
}

async function fetchLpData(slug: string) {
  const supabase = getSupabaseServerClient();
  // 1) Product by slug
  const { data: product } = await supabase
    .from('products')
    .select('id, name, slug, description_en, description_ur, active, logo_url, daraz_enabled, daraz_url, daraz_trust_line, chat_enabled, chat_facebook_url, chat_instagram_url, special_message, cta_label, cta_size, fb_page_url, instagram_url, whatsapp_url, contact_email, contact_phone, fb_page_enabled, instagram_enabled, whatsapp_enabled, contact_email_enabled, contact_phone_enabled, ga4_enabled_override, ga4_measurement_id_override')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();
  if (!product?.id) return null;

  // 1b) Media for top gallery
  const { data: mediaRows } = await supabase
    .from('product_media')
    .select('type, url, thumb_url, poster_url, alt, sort')
    .eq('product_id', product.id)
    .order('sort', { ascending: true });
  const mediaItems: MediaItem[] = (mediaRows ?? []).map((m: any) =>
    m.type === 'video'
      ? ({ type: 'video', src: m.url as string, poster: m.poster_url as string | undefined, alt: m.alt as string | undefined })
      : ({ type: 'image', src: m.url as string, alt: m.alt as string | undefined, thumb: (m.thumb_url as string | undefined) })
  );

  // 2) Active variants (id, sku, price, thumb_url)
  const { data: variants } = await supabase
    .from('variants')
    .select('id, sku, price, active, thumb_url')
    .eq('product_id', product.id)
    .eq('active', true)
    .order('price', { ascending: true });

  // 3) Availability via view (derived Reserved from open orders)
  // Build list of SKUs for the product's active variants, then read availability per SKU from inventory_overview
  const skusForProduct = (variants ?? []).map((v: any) => v.sku).filter(Boolean);
  const availabilityByVariant: Record<string, number> = {};
  if (skusForProduct.length) {
    const { data: invView } = await supabase
      .from('inventory_overview')
      .select('sku, available')
      .in('sku', skusForProduct);
    const availBySku = new Map<string, number>();
    for (const row of invView ?? []) {
      const sku = (row as any).sku as string;
      const avail = Number((row as any).available) || 0;
      availBySku.set(sku, avail);
    }
    for (const v of variants ?? []) {
      const sku = (v as any).sku as string;
      const id = (v as any).id as string;
      availabilityByVariant[id] = availBySku.get(sku) ?? 0;
    }
  }

  // 4) Map variant -> option values (Color/Model/Package)
  const { data: colorType } = await supabase
    .from('option_types')
    .select('id')
    .eq('name', 'Color')
    .maybeSingle();
  const { data: modelType } = await supabase
    .from('option_types')
    .select('id')
    .eq('name', 'Model')
    .maybeSingle();
  const { data: packageType } = await supabase
    .from('option_types')
    .select('id')
    .eq('name', 'Package')
    .maybeSingle();
  const { data: sizeType } = await supabase
    .from('option_types')
    .select('id')
    .eq('name', 'Size')
    .maybeSingle();
  const colorTypeId = colorType?.id as string | undefined;
  const modelTypeId = modelType?.id as string | undefined;
  const packageTypeId = packageType?.id as string | undefined;
  const sizeTypeId = sizeType?.id as string | undefined;

  const variantIds = (variants ?? []).map((v: any) => v.id);
  let colorByVariant: Record<string, string> = {};
  let modelByVariant: Record<string, string> = {};
  let packageByVariant: Record<string, string> = {};
  let sizeByVariant: Record<string, string> = {};
  if (variantIds.length) {
    const { data: mapping, error: mapErr } = await supabase
      .from('variant_option_values')
      .select('variant_id, option_values!variant_option_values_option_value_id_fkey(value, option_type_id)')
      .in('variant_id', variantIds);
    if (mapErr) throw mapErr;
    for (const row of mapping ?? []) {
      const vId = (row as any).variant_id as string;
      const ov = (row as any).option_values as any;
      if (!ov) continue;
      if (colorTypeId && ov.option_type_id === colorTypeId && ov.value) colorByVariant[vId] = ov.value as string;
      if (modelTypeId && ov.option_type_id === modelTypeId && ov.value) modelByVariant[vId] = ov.value as string;
      if (packageTypeId && ov.option_type_id === packageTypeId && ov.value) packageByVariant[vId] = ov.value as string;
      if (sizeTypeId && ov.option_type_id === sizeTypeId && ov.value) sizeByVariant[vId] = ov.value as string;
    }
  }

  // 5) Aggregate combinations (Color x Model x Package x Size)
  const key = (c?: string, m?: string, p?: string, s?: string) => `${c || ''}|${m || ''}|${p || ''}|${s || ''}`;
  const matrix: Record<string, { price: number; availability: number; variantId: string } > = {};
  const colorsSet = new Set<string>();
  const modelsSet = new Set<string>();
  const packagesSet = new Set<string>();
  const sizesSet = new Set<string>();
  for (const v of variants ?? []) {
    const id = (v as any).id as string;
    const price = Number((v as any).price);
    const color = colorByVariant[id] ?? ((((v as any).sku || '').split('-')[1]) || 'Default');
    const model = modelByVariant[id];
    const pack = packageByVariant[id];
    const size = sizeByVariant[id];
    colorsSet.add(color);
    if (model) modelsSet.add(model);
    if (pack) packagesSet.add(pack);
    if (size) sizesSet.add(size);
    const k = key(color, model, pack, size);
    const avail = availabilityByVariant[id] ?? 0;
    if (!matrix[k]) {
      matrix[k] = { price, availability: avail, variantId: id };
    } else {
      // If duplicate combo, keep lowest price and sum availability
      matrix[k].price = Math.min(matrix[k].price, price);
      matrix[k].availability += avail;
      if (price <= matrix[k].price) matrix[k].variantId = id;
    }
  }
  const colors = Array.from(colorsSet).sort();
  const models = Array.from(modelsSet).sort();
  const packages = Array.from(packagesSet).sort();
  const sizes = Array.from(sizesSet).sort();

  // 6) Specs (grouped, bilingual)
  const { data: specs } = await supabase
    .from('product_specs')
    .select('group, label, value, lang, sort')
    .eq('product_id', product.id)
    .order('group', { ascending: true })
    .order('sort', { ascending: true });

  // 7) Bottom sections (long-form)
  const { data: sections } = await supabase
    .from('product_sections')
    .select('type, title, body, media_refs, sort')
    .eq('product_id', product.id)
    .order('sort', { ascending: true });

  // 8) Promotions for this product
  const { data: promos } = await supabase
    .from('product_promotions')
    .select('id, name, active, type, min_qty, discount_pct, free_qty, start_at, end_at')
    .eq('product_id', product.id)
    .order('created_at', { ascending: true });

  // 9) GA4 global settings (singleton row)
  const { data: appSettings } = await supabase
    .from('app_settings')
    .select('ga4_measurement_id, ga4_enabled_default')
    .limit(1)
    .maybeSingle();

  // 7b) Build accurate color -> thumbnail map using real option mappings
  const colorThumbs: Record<string, string | undefined> = {};
  if (variants && variants.length) {
    // Build reverse: color value -> list of variants
    const byColor: Record<string, any[]> = {};
    for (const v of variants as any[]) {
      const id = v.id as string;
      // Reuse same color resolution logic as matrix: prefer mapped color, otherwise derive from SKU or 'Default'
      const color = colorByVariant[id] ?? ((((v as any).sku || '').split('-')[1]) || 'Default');
      if (!color) continue;
      if (!byColor[color]) byColor[color] = [];
      byColor[color].push(v);
    }
    for (const c of colors) {
      const arr = byColor[c] || [];
      const withThumb = arr.find((v:any)=>v.thumb_url);
      colorThumbs[c] = (withThumb?.thumb_url as string | undefined) || undefined;
    }
  }

  const hasColorDimension = Object.keys(colorByVariant).length > 0;

  return {
    product,
    mediaItems,
    variants: variants ?? [],
    colors,
    models,
    packages,
    sizes,
    matrix,
    colorThumbs,
    specs: specs ?? [],
    sections: sections ?? [],
    promotions: promos || [],
    hasColorDimension,
    gaGlobal: appSettings ? { ga4_measurement_id: (appSettings as any).ga4_measurement_id || null, ga4_enabled_default: (appSettings as any).ga4_enabled_default ?? true } : null,
    gaProduct: { ga4_enabled_override: (product as any).ga4_enabled_override ?? null, ga4_measurement_id_override: (product as any).ga4_measurement_id_override || null },
    // load per-product meta pixel config
    pixel: (await (async ()=>{
      const { data: px } = await supabase
        .from('product_pixel')
        .select('enabled, pixel_id, content_id_source, events')
        .eq('product_id', product.id)
        .maybeSingle();
      return px || null;
    })()),
  } as const;
}

// Lightweight renderer for long-form sections (text/video/image)
function Section({ item, productId, productName }: { item: { type?: string; title?: string | null; body?: string | null; media_refs?: string[] | null }; productId?: string; productName?: string }) {
  const t = (item?.type || '').toLowerCase();
  const title = item?.title || '';
  const body = item?.body || '';
  const media = Array.isArray(item?.media_refs) ? item!.media_refs! : [];
  return (
    <section className="space-y-2">
      {title && <h3 className="text-lg font-medium">{title}</h3>}
      {body && <div className="text-sm text-gray-700 whitespace-pre-wrap">{body}</div>}
      {t === 'image' && media.length > 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media[0] as string} alt={title || 'section image'} className="w-full h-auto rounded border" />
      )}
      {t === 'video' && media.length > 0 && (
        <TrackedVideo
          src={media[0] as string}
          className="w-full h-auto rounded border"
          productId={productId}
          productName={productName}
          location="section"
        />
      )}
    </section>
  );
}

export default async function LandingPage({ params }: { params: { slug: string } }) {
  const data = await fetchLpData(params.slug);
  if (!data) {
    return <div className="p-6">Landing page not found.</div>;
  }

  const { product, mediaItems, colors, models, packages, sizes, matrix, specs, sections, colorThumbs, variants, pixel, promotions, hasColorDimension, gaGlobal, gaProduct } = data as any;
  // Build Product JSON-LD for SEO (uses existing product + variants + availability data)
  const site = 'https://afalstore.com';
  const canonical = `${site}/lp/${product.slug}`;
  const images = (mediaItems || []).filter((m: any) => m.type === 'image').map((m: any) => m.src);
  const lowest = (variants || []).reduce((min: number, v: any) => Math.min(min, Number(v.price || Infinity)), Infinity);
  const offerPrice = Number.isFinite(lowest) ? lowest : undefined;
  const anyAvail = Object.values(matrix || {}).some((m: any) => (m?.availability || 0) > 0);
  const availability = anyAvail ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: (product as any).description_en || undefined,
    image: images.slice(0, 4),
    sku: (variants?.[0]?.sku) || undefined,
    brand: { '@type': 'Brand', name: 'Afal' },
    offers: offerPrice
      ? {
          '@type': 'Offer',
          url: canonical,
          priceCurrency: 'PKR',
          price: Number(offerPrice.toFixed(2)),
          availability,
          itemCondition: 'https://schema.org/NewCondition',
        }
      : undefined,
  } as const;

  // Aggregate total available units across the matrix for simple "limited stock" messaging
  const totalAvailability = Object.values(matrix || {}).reduce(
    (sum: number, m: any) => sum + Number(m?.availability || 0),
    0,
  );
  const isLimitedStock = totalAvailability > 0 && totalAvailability <= 20;

  // Check if there is any currently-active, time-bounded promotion
  const now = new Date();
  const hasTimeLimitedPromo = (promotions || []).some((p: any) => {
    if (!p || !p.active) return false;
    // Only treat promos with an explicit end_at as "ending soon"
    if (!p.end_at) return false;
    const startOk = p.start_at ? now >= new Date(p.start_at) : true;
    const endOk = now <= new Date(p.end_at);
    return startOk && endOk;
  });

  // Helpers for BuyPanel and tracking
  const contentIdSource = pixel && pixel.content_id_source === 'variant_id' ? 'variant_id' : 'sku';
  const variantSkuMap: Record<string, string> = Object.fromEntries(
    ((variants || []) as any[]).map((v: any) => [v.id, v.sku]),
  );
  const ctaLabel = (product as any).cta_label || 'Buy on AFAL';
  const ctaSize = ((product as any).cta_size as string | null) || 'medium';

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-5 md:p-6 grid grid-cols-1 lg:grid-cols-[680px_1fr] gap-3 sm:gap-6 lg:gap-8 items-start">
      <UTMCapture />
      <LpGa4Tracker
        globalGa={gaGlobal || null}
        productGa={gaProduct || null}
        product={{ id: product.id, slug: product.slug, name: product.name }}
        variants={(variants || []).map((v: any) => ({
          id: v.id as string,
          sku: (v.sku as string | null) ?? null,
          price: v.price != null ? Number(v.price) : null,
        }))}
      />
      {/* Meta Pixel: ViewContent */}
      <LPViewPixel
        productId={product.id}
        productName={product.name}
        variants={(variants||[]).map((v:any)=>({ id: v.id, sku: v.sku, price: v.price }))}
        config={pixel ? {
          enabled: !!pixel.enabled,
          pixel_id: pixel.pixel_id || null,
          content_id_source: (pixel.content_id_source === 'variant_id' ? 'variant_id' : 'sku'),
          events: pixel.events || { view_content: true },
        } : null}
      />
      {/* Page title spans both columns on desktop so aside aligns with gallery, not the title */}
      <header className="space-y-1 lg:col-span-2 mb-1 lg:mb-2">
        <div className="flex flex-row items-center text-left gap-2.5 lg:flex-row lg:items-center lg:text-left lg:gap-4">
          {product.logo_url && (
            <img
              src={product.logo_url as string}
              alt="Logo"
              className="h-9 lg:h-14 w-auto object-contain rounded border bg-white p-1 shadow-sm"
            />
          )}
          <div className="space-y-1">
            <h1 className="text-sm sm:text-lg lg:text-2xl font-semibold max-w-[36ch] leading-tight">{product.name}</h1>
            <p className="text-xs sm:text-sm text-gray-700 mt-0.5 font-medium">Cash on Delivery · 24–48h Dispatch · Easy Returns</p>
            <p className="text-[11px] sm:text-xs text-gray-500">Trusted by real buyers in Pakistan</p>
          </div>
        </div>
        <div className="mt-1 hidden lg:block">
          <ReviewSummary productId={product.id} />
        </div>
      </header>
      {/* Left: Gallery + Content */}
      <div className="space-y-4 lg:space-y-8">

        {/* Media Gallery */}
        <section>
          {mediaItems.length > 0 ? (
            <ImageGallery items={mediaItems} productId={product.id} productName={product.name} />
          ) : (
            <div className="aspect-[1/1] w-full grid place-items-center border rounded text-sm text-gray-500">No media yet</div>
          )}
        </section>

        {/* Mobile Buy panel: visible only on small screens */}
        <div className="block lg:hidden" id="lp-order-card-mobile">
          {(hasTimeLimitedPromo || isLimitedStock) && (
            <div className="mb-3 space-y-1">
              {hasTimeLimitedPromo && (
                <div className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 border border-red-200">
                  Offer ends soon
                </div>
              )}
              {isLimitedStock && (
                <div className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                  Limited stock
                </div>
              )}
            </div>
          )}
          <BuyPanel
            colors={colors}
            models={models}
            packages={packages}
            sizes={sizes}
            matrix={matrix}
            colorThumbs={colorThumbs}
            logoUrl={(product as any).logo_url as string | null}
            specialMessage={(product as any).special_message as string | null}
            darazUrl={((product as any).daraz_enabled ? (product as any).daraz_url : null) as string | null}
            darazTrustLine={Boolean((product as any).daraz_trust_line)}
            chatFacebookUrl={((product as any).chat_enabled ? (product as any).chat_facebook_url : null) as string | null}
            chatInstagramUrl={((product as any).chat_enabled ? (product as any).chat_instagram_url : null) as string | null}
            contentIdSource={contentIdSource as any}
            variantSkuMap={variantSkuMap}
            ctaLabel={ctaLabel}
            ctaSize={ctaSize as any}
            promotions={promotions as any}
            hasColorDimension={hasColorDimension}
          />
          <ReviewSummary productId={product.id} />
        </div>

        {(specs && specs.length > 0) && (() => {
          const highlightsEn = (specs as any[]).filter(r => r.group === 'Highlights' && r.lang === 'en').map(r => r.label).filter(Boolean);
          const highlightsUr = (specs as any[]).filter(r => r.group === 'Highlights' && r.lang === 'ur').map(r => r.label).filter(Boolean);
          if (highlightsEn.length === 0 && highlightsUr.length === 0) return null;
          return (
            <section className="space-y-4">
              {highlightsEn.length > 0 && (
                <div>
                  <h2 className="text-xl font-medium mb-2">Key Benefits</h2>
                  <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
                    {highlightsEn.map((h, i) => (<li key={i}>{h}</li>))}
                  </ul>
                </div>
              )}
              {highlightsUr.length > 0 && (
                <div dir="rtl" className="font-urdu">
                  <h2 className="text-xl font-medium mb-2">اہم خصوصیات</h2>
                  <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
                    {highlightsUr.map((h, i) => (<li key={i}>{h}</li>))}
                  </ul>
                </div>
              )}
            </section>
          );
        })()}

        {/* Bilingual Description (DB-backed, optional) */}
        <section className="space-y-6">
          {product.description_en && (
            <div>
              <h2 className="text-lg font-medium mb-2">Description (English)</h2>
              {renderDescriptionBlock(product.description_en as any, 'en')}
            </div>
          )}
          {product.description_ur && (
            <div dir="rtl" className="font-urdu">
              <h2 className="text-lg font-medium mb-2">تفصیل (اردو)</h2>
              {renderDescriptionBlock(product.description_ur as any, 'ur')}
            </div>
          )}
        </section>

        {/* Social & Contact links (mobile first) */}
        <div className="block lg:hidden">
          <SocialLinks
            fbPageUrl={(product as any).fb_page_url as string | null}
            instagramUrl={(product as any).instagram_url as string | null}
            whatsappUrl={(product as any).whatsapp_url as string | null}
            contactEmail={(product as any).contact_email as string | null}
            contactPhone={(product as any).contact_phone as string | null}
            fbPageEnabled={Boolean((product as any).fb_page_enabled)}
            instagramEnabled={Boolean((product as any).instagram_enabled)}
            whatsappEnabled={Boolean((product as any).whatsapp_enabled)}
            contactEmailEnabled={Boolean((product as any).contact_email_enabled)}
            contactPhoneEnabled={Boolean((product as any).contact_phone_enabled)}
            productId={product.id}
            productName={product.name}
          />
        </div>

        {/* Specifications (dynamic) */}
        {specs && specs.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-xl font-medium">Specifications</h2>
            {(['en','ur'] as const).map((lng) => {
              const groups = new Map<string, { label: string; value: string }[]>();
              for (const row of specs as any[]) {
                if (row.lang !== lng) continue;
                const g = row.group || 'Specs';
                if (!groups.has(g)) groups.set(g, []);
                groups.get(g)!.push({ label: row.label, value: row.value });
              }
              if (groups.size === 0) return null;
              return (
                <div key={lng} dir={lng === 'ur' ? 'rtl' : undefined} className={lng === 'ur' ? 'font-urdu' : ''}>
                  {Array.from(groups.entries()).map(([g, rows]: [string, { label: string; value: string }[]]) => (
                    <div key={g} className="mb-4">
                      <h3 className="font-medium mb-2">{g}</h3>
                      <table className="w-full text-sm text-gray-700 table-fixed border-t">
                        <tbody>
                          {rows.map((r: { label: string; value: string }, i: number) => (
                            <tr key={i} className={`border-b ${i % 2 === 1 ? 'bg-gray-50' : ''}`}>
                              <td className="py-2 pr-4 font-medium whitespace-normal break-words after:content-[':'] after:ml-1 align-top w-1/3">{r.label}</td>
                              <td className="py-2 pl-2 align-top w-2/3 break-words">{renderSpecValue(r.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        )}

        {/* Bottom sections */}
        {sections && sections.length > 0 && (
          <section className="space-y-8 lg:space-y-10">
            {(sections || []).map((s: any, idx: number) => (
              <Section key={idx} item={s} productId={product.id} productName={product.name} />
            ))}
          </section>
        )}

        {/* Secondary CTA after video / content sections */}
        <div className="mt-4">
          <a href="#lp-order-card-desktop" className="inline-flex items-center justify-center rounded-md bg-black px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2">
            {ctaLabel}
          </a>
        </div>

        {/* Hide floating CTA near reviews on mobile */}
        <div id="lp-bottom-sentinel" className="h-1"></div>
        {/* Extra spacer so the floating Buy panel doesn't cover the top of reviews on mobile */}
        <div className="h-16 lg:h-0"></div>
        {/* Reviews */}
        <div className="pt-4">
          <ReviewsSection productId={product.id} />
        </div>
        {/* Secondary CTA after reviews */}
        <div className="mt-4">
          <a href="#lp-order-card-desktop" className="inline-flex items-center justify-center rounded-md bg-black px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2">
            {ctaLabel}
          </a>
        </div>
        {/* Mobile-only footer spacer with small text */}
        <div className="block lg:hidden text-center text-xs text-gray-400 py-28">afalstore</div>
      </div>

      {/* Right: Sticky Buy panel (desktop only) */}
      <aside className="hidden lg:block" id="lp-order-card-desktop">
        {/* Sticky Buy panel aligned with gallery top */}
        <div className="lg:sticky lg:top-20 space-y-3">
          {(hasTimeLimitedPromo || isLimitedStock) && (
            <div className="space-y-1">
              {hasTimeLimitedPromo && (
                <div className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 border border-red-200">
                  Offer ends soon
                </div>
              )}
              {isLimitedStock && (
                <div className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                  Limited stock
                </div>
              )}
            </div>
          )}
          <BuyPanel
            colors={colors}
            models={models}
            packages={packages}
            sizes={sizes}
            matrix={matrix}
            colorThumbs={colorThumbs}
            logoUrl={(product as any).logo_url as string | null}
            specialMessage={(product as any).special_message as string | null}
            darazUrl={((product as any).daraz_enabled ? (product as any).daraz_url : null) as string | null}
            darazTrustLine={Boolean((product as any).daraz_trust_line)}
            chatFacebookUrl={((product as any).chat_enabled ? (product as any).chat_facebook_url : null) as string | null}
            chatInstagramUrl={((product as any).chat_enabled ? (product as any).chat_instagram_url : null) as string | null}
            ctaLabel={ctaLabel}
            ctaSize={ctaSize as any}
            promotions={promotions as any}
            hasColorDimension={hasColorDimension}
          />
          <ReviewSummary productId={product.id} />
          <SocialLinks
            fbPageUrl={(product as any).fb_page_url as string | null}
            instagramUrl={(product as any).instagram_url as string | null}
            whatsappUrl={(product as any).whatsapp_url as string | null}
            contactEmail={(product as any).contact_email as string | null}
            contactPhone={(product as any).contact_phone as string | null}
            fbPageEnabled={Boolean((product as any).fb_page_enabled)}
            instagramEnabled={Boolean((product as any).instagram_enabled)}
            whatsappEnabled={Boolean((product as any).whatsapp_enabled)}
            contactEmailEnabled={Boolean((product as any).contact_email_enabled)}
            contactPhoneEnabled={Boolean((product as any).contact_phone_enabled)}
          />
        </div>
      </aside>
      {/* (sentinel moved above reviews) */}
      {/* JSON-LD: Product */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const supabase = getSupabaseServerClient();
  const { data: product } = await supabase
    .from('products')
    .select('name, description_en, active, slug')
    .eq('slug', params.slug)
    .eq('active', true)
    .maybeSingle();
  const title = product?.name ? `${product.name} – Afal Store` : 'Afal Store';
  const description = (product as any)?.description_en || 'Premium Android Tag compatible with Google Find My Device. Waterproof, long battery, compact.';
  // Prefer first product image as OG image
  let ogImage = '/images/2c6e7458128b076e82bd99f52ab130c8.avif';
  if (product?.slug) {
    const { data: media } = await supabase
      .from('product_media')
      .select('url, type, sort')
      .eq('product_id', (await supabase.from('products').select('id').eq('slug', product.slug).maybeSingle()).data?.id)
      .order('sort', { ascending: true });
    const firstImg = (media||[]).find((m:any)=>m.type==='image');
    if (firstImg?.url) ogImage = firstImg.url as string;
  }
  const site = 'https://afalstore.com';
  const canonical = product?.slug ? `${site}/lp/${product.slug}` : site;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      url: canonical,
      title,
      description,
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  } as const;
}
