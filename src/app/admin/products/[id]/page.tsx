"use client";

  import { useEffect, useMemo, useState } from 'react';
  import { useParams, useRouter } from 'next/navigation';
  import { supabaseBrowser } from '@/lib/supabaseBrowser';
  import HelpTip from '@/components/admin/HelpTip';
  import RichTextEditor from '@/components/admin/RichTextEditor';
  import { slugify } from '@/lib/slugify';
  import ProductMetaPixelModal from '@/components/admin/ProductMetaPixelModal';

const BUCKET = 'product-media';
const MAX_IMAGE_MB = 10; // client-side hint, actual limit enforced by storage
const MAX_VIDEO_MB = 50; // typical Supabase per-file cap on lower tiers

type Product = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  description_en: string | null;
  description_ur: string | null;
  logo_url: string | null;
  daraz_enabled?: boolean;
  daraz_url?: string | null;
  chat_enabled?: boolean;
  chat_facebook_url?: string | null;
  chat_instagram_url?: string | null;
  special_message?: string | null;
  daraz_trust_line?: boolean;
  fb_page_url?: string | null;
  instagram_url?: string | null;
  whatsapp_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  fb_page_enabled?: boolean | null;
  instagram_enabled?: boolean | null;
  whatsapp_enabled?: boolean | null;
  contact_email_enabled?: boolean | null;
  contact_phone_enabled?: boolean | null;
};

type Media = {
  id: string;
  product_id: string;
  type: 'image' | 'video';
  url: string;
  thumb_url: string | null;
  poster_url: string | null;
  alt: string | null;
  sort: number;
};

type SpecRow = {
  id: string;
  product_id: string;
  group: string | null;
  label: string;
  value: string;
  lang: 'en' | 'ur';
  sort: number;
};

type SectionRow = {
  id: string;
  product_id: string;
  type: 'image' | 'gallery' | 'video' | 'rich_text';
  title: string | null;
  body: string | null;
  media_refs: any;
  sort: number;
};

type PromotionRow = {
  id: string;
  product_id: string;
  name: string;
  active: boolean;
  type: 'percent' | 'bxgy';
  min_qty: number;
  discount_pct: number | null;
  free_qty: number | null;
  start_at: string | null; // ISO string
  end_at: string | null;   // ISO string
};

export default function EditProductPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoAdvice, setVideoAdvice] = useState<{
    name: string;
    sizeMB: number;
    durationSec: number | null;
    targetBitrateKbps: number | null;
  } | null>(null);

  // Analyze selected video with simple size validation (duration-based advice omitted for now)
  const analyzeVideo = async (file: File) => {
    try {
      const sizeMB = Number((file.size / (1024 * 1024)).toFixed(1));
      // Basic advice: just show file size
      setVideoAdvice({ name: file.name, sizeMB, durationSec: null, targetBitrateKbps: null });

      // Immediate size guard
      if (sizeMB > MAX_VIDEO_MB) {
        setError(`Selected video is ${sizeMB} MB which exceeds the ${MAX_VIDEO_MB} MB limit. Please compress and try again.`);
        setVideoReady(false);
        return;
      }

      // If under limit, mark as ready; skip metadata-based bitrate calculation for now
      setVideoReady(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to analyze video');
    }
  };

  const addEmptyPromotion = () => {
    if (!product) return;
    setPromotions((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        product_id: product.id,
        name: '',
        active: true,
        type: 'percent',
        min_qty: 1,
        discount_pct: 5,
        free_qty: null,
        start_at: null,
        end_at: null,
      },
    ]);
  };

  const updatePromotionField = (id: string, patch: Partial<PromotionRow>) => {
    setPromotions((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePromotionLocal = (id: string) => {
    setPromotions((prev) => prev.filter((p) => p.id !== id));
  };

  const savePromotions = async () => {
    if (!product) return;
    setSavingPromos(true);
    setError(null);
    try {
      const rows = promotions;
      // Basic validation: ensure each row has required fields depending on type
      for (const r of rows) {
        if (!r.name.trim()) throw new Error('Each promotion must have a name.');
        if (!r.min_qty || r.min_qty <= 0) throw new Error('Promotion min quantity must be greater than 0.');
        if (r.type === 'percent') {
          if (!r.discount_pct || r.discount_pct <= 0) throw new Error('Percent promotions require a positive discount %.');
        } else {
          if (!r.free_qty || r.free_qty <= 0) throw new Error('Buy X Get Y promotions require Y (free units) > 0.');
        }
      }

      // Upsert all rows (server will assign ids for new ones). For new/local rows
      // we must NOT send an id field at all, otherwise Postgres will treat it as
      // explicit null and violate the NOT NULL constraint.
      const payload = rows.map((r) => {
        const base: any = {
          product_id: product.id,
          name: r.name.trim(),
          active: r.active,
          type: r.type,
          min_qty: r.min_qty,
          discount_pct: r.type === 'percent' ? (r.discount_pct ?? null) : null,
          free_qty: r.type === 'bxgy' ? (r.free_qty ?? null) : null,
          start_at: r.start_at ? new Date(r.start_at) : null,
          end_at: r.end_at ? new Date(r.end_at) : null,
        };
        if (!r.id.startsWith('local-')) {
          base.id = r.id;
        }
        return base;
      });

      const { data, error } = await supabaseBrowser
        .from('product_promotions')
        .upsert(payload, { onConflict: 'id' })
        .select('id, product_id, name, active, type, min_qty, discount_pct, free_qty, start_at, end_at');
      if (error) throw error;

      setPromotions(((data || []) as any[]).map((p) => ({
        id: String(p.id),
        product_id: String(p.product_id),
        name: p.name || '',
        active: !!p.active,
        type: (p.type === 'bxgy' ? 'bxgy' : 'percent') as 'percent' | 'bxgy',
        min_qty: Number(p.min_qty || 1),
        discount_pct: p.discount_pct !== null && p.discount_pct !== undefined ? Number(p.discount_pct) : null,
        free_qty: p.free_qty !== null && p.free_qty !== undefined ? Number(p.free_qty) : null,
        start_at: p.start_at ? new Date(p.start_at as string).toISOString().slice(0, 16) : null,
        end_at: p.end_at ? new Date(p.end_at as string).toISOString().slice(0, 16) : null,
      })));
    } catch (e: any) {
      setError(e?.message || 'Failed to save promotions');
    } finally {
      setSavingPromos(false);
    }
  };

  const [product, setProduct] = useState<Product | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [colorTypeId, setColorTypeId] = useState<string | null>(null);
  const [sizeTypeId, setSizeTypeId] = useState<string | null>(null);
  const [modelTypeId, setModelTypeId] = useState<string | null>(null);
  const [packageTypeId, setPackageTypeId] = useState<string | null>(null);
  const [colors, setColors] = useState<Array<{ id: number; value: string }>>([]);
  const [sizes, setSizes] = useState<Array<{ id: number; value: string }>>([]);
  const [models, setModels] = useState<Array<{ id: number; value: string }>>([]);
  const [packages, setPackages] = useState<Array<{ id: number; value: string }>>([]);
  const [enableColor, setEnableColor] = useState<boolean>(true);
  const [enableSize, setEnableSize] = useState<boolean>(false);
  const [enableModel, setEnableModel] = useState<boolean>(false);
  const [enablePackage, setEnablePackage] = useState<boolean>(false);
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [savingPromos, setSavingPromos] = useState(false);

  // Local form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [active, setActive] = useState(false);
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionUr, setDescriptionUr] = useState('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  // Checkout Extras state
  const [darazEnabled, setDarazEnabled] = useState(false);
  const [darazUrl, setDarazUrl] = useState<string>('');
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatFacebookUrl, setChatFacebookUrl] = useState<string>('');
  const [chatInstagramUrl, setChatInstagramUrl] = useState<string>('');
  const [specialMessage, setSpecialMessage] = useState<string>('');
  const [darazTrustLine, setDarazTrustLine] = useState<boolean>(false);
  const [ctaLabel, setCtaLabel] = useState<string>('');
  const [ctaSize, setCtaSize] = useState<'small' | 'medium' | 'large'>('medium');
  // Social media & contact state
  const [fbPageUrl, setFbPageUrl] = useState<string>('');
  const [instagramUrl, setInstagramUrl] = useState<string>('');
  const [whatsappUrl, setWhatsappUrl] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [fbPageEnabled, setFbPageEnabled] = useState<boolean>(false);
  const [instagramEnabled, setInstagramEnabled] = useState<boolean>(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean>(false);
  const [contactEmailEnabled, setContactEmailEnabled] = useState<boolean>(false);
  const [contactPhoneEnabled, setContactPhoneEnabled] = useState<boolean>(false);
  // snapshot of loaded basics
  const [initialBasics, setInitialBasics] = useState<{ name: string; slug: string; active: boolean; descriptionEn: string; descriptionUr: string; logoUrl: string; darazEnabled: boolean; darazUrl: string; darazTrustLine: boolean; chatEnabled: boolean; chatFacebookUrl: string; chatInstagramUrl: string; specialMessage: string; fbPageUrl: string; instagramUrl: string; whatsappUrl: string; contactEmail: string; contactPhone: string; fbPageEnabled: boolean; instagramEnabled: boolean; whatsappEnabled: boolean; contactEmailEnabled: boolean; contactPhoneEnabled: boolean; ctaLabel: string; ctaSize: 'small' | 'medium' | 'large' } | null>(null);
  // dirty flags for variants and add-variant form
  const [variantsDirtyFlag, setVariantsDirtyFlag] = useState(false);
  const [variantFormChangedFlag, setVariantFormChangedFlag] = useState(false);
  const [pixelOpen, setPixelOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: p, error: pErr } = await supabaseBrowser
          .from('products')
          .select('id, name, slug, active, description_en, description_ur, logo_url, daraz_enabled, daraz_url, daraz_trust_line, chat_enabled, chat_facebook_url, chat_instagram_url, special_message, fb_page_url, instagram_url, whatsapp_url, contact_email, contact_phone, fb_page_enabled, instagram_enabled, whatsapp_enabled, contact_email_enabled, contact_phone_enabled, cta_label, cta_size')
          .eq('id', params.id)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!p) throw new Error('Product not found');
        setProduct(p as any);
        setName((p as any).name || '');
        setSlug((p as any).slug || '');
        setActive(!!(p as any).active);
        setDescriptionEn((p as any).description_en || '');
        setDescriptionUr((p as any).description_ur || '');
        setLogoUrl((p as any).logo_url || '');
        setDarazEnabled(!!(p as any).daraz_enabled);
        setDarazUrl((p as any).daraz_url || '');
        setChatEnabled(!!(p as any).chat_enabled);
        setChatFacebookUrl((p as any).chat_facebook_url || '');
        setChatInstagramUrl((p as any).chat_instagram_url || '');
        setSpecialMessage((p as any).special_message || '');
        setDarazTrustLine(Boolean((p as any).daraz_trust_line));
        setFbPageUrl((p as any).fb_page_url || '');
        setInstagramUrl((p as any).instagram_url || '');
        setWhatsappUrl((p as any).whatsapp_url || '');
        setContactEmail((p as any).contact_email || '');
        setContactPhone((p as any).contact_phone || '');
        setFbPageEnabled(Boolean((p as any).fb_page_enabled));
        setInstagramEnabled(Boolean((p as any).instagram_enabled));
        setWhatsappEnabled(Boolean((p as any).whatsapp_enabled));
        setContactEmailEnabled(Boolean((p as any).contact_email_enabled));
        setContactPhoneEnabled(Boolean((p as any).contact_phone_enabled));
        setCtaLabel((p as any).cta_label || '');
        setCtaSize(((p as any).cta_size as 'small' | 'medium' | 'large') || 'medium');
        setInitialBasics({
          name: (p as any).name || '',
          slug: (p as any).slug || '',
          active: !!(p as any).active,
          descriptionEn: (p as any).description_en || '',
          descriptionUr: (p as any).description_ur || '',
          logoUrl: (p as any).logo_url || '',
          darazEnabled: !!(p as any).daraz_enabled,
          darazUrl: (p as any).daraz_url || '',
          darazTrustLine: Boolean((p as any).daraz_trust_line),
          chatEnabled: !!(p as any).chat_enabled,
          chatFacebookUrl: (p as any).chat_facebook_url || '',
          chatInstagramUrl: (p as any).chat_instagram_url || '',
          specialMessage: (p as any).special_message || '',
          fbPageUrl: (p as any).fb_page_url || '',
          instagramUrl: (p as any).instagram_url || '',
          whatsappUrl: (p as any).whatsapp_url || '',
          contactEmail: (p as any).contact_email || '',
          contactPhone: (p as any).contact_phone || '',
          fbPageEnabled: Boolean((p as any).fb_page_enabled),
          instagramEnabled: Boolean((p as any).instagram_enabled),
          whatsappEnabled: Boolean((p as any).whatsapp_enabled),
          contactEmailEnabled: Boolean((p as any).contact_email_enabled),
          contactPhoneEnabled: Boolean((p as any).contact_phone_enabled),
          ctaLabel: (p as any).cta_label || '',
          ctaSize: (((p as any).cta_size as 'small' | 'medium' | 'large') || 'medium'),
        });

        const { data: m, error: mErr } = await supabaseBrowser
          .from('product_media')
          .select('id, product_id, type, url, thumb_url, poster_url, alt, sort')
          .eq('product_id', params.id)
          .order('sort', { ascending: true });
        if (mErr) throw mErr;
        setMedia((m || []) as any);

        const { data: sp, error: spErr } = await supabaseBrowser
          .from('product_specs')
          .select('id, product_id, group, label, value, lang, sort')
          .eq('product_id', params.id)
          .order('group', { ascending: true })
          .order('sort', { ascending: true });
        if (spErr) throw spErr;
        setSpecs((sp || []) as any);

        const { data: sec, error: secErr } = await supabaseBrowser
          .from('product_sections')
          .select('id, product_id, type, title, body, media_refs, sort')
          .eq('product_id', params.id)
          .order('sort', { ascending: true });
        if (secErr) throw secErr;
        setSections((sec || []) as any);

        // Load product promotions
        const { data: promos } = await supabaseBrowser
          .from('product_promotions')
          .select('id, product_id, name, active, type, min_qty, discount_pct, free_qty, start_at, end_at')
          .eq('product_id', params.id)
          .order('created_at', { ascending: true });
        setPromotions(((promos || []) as any[]).map((p) => ({
          id: String(p.id),
          product_id: String(p.product_id),
          name: p.name || '',
          active: !!p.active,
          type: (p.type === 'bxgy' ? 'bxgy' : 'percent') as 'percent' | 'bxgy',
          min_qty: Number(p.min_qty || 1),
          discount_pct: p.discount_pct !== null && p.discount_pct !== undefined ? Number(p.discount_pct) : null,
          free_qty: p.free_qty !== null && p.free_qty !== undefined ? Number(p.free_qty) : null,
          start_at: p.start_at ? new Date(p.start_at as string).toISOString().slice(0, 16) : null,
          end_at: p.end_at ? new Date(p.end_at as string).toISOString().slice(0, 16) : null,
        })));

        // Load Color option type id and existing color values for this product
        const { data: ot } = await supabaseBrowser
          .from('option_types')
          .select('id')
          .eq('name', 'Color')
          .maybeSingle();
        setColorTypeId((ot as any)?.id ?? null);

        if ((ot as any)?.id) {
          const { data: ov } = await supabaseBrowser
            .from('option_values')
            .select('id, value')
            .eq('product_id', params.id)
            .eq('option_type_id', (ot as any).id);
          setColors(((ov || []) as any).map((r: any) => ({ id: r.id, value: r.value })));
        }

        // Load Size option type id and existing size values for this product
        const { data: otSize } = await supabaseBrowser
          .from('option_types')
          .select('id')
          .eq('name', 'Size')
          .maybeSingle();
        setSizeTypeId((otSize as any)?.id ?? null);
        if ((otSize as any)?.id) {
          const { data: sz } = await supabaseBrowser
            .from('option_values')
            .select('id, value')
            .eq('product_id', params.id)
            .eq('option_type_id', (otSize as any).id);
          setSizes(((sz || []) as any).map((r: any) => ({ id: r.id, value: r.value })));
        }

        // Load Model option type id and existing model values
        const { data: otModel } = await supabaseBrowser
          .from('option_types')
          .select('id')
          .eq('name', 'Model')
          .maybeSingle();
        setModelTypeId((otModel as any)?.id ?? null);
        if ((otModel as any)?.id) {
          const { data: mv } = await supabaseBrowser
            .from('option_values')
            .select('id, value')
            .eq('product_id', params.id)
            .eq('option_type_id', (otModel as any).id);
          setModels(((mv || []) as any).map((r: any) => ({ id: r.id, value: r.value })));
        }

        // Load Package option type id and existing package values
        const { data: otPack } = await supabaseBrowser
          .from('option_types')
          .select('id')
          .eq('name', 'Package')
          .maybeSingle();
        setPackageTypeId((otPack as any)?.id ?? null);
        if ((otPack as any)?.id) {
          const { data: pv } = await supabaseBrowser
            .from('option_values')
            .select('id, value')
            .eq('product_id', params.id)
            .eq('option_type_id', (otPack as any).id);
          setPackages(((pv || []) as any).map((r: any) => ({ id: r.id, value: r.value })));
        }

        // Load product_options to set toggles
        const { data: po } = await supabaseBrowser
          .from('product_options')
          .select('option_type_id')
          .eq('product_id', params.id);
        const typeIds = new Set((po || []).map((r: any) => String(r.option_type_id)));
        setEnableColor(typeIds.has(String((ot as any)?.id)) || false);
        setEnableSize(typeIds.has(String((otSize as any)?.id)) || false);
        setEnableModel(typeIds.has(String((otModel as any)?.id)) || false);
        setEnablePackage(typeIds.has(String((otPack as any)?.id)) || false);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  const saveBasics = async () => {
    setSaving(true);
    setError(null);
    try {
      // Inline validation for checkout extras
      if (darazEnabled && !(darazUrl || '').trim()) throw new Error('Daraz URL is required when Buy on Daraz is enabled.');
      if (chatEnabled && !((chatFacebookUrl || '').trim() || (chatInstagramUrl || '').trim())) throw new Error('Enter at least one Chat URL (Facebook or Instagram) when Chat is enabled.');
      const { error } = await supabaseBrowser
        .from('products')
        .update({
          name,
          slug,
          active,
          description_en: descriptionEn || null,
          description_ur: descriptionUr || null,
          logo_url: logoUrl || null,
          daraz_enabled: darazEnabled,
          daraz_url: darazEnabled ? (darazUrl || null) : null,
          daraz_trust_line: darazEnabled ? darazTrustLine : false,
          chat_enabled: chatEnabled,
          chat_facebook_url: chatEnabled ? (chatFacebookUrl || null) : null,
          chat_instagram_url: chatEnabled ? (chatInstagramUrl || null) : null,
          special_message: specialMessage || null,
          cta_label: ctaLabel || null,
          cta_size: ctaSize || 'medium',
          fb_page_url: fbPageUrl || null,
          instagram_url: instagramUrl || null,
          whatsapp_url: whatsappUrl || null,
          contact_email: contactEmail || null,
          contact_phone: contactPhone || null,
          fb_page_enabled: fbPageEnabled,
          instagram_enabled: instagramEnabled,
          whatsapp_enabled: whatsappEnabled,
          contact_email_enabled: contactEmailEnabled,
          contact_phone_enabled: contactPhoneEnabled,
        })
        .eq('id', params.id);
      if (error) throw error;
      router.refresh();
      // update snapshot after successful save
      setInitialBasics({ name, slug, active, descriptionEn, descriptionUr, logoUrl, darazEnabled, darazUrl, darazTrustLine, chatEnabled, chatFacebookUrl, chatInstagramUrl, specialMessage, fbPageUrl, instagramUrl, whatsappUrl, contactEmail, contactPhone, fbPageEnabled, instagramEnabled, whatsappEnabled, contactEmailEnabled, contactPhoneEnabled, ctaLabel, ctaSize });
    } catch (e: any) {
      setError(e?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  // dirty detection for Basics
  const basicsDirty = useMemo(() => {
    if (!initialBasics) return false;
    return (
      initialBasics.name !== name ||
      initialBasics.slug !== slug ||
      initialBasics.active !== active ||
      initialBasics.descriptionEn !== descriptionEn ||
      initialBasics.descriptionUr !== descriptionUr ||
      initialBasics.logoUrl !== logoUrl ||
      initialBasics.darazEnabled !== darazEnabled ||
      initialBasics.darazUrl !== darazUrl ||
      initialBasics.darazTrustLine !== darazTrustLine ||
      initialBasics.chatEnabled !== chatEnabled ||
      initialBasics.chatFacebookUrl !== chatFacebookUrl ||
      initialBasics.chatInstagramUrl !== chatInstagramUrl ||
      initialBasics.specialMessage !== specialMessage ||
      initialBasics.fbPageUrl !== fbPageUrl ||
      initialBasics.instagramUrl !== instagramUrl ||
      initialBasics.whatsappUrl !== whatsappUrl ||
      initialBasics.contactEmail !== contactEmail ||
      initialBasics.contactPhone !== contactPhone ||
      initialBasics.fbPageEnabled !== fbPageEnabled ||
      initialBasics.instagramEnabled !== instagramEnabled ||
      initialBasics.whatsappEnabled !== whatsappEnabled ||
      initialBasics.contactEmailEnabled !== contactEmailEnabled ||
      initialBasics.contactPhoneEnabled !== contactPhoneEnabled ||
      initialBasics.ctaLabel !== ctaLabel ||
      initialBasics.ctaSize !== ctaSize
    );
  }, [initialBasics, name, slug, active, descriptionEn, descriptionUr, logoUrl, darazEnabled, darazUrl, darazTrustLine, chatEnabled, chatFacebookUrl, chatInstagramUrl, specialMessage, fbPageUrl, instagramUrl, whatsappUrl, contactEmail, contactPhone, ctaLabel, ctaSize]);

  // beforeunload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!basicsDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [basicsDirty]);

  const discardChanges = () => {
    if (!initialBasics) return;
    setName(initialBasics.name);
    setSlug(initialBasics.slug);
    setActive(initialBasics.active);
    setDescriptionEn(initialBasics.descriptionEn);
    setDescriptionUr(initialBasics.descriptionUr);
    setLogoUrl(initialBasics.logoUrl);
    setDarazEnabled(initialBasics.darazEnabled);
    setDarazUrl(initialBasics.darazUrl);
    setDarazTrustLine(initialBasics.darazTrustLine);
    setChatEnabled(initialBasics.chatEnabled);
    setChatFacebookUrl(initialBasics.chatFacebookUrl);
    setChatInstagramUrl(initialBasics.chatInstagramUrl);
    setSpecialMessage(initialBasics.specialMessage);
    setFbPageUrl(initialBasics.fbPageUrl);
    setInstagramUrl(initialBasics.instagramUrl);
    setWhatsappUrl(initialBasics.whatsappUrl);
    setContactEmail(initialBasics.contactEmail);
    setContactPhone(initialBasics.contactPhone);
    setFbPageEnabled(initialBasics.fbPageEnabled);
    setInstagramEnabled(initialBasics.instagramEnabled);
    setWhatsappEnabled(initialBasics.whatsappEnabled);
    setContactEmailEnabled(initialBasics.contactEmailEnabled);
    setContactPhoneEnabled(initialBasics.contactPhoneEnabled);
    setCtaLabel(initialBasics.ctaLabel);
    setCtaSize(initialBasics.ctaSize);
    // clear Add Variant form
    if (typeof document !== 'undefined') {
      ['v-sku','v-price','v-color','v-size','v-model','v-package'].forEach((id)=>{
        const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
        if (!el) return;
        if ('value' in (el as any)) (el as any).value = '';
      });
      const av = document.getElementById('v-active') as HTMLInputElement | null;
      if (av) av.checked = true;
    }
    setVariantFormChangedFlag(false);
    setVariantsDirtyFlag(false);
  };

  // helper only used when user interacts on client
  const readVariantForm = () => {
    if (typeof document === 'undefined') {
      return { sku: '', price: '', color: '', size: '', model: '', pack: '' };
    }
    const sku = (document.getElementById('v-sku') as HTMLInputElement | null)?.value || '';
    const price = (document.getElementById('v-price') as HTMLInputElement | null)?.value || '';
    const color = (document.getElementById('v-color') as HTMLSelectElement | null)?.value || '';
    const size = (document.getElementById('v-size') as HTMLSelectElement | null)?.value || '';
    const model = (document.getElementById('v-model') as HTMLSelectElement | null)?.value || '';
    const pack = (document.getElementById('v-package') as HTMLSelectElement | null)?.value || '';
    return { sku, price, color, size, model, pack };
  };

  // treat add-variant form as dirty once user types/changes anything
  const variantFormDirty = useMemo(() => variantFormChangedFlag, [variantFormChangedFlag]);

  // unified dirty state
  const isDirty = basicsDirty || variantFormDirty || variantsDirtyFlag;

  // Save all edits across Basics, Add Variant, and inline Variant rows
  const saveAllEdits = async () => {
    setSaving(true);
    setError(null);
    try {
      // 1) Basics
      const { error: pErr } = await supabaseBrowser
        .from('products')
        .update({
          name,
          slug,
          active,
          description_en: descriptionEn || null,
          description_ur: descriptionUr || null,
          logo_url: logoUrl || null,
          daraz_enabled: darazEnabled,
          daraz_url: darazEnabled ? (darazUrl || null) : null,
          daraz_trust_line: darazEnabled ? darazTrustLine : false,
          chat_enabled: chatEnabled,
          chat_facebook_url: chatEnabled ? (chatFacebookUrl || null) : null,
          chat_instagram_url: chatEnabled ? (chatInstagramUrl || null) : null,
          special_message: specialMessage || null,
          cta_label: ctaLabel || null,
          fb_page_url: fbPageUrl || null,
          instagram_url: instagramUrl || null,
          whatsapp_url: whatsappUrl || null,
          contact_email: contactEmail || null,
          contact_phone: contactPhone || null,
          fb_page_enabled: fbPageEnabled,
          instagram_enabled: instagramEnabled,
          whatsapp_enabled: whatsappEnabled,
          contact_email_enabled: contactEmailEnabled,
          contact_phone_enabled: contactPhoneEnabled,
        })
        .eq('id', params.id);
      if (pErr) throw pErr;
      setInitialBasics({ name, slug, active, descriptionEn, descriptionUr, logoUrl, darazEnabled, darazUrl, darazTrustLine, chatEnabled, chatFacebookUrl, chatInstagramUrl, specialMessage, fbPageUrl, instagramUrl, whatsappUrl, contactEmail, contactPhone, fbPageEnabled, instagramEnabled, whatsappEnabled, contactEmailEnabled, contactPhoneEnabled, ctaLabel, ctaSize });

      // 2) Add Variant (staged)
      const vf = readVariantForm();
      if (vf.sku && vf.price) {
        await addVariant({
          sku: vf.sku,
          price: Number(vf.price),
          active: (typeof document !== 'undefined' ? (document.getElementById('v-active') as HTMLInputElement | null)?.checked : true) ?? true,
          color_value_id: vf.color ? Number(vf.color) : null,
          size_value_id: vf.size ? Number(vf.size) : null,
          model_value_id: vf.model ? Number(vf.model) : null,
          package_value_id: vf.pack ? Number(vf.pack) : null,
        });
        if (typeof document !== 'undefined') {
          ['v-sku','v-price','v-color','v-size','v-model','v-package'].forEach((id)=>{
            const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
            if (el && 'value' in (el as any)) (el as any).value = '';
          });
          const av = document.getElementById('v-active') as HTMLInputElement | null; if (av) av.checked = true;
        }
        setVariantFormChangedFlag(false);
      }

      // 3) Persist all visible variant row inputs (in case user didn't blur)
      for (const v of variants) {
        if (typeof document === 'undefined') break;
        const skuEl = document.getElementById(`row-sku-${v.id}`) as HTMLInputElement | null;
        const priceEl = document.getElementById(`row-price-${v.id}`) as HTMLInputElement | null;
        const onHandEl = document.getElementById(`row-onhand-${v.id}`) as HTMLInputElement | null;
        const activeEl = document.getElementById(`row-active-${v.id}`) as HTMLInputElement | null;
        const colorEl = document.getElementById(`row-color-${v.id}`) as HTMLSelectElement | null;
        const sizeEl = document.getElementById(`row-size-${v.id}`) as HTMLSelectElement | null;
        const modelEl = document.getElementById(`row-model-${v.id}`) as HTMLSelectElement | null;
        const packEl = document.getElementById(`row-pack-${v.id}`) as HTMLSelectElement | null;

        const patch: Partial<VariantRow> = {};
        if (skuEl && skuEl.value !== v.sku) patch.sku = skuEl.value;
        if (priceEl && Number(priceEl.value) !== Number(v.price)) patch.price = Number(priceEl.value || '0');
        if (activeEl && Boolean(activeEl.checked) !== Boolean(v.active)) patch.active = activeEl.checked;
        if (colorEl) patch.color_value_id = colorEl.value ? Number(colorEl.value) : null;
        if (sizeEl) patch.size_value_id = sizeEl.value ? Number(sizeEl.value) : null;
        if (modelEl) patch.model_value_id = modelEl.value ? Number(modelEl.value) : null;
        if (packEl) patch.package_value_id = packEl.value ? Number(packEl.value) : null;
        if (Object.keys(patch).length) await updateVariant(v.id, patch);
        if (onHandEl && Number(onHandEl.value) !== Number(v.on_hand ?? 0)) await setOnHand(v.id, Number(onHandEl.value || '0'));
      }

      await loadVariants();
      router.refresh();
      setVariantsDirtyFlag(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Append uploaded URLs into a section's media_refs array
  const appendSectionMedia = async (sectionId: string, urls: string[]) => {
    try {
      const current = sections.find((s) => s.id === sectionId);
      const arr = Array.isArray(current?.media_refs) ? current!.media_refs as any[] : [];
      await updateSection(sectionId, { media_refs: [...arr, ...urls] as any });
    } catch (e: any) {
      setError(e?.message || 'Failed to attach media');
    }
  };

  const removeVariant = async (id: string) => {
    if (!confirm('Delete this variant? This will remove inventory and option links for this variant.')) return;
    setSaving(true);
    setError(null);
    try {
      // Safety: block delete if any order_items reference this variant
      const { data: oi } = await supabaseBrowser.from('order_items').select('order_id').eq('variant_id', id).limit(1);
      if ((oi || []).length > 0) throw new Error('Cannot delete: this variant has orders. Set Active off instead.');
      await supabaseBrowser.from('variant_option_values').delete().eq('variant_id', id);
      await supabaseBrowser.from('inventory').delete().eq('variant_id', id);
      await supabaseBrowser.from('variants').delete().eq('id', id);
      setVariants((prev) => prev.filter((v) => v.id !== id));
    } catch (e: any) {
      setError(e?.message || 'Failed to delete variant');
    } finally {
      setSaving(false);
    }
  };

  // Delete actions
  const softDelete = async () => {
    if (!confirm('Deactivate this product? It will be unpublished but not removed.')) return;
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabaseBrowser.from('products').update({ active: false }).eq('id', params.id);
      if (error) throw error;
      alert('Product deactivated.');
      router.refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to deactivate');
    } finally {
      setSaving(false);
    }
  };

  const hardDelete = async () => {
    if (!confirm('Permanently delete this product and related variants, specs, sections, and media? This cannot be undone.')) return;
    setSaving(true);
    setError(null);
    try {
      // Safety check: block delete if any order_items reference its variants
      const { data: vIds } = await supabaseBrowser.from('variants').select('id').eq('product_id', params.id);
      const ids = (vIds || []).map((r: any) => r.id);
      if (ids.length) {
        const { data: oi } = await supabaseBrowser.from('order_items').select('order_id').in('variant_id', ids).limit(1);
        if ((oi || []).length > 0) throw new Error('Cannot delete: one or more variants have orders. Deactivate instead.');
      }
      // Delete dependents
      await supabaseBrowser.from('product_sections').delete().eq('product_id', params.id);
      await supabaseBrowser.from('product_specs').delete().eq('product_id', params.id);
      await supabaseBrowser.from('product_media').delete().eq('product_id', params.id);
      if (ids.length) {
        await supabaseBrowser.from('variant_option_values').delete().in('variant_id', ids);
        await supabaseBrowser.from('inventory').delete().in('variant_id', ids);
        await supabaseBrowser.from('variants').delete().in('id', ids);
      }
      await supabaseBrowser.from('products').delete().eq('id', params.id);
      alert('Product deleted.');
      router.push('/admin/products');
    } catch (e: any) {
      setError(e?.message || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  // Color Options helpers
  const addColor = async (value: string) => {
    if (!colorTypeId) return;
    const { data, error } = await supabaseBrowser
      .from('option_values')
      .insert({ product_id: params.id, option_type_id: colorTypeId, value })
      .select('id, value')
      .single();
    if (!error && data) setColors((prev) => [...prev, { id: (data as any).id, value: (data as any).value }]);
  };

  // Size Options helpers
  const addSize = async (value: string) => {
    if (!sizeTypeId) return;
    const { data, error } = await supabaseBrowser
      .from('option_values')
      .insert({ product_id: params.id, option_type_id: sizeTypeId, value })
      .select('id, value')
      .single();
    if (!error && data) setSizes((prev) => [...prev, { id: (data as any).id, value: (data as any).value }]);
  };

  // Model Options helpers
  const addModel = async (value: string) => {
    if (!modelTypeId) return;
    const { data, error } = await supabaseBrowser
      .from('option_values')
      .insert({ product_id: params.id, option_type_id: modelTypeId, value })
      .select('id, value')
      .single();
    if (!error && data) setModels((prev) => [...prev, { id: (data as any).id, value: (data as any).value }]);
  };

  // Package Options helpers
  const addPackage = async (value: string) => {
    if (!packageTypeId) return;
    const { data, error } = await supabaseBrowser
      .from('option_values')
      .insert({ product_id: params.id, option_type_id: packageTypeId, value })
      .select('id, value')
      .single();
    if (!error && data) setPackages((prev) => [...prev, { id: (data as any).id, value: (data as any).value }]);
  };

  // Toggle product_options for Color/Size
  const setOptionEnabled = async (type: 'color' | 'size' | 'model' | 'package', enabled: boolean) => {
    const typeId = type === 'color' ? colorTypeId : type === 'size' ? sizeTypeId : type === 'model' ? modelTypeId : packageTypeId;
    if (!typeId) return;
    if (enabled) {
      const { data: exists } = await supabaseBrowser
        .from('product_options')
        .select('product_id, option_type_id')
        .eq('product_id', params.id)
        .eq('option_type_id', typeId)
        .maybeSingle();
      if (!exists) {
        await supabaseBrowser.from('product_options').insert({ product_id: params.id, option_type_id: typeId });
      }
    } else {
      await supabaseBrowser
        .from('product_options')
        .delete()
        .eq('product_id', params.id)
        .eq('option_type_id', typeId);
    }
    if (type === 'color') setEnableColor(enabled);
    else if (type === 'size') setEnableSize(enabled);
    else if (type === 'model') setEnableModel(enabled);
    else setEnablePackage(enabled);
  };

  // Variants + Inventory helpers
  type VariantRow = { id: string; sku: string; price: number; active: boolean; thumb_url?: string | null; color_value_id?: number | null; size_value_id?: number | null; model_value_id?: number | null; package_value_id?: number | null; on_hand?: number };
  const [variants, setVariants] = useState<VariantRow[]>([]);
  // Admin local toggle to allow changing structural fields if needed
  const [unlockVariantStructure, setUnlockVariantStructure] = useState(false);
  const [lpProbe, setLpProbe] = useState<null | { colors: string[]; keys: string[] }>(null);

  const runLpProbe = async () => {
    try {
      // Mimic LP queries for this product
      const { data: product } = await supabaseBrowser
        .from('products')
        .select('id, active')
        .eq('id', params.id)
        .eq('active', true)
        .maybeSingle();
      if (!product?.id) { setLpProbe({ colors: [], keys: [] }); return; }

      const { data: variants } = await supabaseBrowser
        .from('variants')
        .select('id, sku, price, active, thumb_url')
        .eq('product_id', product.id)
        .eq('active', true);
      const ids = (variants || []).map((v:any)=>v.id);

      const { data: inv } = await supabaseBrowser
        .from('inventory')
        .select('variant_id, stock_on_hand, reserved')
        .in('variant_id', ids);
      const availability: Record<string, number> = {};
      for (const r of inv || []) {
        const vId = (r as any).variant_id as string; const on = Number((r as any).stock_on_hand)||0; const res = Number((r as any).reserved)||0; availability[vId] = on - res;
      }

      const { data: colorType } = await supabaseBrowser.from('option_types').select('id').eq('name','Color').maybeSingle();
      const { data: modelType } = await supabaseBrowser.from('option_types').select('id').eq('name','Model').maybeSingle();
      const { data: packType } = await supabaseBrowser.from('option_types').select('id').eq('name','Package').maybeSingle();
      const { data: sizeType } = await supabaseBrowser.from('option_types').select('id').eq('name','Size').maybeSingle();
      const colorTypeId = colorType?.id as string|undefined;
      const modelTypeId = modelType?.id as string|undefined;
      const packTypeId = packType?.id as string|undefined;
      const sizeTypeId = sizeType?.id as string|undefined;

      let colorBy: Record<string,string> = {}; let modelBy: Record<string,string> = {}; let packBy: Record<string,string> = {}; let sizeBy: Record<string,string> = {};
      if (ids.length) {
        const { data: mapping } = await supabaseBrowser
          .from('variant_option_values')
          .select('variant_id, option_values!variant_option_values_option_value_id_fkey(value, option_type_id)')
          .in('variant_id', ids);
        for (const row of mapping || []) {
          const vId = (row as any).variant_id as string; const ov = (row as any).option_values as any; if (!ov) continue;
          if (colorTypeId && ov.option_type_id === colorTypeId) colorBy[vId] = ov.value as string;
          if (modelTypeId && ov.option_type_id === modelTypeId) modelBy[vId] = ov.value as string;
          if (packTypeId && ov.option_type_id === packTypeId) packBy[vId] = ov.value as string;
          if (sizeTypeId && ov.option_type_id === sizeTypeId) sizeBy[vId] = ov.value as string;
        }
      }

      const key = (c?:string,m?:string,p?:string,s?:string)=>`${c||''}|${m||''}|${p||''}|${s||''}`;
      const colorsSet = new Set<string>(); const keys: string[] = [];
      for (const v of (variants||[])) {
        const id = (v as any).id as string; const color = colorBy[id] ?? ((((v as any).sku||'').split('-')[1]) || 'Default'); const m = modelBy[id]; const p = packBy[id]; const s = sizeBy[id];
        colorsSet.add(color);
        const k = key(color,m,p,s);
        keys.push(k + ` avail=${availability[id]??0}`);
      }
      setLpProbe({ colors: Array.from(colorsSet).sort(), keys });
    } catch (e) {
      setLpProbe({ colors: [], keys: [`error: ${(e as any)?.message || 'unknown'}`] });
    }
  };

  // Persist currently shown option selections from the grid to DB, even if locked
  const resyncOptionLinks = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const v of variants) {
        const patch: Partial<VariantRow> = {};
        const colorEl = document.getElementById(`row-color-${v.id}`) as HTMLSelectElement | null;
        const sizeEl = document.getElementById(`row-size-${v.id}`) as HTMLSelectElement | null;
        const modelEl = document.getElementById(`row-model-${v.id}`) as HTMLSelectElement | null;
        const packEl = document.getElementById(`row-pack-${v.id}`) as HTMLSelectElement | null;
        if (colorEl) patch.color_value_id = colorEl.value ? Number(colorEl.value) : null;
        if (sizeEl) patch.size_value_id = sizeEl.value ? Number(sizeEl.value) : null;
        if (modelEl) patch.model_value_id = modelEl.value ? Number(modelEl.value) : null;
        if (packEl) patch.package_value_id = packEl.value ? Number(packEl.value) : null;
        // Only call when there is at least one structural field present
        if (
          patch.color_value_id !== undefined ||
          patch.size_value_id !== undefined ||
          patch.model_value_id !== undefined ||
          patch.package_value_id !== undefined
        ) {
          await updateVariant(v.id, patch);
        }
      }
      await loadVariants();
      setVariantsDirtyFlag(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to resync option links');
    } finally {
      setSaving(false);
    }
  };

  const loadVariants = async () => {
    const { data: v } = await supabaseBrowser
      .from('variants')
      .select('id, sku, price, active, thumb_url')
      .eq('product_id', params.id)
      .order('price', { ascending: true });
    let out: VariantRow[] = (v || []) as any;
    // attach inventory on_hand
    const ids = out.map((x) => x.id);
    if (ids.length) {
      const { data: inv } = await supabaseBrowser.from('inventory').select('variant_id, stock_on_hand').in('variant_id', ids);
      const map = new Map<string, number>();
      for (const r of inv || []) map.set((r as any).variant_id, Number((r as any).stock_on_hand) || 0);
      out = out.map((x) => ({ ...x, on_hand: map.get(x.id) ?? 0 }));
    }
    // attach color/size value ids if exist
    if (ids.length) {
      const { data: links, error: linkErr } = await supabaseBrowser
        .from('variant_option_values')
        .select('variant_id, option_value_id, option_values!variant_option_values_option_value_id_fkey(option_type_id)')
        .in('variant_id', ids);
      if (linkErr) throw linkErr as any;
      for (const l of links || []) {
        // only map color type
        if ((l as any).option_values?.option_type_id === colorTypeId) {
          const idx = out.findIndex((x) => x.id === (l as any).variant_id);
          if (idx >= 0) out[idx].color_value_id = (l as any).option_value_id as number;
        } else if ((l as any).option_values?.option_type_id === sizeTypeId) {
          const idx = out.findIndex((x) => x.id === (l as any).variant_id);
          if (idx >= 0) out[idx].size_value_id = (l as any).option_value_id as number;
        } else if ((l as any).option_values?.option_type_id === modelTypeId) {
          const idx = out.findIndex((x) => x.id === (l as any).variant_id);
          if (idx >= 0) out[idx].model_value_id = (l as any).option_value_id as number;
        } else if ((l as any).option_values?.option_type_id === packageTypeId) {
          const idx = out.findIndex((x) => x.id === (l as any).variant_id);
          if (idx >= 0) out[idx].package_value_id = (l as any).option_value_id as number;
        }
      }
    }
    setVariants(out);
  };

  useEffect(() => {
    loadVariants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorTypeId, sizeTypeId, modelTypeId, packageTypeId]);

  const addVariant = async (payload: { sku: string; price: number; active: boolean; color_value_id?: number | null; size_value_id?: number | null; model_value_id?: number | null; package_value_id?: number | null }) => {
    const { data: v, error: vErr } = await supabaseBrowser
      .from('variants')
      .insert({ product_id: params.id, sku: payload.sku, price: payload.price, active: payload.active })
      .select('id, sku, price, active')
      .single();
    if (vErr) throw vErr;
    const vid = (v as any).id as string;
    if (payload.color_value_id) {
      const { error } = await supabaseBrowser
        .from('variant_option_values')
        .insert({ variant_id: vid, option_value_id: payload.color_value_id });
      if (error) throw error;
    }
    if (payload.size_value_id) {
      const { error } = await supabaseBrowser
        .from('variant_option_values')
        .insert({ variant_id: vid, option_value_id: payload.size_value_id });
      if (error) throw error;
    }
    if (payload.model_value_id) {
      const { error } = await supabaseBrowser
        .from('variant_option_values')
        .insert({ variant_id: vid, option_value_id: payload.model_value_id });
      if (error) throw error;
    }
    if (payload.package_value_id) {
      const { error } = await supabaseBrowser
        .from('variant_option_values')
        .insert({ variant_id: vid, option_value_id: payload.package_value_id });
      if (error) throw error;
    }
    setVariants((prev) => [...prev, { id: vid, sku: (v as any).sku, price: Number((v as any).price), active: !!(v as any).active, color_value_id: payload.color_value_id ?? null, size_value_id: payload.size_value_id ?? null, model_value_id: payload.model_value_id ?? null, package_value_id: payload.package_value_id ?? null, on_hand: 0 }]);
    setVariantsDirtyFlag(true);
  };

  const updateVariant = async (id: string, patch: Partial<VariantRow>) => {
    const update: any = {};
    if (patch.sku != null) update.sku = patch.sku;
    if (patch.price != null) update.price = patch.price;
    if (patch.active != null) update.active = patch.active;
    if (patch.thumb_url !== undefined) update.thumb_url = patch.thumb_url;
    if (Object.keys(update).length) {
      const { error } = await supabaseBrowser.from('variants').update(update).eq('id', id);
      if (error) throw error;
    }
    if (patch.color_value_id != null || patch.size_value_id != null || patch.model_value_id != null || patch.package_value_id != null) {
      // Fetch existing links and enforce single row per option type by deleting extras
      const { data: existing, error: exErr } = await supabaseBrowser
        .from('variant_option_values')
        .select('variant_id, option_value_id, option_values!variant_option_values_option_value_id_fkey(option_type_id)')
        .eq('variant_id', id);
      if (exErr) throw exErr;

      const replaceForType = async (typeId?: string, nextId?: number | null) => {
        if (!typeId) return;
        const rows = (existing || []).filter((r: any) => r.option_values?.option_type_id === typeId);
        const keep = nextId == null ? null : nextId;
        // delete all rows not matching desired value, or all rows if desired is null
        const toDelete = rows.filter((r: any) => keep == null || r.option_value_id !== keep).map((r: any) => r.option_value_id);
        if (toDelete.length) {
          const { error: delErr } = await supabaseBrowser
            .from('variant_option_values')
            .delete()
            .eq('variant_id', id)
            .in('option_value_id', toDelete);
          if (delErr) throw delErr;
        }
        // insert if desired exists and there isn't one already
        if (keep != null && !rows.some((r: any) => r.option_value_id === keep)) {
          const { error: insErr } = await supabaseBrowser
            .from('variant_option_values')
            .insert({ variant_id: id, option_value_id: keep });
          if (insErr) throw insErr;
        }
      };

      await replaceForType(colorTypeId as any, patch.color_value_id as any);
      await replaceForType(sizeTypeId as any, patch.size_value_id as any);
      await replaceForType(modelTypeId as any, patch.model_value_id as any);
      await replaceForType(packageTypeId as any, patch.package_value_id as any);
    }
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    setVariantsDirtyFlag(true);
  };

  const setOnHand = async (id: string, onHand: number) => {
    // upsert inventory row
    const { data: inv } = await supabaseBrowser.from('inventory').select('variant_id').eq('variant_id', id).maybeSingle();
    if (inv) {
      await supabaseBrowser.from('inventory').update({ stock_on_hand: onHand }).eq('variant_id', id);
    } else {
      await supabaseBrowser.from('inventory').insert({ variant_id: id, stock_on_hand: onHand, reserved: 0 });
    }
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, on_hand: onHand } : v)));
  };

  const adjustOnHandDelta = async (id: string, delta: number) => {
    const { data: invRow } = await supabaseBrowser
      .from('inventory')
      .select('variant_id, stock_on_hand, reserved')
      .eq('variant_id', id)
      .maybeSingle();
    const currentOn = Number((invRow as any)?.stock_on_hand || 0);
    const reserved = Number((invRow as any)?.reserved || 0);
    const nextOn = currentOn + Number(delta || 0);
    if (nextOn < reserved) {
      alert('Cannot reduce below Reserved. Adjust or release reserved units first.');
      return;
    }
    if (invRow) {
      await supabaseBrowser.from('inventory').update({ stock_on_hand: nextOn }).eq('variant_id', id);
    } else {
      await supabaseBrowser.from('inventory').insert({ variant_id: id, stock_on_hand: nextOn, reserved: 0 });
    }
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, on_hand: nextOn } : v)));
  };

  const nextSort = useMemo(() => (media.length ? Math.max(...media.map((m) => m.sort || 0)) + 1 : 0), [media]);

  const uploadToBucket = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const path = `${params.id}/${Date.now()}-${slugify(file.name)}.${ext}`;
    const { data, error } = await supabaseBrowser.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) throw error;
    const { data: pub } = supabaseBrowser.storage.from(BUCKET).getPublicUrl(data.path);
    return pub.publicUrl;
  };

  const addImage = async (file: File) => {
    setSaving(true);
    setError(null);
    try {
      const url = await uploadToBucket(file);
      const { data, error } = await supabaseBrowser
        .from('product_media')
        .insert({ product_id: params.id, type: 'image', url, sort: nextSort })
        .select('*')
        .single();
      if (error) throw error;
      setMedia((prev) => [...prev, data as any].sort((a, b) => a.sort - b.sort));
    } catch (e: any) {
      setError(e?.message || 'Failed to add image');
    } finally {
      setSaving(false);
    }
  };

  const addVideo = async (file: File, poster?: File) => {
    // Pre-check size before attempting upload
    const sizeMB = Number((file.size / (1024 * 1024)).toFixed(1));
    if (sizeMB > MAX_VIDEO_MB) {
      setError(`Video is ${sizeMB} MB which exceeds the ${MAX_VIDEO_MB} MB limit. Please compress and try again.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = await uploadToBucket(file);
      let posterUrl: string | undefined;
      if (poster) {
        posterUrl = await uploadToBucket(poster);
      }
      const { data, error } = await supabaseBrowser
        .from('product_media')
        .insert({ product_id: params.id, type: 'video', url, poster_url: posterUrl ?? null, sort: nextSort })
        .select('*')
        .single();
      if (error) throw error;
      setMedia((prev) => [...prev, data as any].sort((a, b) => a.sort - b.sort));
    } catch (e: any) {
      setError(e?.message || 'Failed to add video');
    } finally {
      setSaving(false);
    }
  };

  const setAlt = async (id: string, alt: string) => {
    const { error } = await supabaseBrowser.from('product_media').update({ alt: alt || null }).eq('id', id);
    if (!error) setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, alt } as any : m)));
  };

  const move = async (id: string, dir: 'up' | 'down') => {
    const idx = media.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= media.length) return;
    const a = media[idx];
    const b = media[swapIdx];
    // swap sort values
    await supabaseBrowser.from('product_media').update({ sort: b.sort }).eq('id', a.id);
    await supabaseBrowser.from('product_media').update({ sort: a.sort }).eq('id', b.id);
    const copy = [...media];
    copy[idx] = b; copy[swapIdx] = a;
    setMedia(copy);
  };

  const removeMedia = async (id: string) => {
    await supabaseBrowser.from('product_media').delete().eq('id', id);
    setMedia((prev) => prev.filter((m) => m.id !== id));
  };

  const updateMediaField = async (id: string, field: 'thumb_url' | 'poster_url', file: File) => {
    setSaving(true);
    setError(null);
    try {
      const url = await uploadToBucket(file);
      const { error } = await supabaseBrowser.from('product_media').update({ [field]: url } as any).eq('id', id);
      if (error) throw error;
      setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: url } as any : m)));
    } catch (e: any) {
      setError(e?.message || 'Failed to update media');
    } finally {
      setSaving(false);
    }
  };

  // Generate a poster image from a specific timestamp of a video URL
  const captureVideoFrame = (src: string, atSec = 1): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      try {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.preload = 'auto';
        video.src = src;
        const onError = () => reject(new Error('Unable to load video for poster capture'));
        video.onerror = onError;
        video.onloadedmetadata = () => {
          const t = Math.min(Math.max(0.1, atSec), Math.max(0.1, video.duration - 0.1));
          const seekTo = () => {
            const w = Math.max(1, video.videoWidth);
            const h = Math.max(1, video.videoHeight);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('Canvas not supported')); return; }
            ctx.drawImage(video, 0, 0, w, h);
            canvas.toBlob((blob) => {
              if (!blob) { reject(new Error('Failed to create image blob')); return; }
              resolve(blob);
            }, 'image/jpeg', 0.9);
          };
          const onSeeked = () => { seekTo(); cleanup(); };
          const cleanup = () => {
            video.removeEventListener('seeked', onSeeked);
            video.onerror = null; video.onloadedmetadata = null;
          };
          video.addEventListener('seeked', onSeeked);
          try { video.currentTime = t; } catch { onError(); }
        };
      } catch (e) {
        reject(e as any);
      }
    });
  };

  const generatePosterFromVideo = async (mediaRow: Media, atSec = 1) => {
    setSaving(true);
    setError(null);
    try {
      const blob = await captureVideoFrame(mediaRow.url, atSec);
      const file = new File([blob], `poster-${mediaRow.id}-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = await uploadToBucket(file);
      const { error } = await supabaseBrowser.from('product_media').update({ poster_url: url }).eq('id', mediaRow.id);
      if (error) throw error;
      setMedia((prev) => prev.map((m) => (m.id === mediaRow.id ? { ...m, poster_url: url } as any : m)));
    } catch (e: any) {
      setError(e?.message || 'Failed to generate poster');
    } finally {
      setSaving(false);
    }
  };

  // Specs Editor helpers
  const addSpec = async (lang: 'en' | 'ur') => {
    const { data, error } = await supabaseBrowser
      .from('product_specs')
      .insert({ product_id: params.id, group: null, label: 'Label', value: 'Value', lang, sort: specs.length })
      .select('*')
      .single();
    if (error) {
      setError(error.message || 'Failed to add spec');
      return;
    }
    if (data) setSpecs((prev) => [...prev, data as any]);
  };
  const updateSpec = async (id: string, patch: Partial<SpecRow>) => {
    const { error } = await supabaseBrowser.from('product_specs').update(patch as any).eq('id', id);
    if (error) {
      setError(error.message || 'Failed to update spec');
      return;
    }
    setSpecs((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } as any : s)));
  };
  const deleteSpec = async (id: string) => {
    const { error } = await supabaseBrowser.from('product_specs').delete().eq('id', id);
    if (error) {
      setError(error.message || 'Failed to delete spec');
      return;
    }
    setSpecs((prev) => prev.filter((s) => s.id !== id));
  };
  const moveSpec = async (id: string, dir: 'up' | 'down') => {
    const idx = specs.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= specs.length) return;
    const a = specs[idx];
    const b = specs[swapIdx];
    await supabaseBrowser.from('product_specs').update({ sort: b.sort }).eq('id', a.id);
    await supabaseBrowser.from('product_specs').update({ sort: a.sort }).eq('id', b.id);
    const copy = [...specs];
    copy[idx] = b; copy[swapIdx] = a;
    setSpecs(copy);
  };

  // Sections Editor helpers
  const addSection = async (type: SectionRow['type']) => {
    const { data, error } = await supabaseBrowser
      .from('product_sections')
      .insert({ product_id: params.id, type, title: null, body: null, media_refs: [], sort: sections.length })
      .select('*')
      .single();
    if (error) {
      setError(error.message || 'Failed to add section');
      return;
    }
    if (data) setSections((prev) => [...prev, data as any]);
  };
  const updateSection = async (id: string, patch: Partial<SectionRow>) => {
    const { error } = await supabaseBrowser.from('product_sections').update(patch as any).eq('id', id);
    if (error) {
      setError(error.message || 'Failed to update section');
      return;
    }
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } as any : s)));
  };
  const deleteSection = async (id: string) => {
    const { error } = await supabaseBrowser.from('product_sections').delete().eq('id', id);
    if (error) {
      setError(error.message || 'Failed to delete section');
      return;
    }
    setSections((prev) => prev.filter((s) => s.id !== id));
  };
  const moveSection = async (id: string, dir: 'up' | 'down') => {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    const a = sections[idx];
    const b = sections[swapIdx];
    await supabaseBrowser.from('product_sections').update({ sort: b.sort }).eq('id', a.id);
    await supabaseBrowser.from('product_sections').update({ sort: a.sort }).eq('id', b.id);
    const copy = [...sections];
    copy[idx] = b; copy[swapIdx] = a;
    setSections(copy);
  };

  if (loading) return <div>Loading…</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!product) return <div>Product not found.</div>;

  return (
    <div className="space-y-8 max-w-5xl">
      {isDirty && (
        <div className="fixed left-0 right-0 top-0 z-40 border-b bg-yellow-50 text-yellow-900">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
            <div className="text-sm font-medium flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-200">!</span>
              <span>Unsaved changes</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 rounded border text-sm" onClick={discardChanges} disabled={saving}>Discard</button>
              <button className="px-3 py-1 rounded bg-black text-white text-sm" onClick={saveAllEdits} disabled={!isDirty || saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit Product</h1>
        <div className="flex items-center gap-2">
          <a href={`/lp/${slug}`} target="_blank" className="px-3 py-2 rounded border">View LP</a>
          <button type="button" className="px-3 py-2 rounded border" onClick={()=>setPixelOpen(true)}>Meta Pixel</button>
        </div>
      </div>

      {/* Meta Pixel Modal */}
      <ProductMetaPixelModal productId={params.id} open={pixelOpen} onClose={()=>setPixelOpen(false)} />

      {/* Basics */}
      <section className="space-y-4 border rounded p-4">
        <h2 className="font-medium">Basics</h2>
        <div>
          <label className="block font-medium">Name <HelpTip>Customer-facing name shown on the landing page.</HelpTip></label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block font-medium">Slug <HelpTip>Short name used in the URL, e.g. air-tag. Must be unique.</HelpTip></label>
          <div className="flex gap-2 items-center">
            <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} className="mt-1 flex-1 border rounded px-3 py-2" />
            <button type="button" onClick={() => setSlug(slugify(name))} className="px-3 py-2 rounded border">Auto</button>
          </div>
          <p className="text-xs text-gray-600 mt-1">URL will be /lp/{'{slug}'}</p>
        </div>
        <div className="flex items-center gap-2">
          <input id="active" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <label htmlFor="active" className="font-medium">Active</label>
          <HelpTip>Controls whether the product is published and visible on its landing page.</HelpTip>
        </div>
        <div>
          <label className="block font-medium">Description (English) <HelpTip>Optional. Shown under the gallery on the LP. Leave empty to omit.</HelpTip></label>
          <div className="mt-1">
            <RichTextEditor value={descriptionEn} onChange={setDescriptionEn} placeholder="Type description..." />
          </div>
        </div>
        <div>
          <label className="block font-medium">Description (Urdu) <HelpTip>Optional. Shown under the gallery on the LP when provided.</HelpTip></label>
          <div className="mt-1">
            <RichTextEditor value={descriptionUr} onChange={setDescriptionUr} placeholder="اردو تفصیل یہاں لکھیں..." rtl />
          </div>
        </div>
        <div>
          <label className="block font-medium">Logo <HelpTip>Small brand/product logo shown near the title on the LP.</HelpTip></label>
          <div className="mt-2 flex items-start gap-4">
            <div className="w-28 h-28 border rounded grid place-items-center overflow-hidden bg-white">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo preview" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-xs text-gray-500">No logo</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="https://..."
                  value={logoUrl}
                  onChange={(e)=>setLogoUrl(e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                />
                <button type="button" className="px-3 py-2 rounded border" onClick={()=>setLogoUrl('')}>Clear</button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <input
                  id="logo-file"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e)=>{
                    const f = (e.currentTarget.files || [])[0];
                    if (!f) return;
                    const sizeMB = Number((f.size / (1024*1024)).toFixed(1));
                    if (sizeMB > MAX_IMAGE_MB) { setError(`Image is ${sizeMB} MB; max ${MAX_IMAGE_MB} MB.`); return; }
                    try {
                      setSaving(true);
                      const url = await uploadToBucket(f);
                      setLogoUrl(url);
                    } catch (err:any) {
                      setError(err?.message || 'Failed to upload logo');
                    } finally {
                      setSaving(false);
                    }
                  }}
                />
                <label htmlFor="logo-file" className="px-3 py-2 rounded border cursor-pointer">Upload</label>
                <HelpTip>Paste a public URL or click Upload to store in the product-media bucket.</HelpTip>
              </div>
            </div>
          </div>
        </div>
        <div>
          <button onClick={saveBasics} disabled={saving} className={`px-4 py-2 rounded text-white ${saving ? 'bg-gray-400' : 'bg-black hover:bg-gray-800'}`}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </section>

      {/* Promotions */}
      <section className="space-y-4 border rounded p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Promotions</h2>
          <button type="button" onClick={addEmptyPromotion} className="px-3 py-1.5 rounded border text-sm">Add promotion</button>
        </div>
        <p className="text-xs text-gray-600">Configure quantity-based discounts and Buy X Get Y offers for this product. Only the single best matching promotion is applied at checkout.</p>
        <div className="space-y-3 text-xs md:text-sm overflow-x-auto">
          {promotions.length === 0 && (
            <div className="text-gray-500 text-sm">No promotions yet. Click "Add promotion" to create one.</div>
          )}
          {promotions.length > 0 && (
            <table className="w-full min-w-[720px] border text-xs md:text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left">Active</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Min qty</th>
                  <th className="p-2 text-left">% off / Free qty</th>
                  <th className="p-2 text-left">Start (PK time)</th>
                  <th className="p-2 text-left">End (PK time)</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2 align-top">
                      <input
                        type="checkbox"
                        checked={p.active}
                        onChange={(e)=>updatePromotionField(p.id,{ active: e.target.checked })}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <input
                        value={p.name}
                        onChange={(e)=>updatePromotionField(p.id,{ name: e.target.value })}
                        className="w-full border rounded px-2 py-1"
                        placeholder="e.g. Buy 3 get 15% off"
                      />
                    </td>
                    <td className="p-2 align-top">
                      <select
                        value={p.type}
                        onChange={(e)=>updatePromotionField(p.id,{ type: (e.target.value as 'percent' | 'bxgy') })}
                        className="border rounded px-2 py-1 w-full"
                      >
                        <option value="percent">% discount</option>
                        <option value="bxgy">Buy X Get Y free</option>
                      </select>
                    </td>
                    <td className="p-2 align-top">
                      <input
                        type="number"
                        min={1}
                        value={p.min_qty}
                        onChange={(e)=>updatePromotionField(p.id,{ min_qty: Number(e.target.value || '0') })}
                        className="w-20 border rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="p-2 align-top">
                      {p.type === 'percent' ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={90}
                            step={0.1}
                            value={p.discount_pct ?? ''}
                            onChange={(e)=>updatePromotionField(p.id,{ discount_pct: e.target.value === '' ? null : Number(e.target.value) })}
                            className="w-24 border rounded px-2 py-1 text-right"
                            placeholder="10"
                          />
                          <span>%</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span>Free</span>
                          <input
                            type="number"
                            min={1}
                            value={p.free_qty ?? ''}
                            onChange={(e)=>updatePromotionField(p.id,{ free_qty: e.target.value === '' ? null : Number(e.target.value) })}
                            className="w-24 border rounded px-2 py-1 text-right"
                            placeholder="1"
                          />
                          <span>unit(s)</span>
                        </div>
                      )}
                    </td>
                    <td className="p-2 align-top">
                      <input
                        type="datetime-local"
                        value={p.start_at || ''}
                        onChange={(e)=>updatePromotionField(p.id,{ start_at: e.target.value || null })}
                        className="border rounded px-2 py-1 w-full"
                      />
                    </td>
                    <td className="p-2 align-top">
                      <input
                        type="datetime-local"
                        value={p.end_at || ''}
                        onChange={(e)=>updatePromotionField(p.id,{ end_at: e.target.value || null })}
                        className="border rounded px-2 py-1 w-full"
                      />
                    </td>
                    <td className="p-2 align-top text-right">
                      <button
                        type="button"
                        onClick={()=>removePromotionLocal(p.id)}
                        className="text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={savePromotions}
            disabled={savingPromos}
            className={`px-4 py-2 rounded text-white ${savingPromos ? 'bg-gray-400' : 'bg-black hover:bg-gray-800'}`}
          >
            {savingPromos ? 'Saving…' : 'Save promotions'}
          </button>
        </div>
      </section>

      {/* Checkout Extras */}
      <section className="space-y-4 border rounded p-4">
        <h2 className="font-medium">Checkout Extras</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input id="ce-daraz" type="checkbox" checked={darazEnabled} onChange={(e)=>setDarazEnabled(e.target.checked)} />
            <label htmlFor="ce-daraz" className="font-medium">Enable Buy on Daraz</label>
          </div>
          {darazEnabled && (
            <div>
              <label className="block text-sm">Daraz URL</label>
              <input value={darazUrl} onChange={(e)=>setDarazUrl(e.target.value)} placeholder="https://www.daraz.pk/..." className="mt-1 w-full border rounded px-3 py-2" />
            </div>
          )}
          {darazEnabled && (
            <div className="flex items-center gap-2">
              <input
                id="ce-daraz-trust"
                type="checkbox"
                checked={darazTrustLine}
                onChange={(e)=>setDarazTrustLine(e.target.checked)}
                disabled={!darazUrl.trim()}
              />
              <label htmlFor="ce-daraz-trust" className="text-sm">
                Show 'Same seller on Daraz' trust line
              </label>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input id="ce-chat" type="checkbox" checked={chatEnabled} onChange={(e)=>setChatEnabled(e.target.checked)} />
            <label htmlFor="ce-chat" className="font-medium">Enable Chat</label>
          </div>
          {chatEnabled && (
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm">Facebook Page URL (optional)</label>
                <input value={chatFacebookUrl} onChange={(e)=>setChatFacebookUrl(e.target.value)} placeholder="https://facebook.com/yourpage" className="mt-1 w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm">Instagram URL (optional)</label>
                <input value={chatInstagramUrl} onChange={(e)=>setChatInstagramUrl(e.target.value)} placeholder="https://instagram.com/yourprofile" className="mt-1 w-full border rounded px-3 py-2" />
              </div>
            </div>
          )}
          <div>
            <label className="block font-medium">Special message <HelpTip>Shown above the buttons in the checkout panel. Leave empty to hide.</HelpTip></label>
            <input value={specialMessage} onChange={(e)=>setSpecialMessage(e.target.value)} placeholder="e.g., Free delivery till Oct 31" className="mt-1 w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block font-medium">CTA button label <HelpTip>Text for the main checkout button on the landing page. Defaults to "Buy on AFAL" if left empty, e.g. you can use "Order Now" or "Start Order".</HelpTip></label>
            <input
              value={ctaLabel}
              onChange={(e)=>setCtaLabel(e.target.value)}
              placeholder="Buy on AFAL"
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block font-medium">CTA button size <HelpTip>Controls how prominent the main checkout button appears on the landing page for this product.</HelpTip></label>
            <select
              value={ctaSize}
              onChange={(e)=>setCtaSize((e.target.value as 'small' | 'medium' | 'large') || 'medium')}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="small">Small</option>
              <option value="medium">Medium (default)</option>
              <option value="large">Large</option>
            </select>
          </div>
        </div>
        <div>
          <button onClick={saveBasics} disabled={saving} className={`px-4 py-2 rounded text-white ${saving ? 'bg-gray-400' : 'bg-black hover:bg-gray-800'}`}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </section>

      {/* Social & Contact */}
      <section className="space-y-4 border rounded p-4">
        <h2 className="font-medium">Social & Contact</h2>
        <div className="space-y-4 text-sm">
          <div className="space-y-1">
            <label className="block font-medium">Facebook Page</label>
            <div className="flex items-center gap-2 mb-1">
              <input
                id="soc-fb-enabled"
                type="checkbox"
                checked={fbPageEnabled}
                onChange={(e)=>setFbPageEnabled(e.target.checked)}
              />
              <label htmlFor="soc-fb-enabled">Show on LP</label>
            </div>
            <input
              value={fbPageUrl}
              onChange={(e)=>setFbPageUrl(e.target.value)}
              placeholder="https://facebook.com/yourpage"
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-medium">Instagram</label>
            <div className="flex items-center gap-2 mb-1">
              <input
                id="soc-ig-enabled"
                type="checkbox"
                checked={instagramEnabled}
                onChange={(e)=>setInstagramEnabled(e.target.checked)}
              />
              <label htmlFor="soc-ig-enabled">Show on LP</label>
            </div>
            <input
              value={instagramUrl}
              onChange={(e)=>setInstagramUrl(e.target.value)}
              placeholder="https://instagram.com/yourprofile"
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-medium">WhatsApp</label>
            <div className="flex items-center gap-2 mb-1">
              <input
                id="soc-wa-enabled"
                type="checkbox"
                checked={whatsappEnabled}
                onChange={(e)=>setWhatsappEnabled(e.target.checked)}
              />
              <label htmlFor="soc-wa-enabled">Show on LP</label>
            </div>
            <input
              value={whatsappUrl}
              onChange={(e)=>setWhatsappUrl(e.target.value)}
              placeholder="https://wa.me/923xxxxxxxxx"
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-medium">Support email</label>
            <div className="flex items-center gap-2 mb-1">
              <input
                id="soc-email-enabled"
                type="checkbox"
                checked={contactEmailEnabled}
                onChange={(e)=>setContactEmailEnabled(e.target.checked)}
              />
              <label htmlFor="soc-email-enabled">Show on LP</label>
            </div>
            <input
              value={contactEmail}
              onChange={(e)=>setContactEmail(e.target.value)}
              placeholder="support@example.com"
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-medium">Support phone</label>
            <div className="flex items-center gap-2 mb-1">
              <input
                id="soc-phone-enabled"
                type="checkbox"
                checked={contactPhoneEnabled}
                onChange={(e)=>setContactPhoneEnabled(e.target.checked)}
              />
              <label htmlFor="soc-phone-enabled">Show on LP</label>
            </div>
            <input
              value={contactPhone}
              onChange={(e)=>setContactPhone(e.target.value)}
              placeholder="03xx-xxxxxxx"
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
        </div>
        <div>
          <button onClick={saveBasics} disabled={saving} className={`px-4 py-2 rounded text-white ${saving ? 'bg-gray-400' : 'bg-black hover:bg-gray-800'}`}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-3 border rounded p-4">
        <h2 className="font-medium text-red-700">Danger Zone</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={softDelete} className="px-4 py-2 rounded border border-amber-600 text-amber-700">Deactivate (soft delete)</button>
          <button onClick={hardDelete} className="px-4 py-2 rounded border border-red-700 text-red-700">Delete permanently</button>
        </div>
        <p className="text-xs text-gray-600">Permanent delete is blocked if any orders exist for this product's variants.</p>
        <p className="text-xs text-gray-600">Note: media files in Storage are not removed automatically in this version. We can add file-path tracking to support that later.</p>
      </section>

      {/* Variation Types */}
      <section className="space-y-2 border rounded p-4">
        <h2 className="font-medium">Variation types <HelpTip>Enable the dimensions you want to sell. Turning on a type allows creating variants that reference those values.</HelpTip></h2>
        <div className="flex items-center gap-6 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={enableColor} onChange={(e)=>setOptionEnabled('color', e.target.checked)} /> Color
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={enableSize} onChange={(e)=>setOptionEnabled('size', e.target.checked)} /> Size
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={enableModel} onChange={(e)=>setOptionEnabled('model', e.target.checked)} /> Model
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={enablePackage} onChange={(e)=>setOptionEnabled('package', e.target.checked)} /> Package
          </label>
        </div>
      </section>

      {/* Color/Size Options & Variants + Inventory */}
      <section className="space-y-4 border rounded p-4">
        <h2 className="font-medium">Variants & Inventory <HelpTip>Configure variant combinations, prices, and on-hand stock. Changes save inline on blur/click.</HelpTip></h2>
        <div className="space-y-3">
          <div>
            <h3 className="font-medium mb-2">Colors <HelpTip>Manage color values used for variants and the LP color chips.</HelpTip></h3>
            {enableColor ? (
              <>
                <div className="flex flex-wrap gap-2 mb-2">
                  {colors.map((c) => (
                    <span key={c.id} className="px-2 py-1 rounded-full border text-sm">{c.value}</span>
                  ))}
                </div>
                <div className="flex gap-2 items-center text-sm">
                  <input id="new-color" placeholder="Add color (e.g., Black)" className="border rounded px-2 py-1" />
                  <button className="px-3 py-1 rounded border" onClick={() => {
                    const v = (document.getElementById('new-color') as HTMLInputElement).value.trim();
                    if (v) { addColor(v); (document.getElementById('new-color') as HTMLInputElement).value=''; }
                  }}>Add Color</button>
                  <HelpTip>Colors power the LP color chips and pricing per color.</HelpTip>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Color variations disabled.</p>
            )}
          </div>

          <div>
            <h3 className="font-medium mb-2">Sizes <HelpTip>Add sizes like S/M/L. Only shown if Size is enabled above.</HelpTip></h3>
            {enableSize ? (
              <>
                <div className="flex flex-wrap gap-2 mb-2">
                  {sizes.map((s) => (
                    <span key={s.id} className="px-2 py-1 rounded-full border text-sm">{s.value}</span>
                  ))}
                </div>
                <div className="flex gap-2 items-center text-sm">
                  <input id="new-size" placeholder="Add size (e.g., M)" className="border rounded px-2 py-1" />
                  <button className="px-3 py-1 rounded border" onClick={() => {
                    const v = (document.getElementById('new-size') as HTMLInputElement).value.trim();
                    if (v) { addSize(v); (document.getElementById('new-size') as HTMLInputElement).value=''; }
                  }}>Add Size</button>
                  <HelpTip>Sizes let you manage S/M/L etc. alongside colors.</HelpTip>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Size variations disabled.</p>
            )}
          </div>

          <div>
            <h3 className="font-medium mb-2">Models <HelpTip>Optional dimension for product style or edition (e.g., Pro).</HelpTip></h3>
            {enableModel ? (
              <>
                <div className="flex flex-wrap gap-2 mb-2">
                  {models.map((m) => (
                    <span key={m.id} className="px-2 py-1 rounded-full border text-sm">{m.value}</span>
                  ))}
                </div>
                <div className="flex gap-2 items-center text-sm">
                  <input id="new-model" placeholder="Add model (e.g., Pro)" className="border rounded px-2 py-1" />
                  <button className="px-3 py-1 rounded border" onClick={() => {
                    const v = (document.getElementById('new-model') as HTMLInputElement).value.trim();
                    if (v) { addModel(v); (document.getElementById('new-model') as HTMLInputElement).value=''; }
                  }}>Add Model</button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Model variations disabled.</p>
            )}
          </div>

          <div>
            <h3 className="font-medium mb-2">Packages <HelpTip>Optional pack counts or bundles (e.g., 1-pack, 4-pack).</HelpTip></h3>
            {enablePackage ? (
              <>
                <div className="flex flex-wrap gap-2 mb-2">
                  {packages.map((p) => (
                    <span key={p.id} className="px-2 py-1 rounded-full border text-sm">{p.value}</span>
                  ))}
                </div>
                <div className="flex gap-2 items-center text-sm">
                  <input id="new-package" placeholder="Add package (e.g., 1-pack)" className="border rounded px-2 py-1" />
                  <button className="px-3 py-1 rounded border" onClick={() => {
                    const v = (document.getElementById('new-package') as HTMLInputElement).value.trim();
                    if (v) { addPackage(v); (document.getElementById('new-package') as HTMLInputElement).value=''; }
                  }}>Add Package</button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Package variations disabled.</p>
            )}
          </div>

          <div>
            <h3 className="font-medium mb-2">Add Variant <HelpTip>Create a new sellable SKU by combining options and setting price/active.</HelpTip></h3>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs">SKU <HelpTip>Your internal code for the specific variant. Must be unique.</HelpTip></label>
                <input id="v-sku" className="border rounded px-2 py-1" onChange={()=>setVariantFormChangedFlag(true)} />
              </div>
              <div>
                <label className="block text-xs">Price <HelpTip>Sale price shown to customers for this variant.</HelpTip></label>
                <input id="v-price" type="number" step="0.01" className="border rounded px-2 py-1 w-32" onChange={()=>setVariantFormChangedFlag(true)} />
              </div>
              <div>
                <label className="block text-xs">Color <HelpTip>Optional. Choose a color value to associate with this variant.</HelpTip></label>
                <select id="v-color" className="border rounded px-2 py-1" onChange={()=>setVariantFormChangedFlag(true)}>
                  <option value="">(none)</option>
                  {colors.map((c) => (
                    <option key={c.id} value={c.id}>{c.value}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs">Size <HelpTip>Optional. Choose a size value for this variant.</HelpTip></label>
                <select id="v-size" className="border rounded px-2 py-1" onChange={()=>setVariantFormChangedFlag(true)}>
                  <option value="">(none)</option>
                  {sizes.map((s) => (
                    <option key={s.id} value={s.id}>{s.value}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs">Model <HelpTip>Optional. Variant model/style if the type is enabled.</HelpTip></label>
                <select id="v-model" className="border rounded px-2 py-1" onChange={()=>setVariantFormChangedFlag(true)}>
                  <option value="">(none)</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.value}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs">Package <HelpTip>Optional. Pack count/bundle selection.</HelpTip></label>
                <select id="v-package" className="border rounded px-2 py-1" onChange={()=>setVariantFormChangedFlag(true)}>
                  <option value="">(none)</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>{p.value}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input id="v-active" type="checkbox" defaultChecked onChange={()=>setVariantFormChangedFlag(true)} />
                <label htmlFor="v-active" className="text-sm">Active <HelpTip>Uncheck to hide this variant from purchase without deleting it.</HelpTip></label>
              </div>
              <button className="px-3 py-1 rounded border" onClick={() => {
                const sku = (document.getElementById('v-sku') as HTMLInputElement).value.trim();
                const price = Number((document.getElementById('v-price') as HTMLInputElement).value || '0');
                const colorVal = (document.getElementById('v-color') as HTMLSelectElement).value;
                const sizeVal = (document.getElementById('v-size') as HTMLSelectElement).value;
                const modelVal = (document.getElementById('v-model') as HTMLSelectElement).value;
                const packVal = (document.getElementById('v-package') as HTMLSelectElement).value;
                const active = (document.getElementById('v-active') as HTMLInputElement).checked;
                if (!sku || !Number.isFinite(price)) return;
                // keep current behavior: add immediately, but also clear dirty
                addVariant({ sku, price, active, color_value_id: colorVal ? Number(colorVal) : null, size_value_id: sizeVal ? Number(sizeVal) : null, model_value_id: modelVal ? Number(modelVal) : null, package_value_id: packVal ? Number(packVal) : null });
                ['v-sku','v-price','v-color','v-size','v-model','v-package'].forEach((id)=>{ const el = document.getElementById(id) as any; if (el) el.value=''; });
                const av = document.getElementById('v-active') as HTMLInputElement | null; if (av) av.checked = true;
                setVariantFormChangedFlag(false);
              }}>Add</button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 gap-3">
              <h3 className="font-medium">Variants</h3>
              <div className="flex items-center gap-3">
                <button type="button" onClick={resyncOptionLinks} disabled={saving} className={`text-xs px-3 py-1.5 rounded border ${saving ? 'opacity-60' : 'hover:bg-gray-50'}`} title="Write the current option selections to the database for all variants">
                  Resync option links
                </button>
                <button type="button" onClick={runLpProbe} className="text-xs px-3 py-1.5 rounded border hover:bg-gray-50" title="Run LP probe to see colors and keys the landing page would build">
                  Debug: LP view
                </button>
                <label className="text-xs inline-flex items-center gap-2 select-none">
                  <input type="checkbox" checked={unlockVariantStructure} onChange={(e)=>setUnlockVariantStructure(e.target.checked)} />
                  <span className="inline-flex items-center gap-1">Unlock variant structure <span className="text-gray-500">(SKU & options)</span> <HelpTip>Keep this OFF to avoid accidental changes to SKU or option links. Turn ON only if you must fix a mistake; changes save inline.</HelpTip></span>
                </label>
              </div>
            </div>
            {lpProbe && (
              <div className="mb-3 text-xs border rounded p-2 bg-gray-50">
                <div className="font-medium mb-1">LP probe</div>
                <div className="mb-1">Colors: {lpProbe.colors.join(', ') || '—'}</div>
                <div className="max-h-32 overflow-auto whitespace-pre-wrap">Keys:\n{lpProbe.keys.join('\n')}</div>
              </div>
            )}
            <div className="overflow-auto">
              <div className="mb-3 text-sm p-2 rounded border bg-amber-50">
                Inventory is the source of truth. Edits here update the same counts shown on the Inventory page. Available = On hand − Reserved.
              </div>
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Color</th>
                    <th className="py-2 pr-3">Size</th>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3">Package</th>
                    <th className="py-2 pr-3">Price</th>
                    <th className="py-2 pr-3">On Hand</th>
                    <th className="py-2 pr-3">Adjust (±)</th>
                    <th className="py-2 pr-3">Active</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <input
                          id={`row-sku-${v.id}`}
                          defaultValue={v.sku}
                          readOnly={!unlockVariantStructure}
                          onChange={()=>unlockVariantStructure && setVariantsDirtyFlag(true)}
                          onBlur={(e)=> unlockVariantStructure && updateVariant(v.id,{ sku: e.target.value })}
                          className={`border rounded px-2 py-1 ${unlockVariantStructure ? '' : 'bg-gray-100 cursor-not-allowed'}`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <select id={`row-color-${v.id}`} value={v.color_value_id ?? ''} disabled={!unlockVariantStructure} onChange={(e)=>{ if (!unlockVariantStructure) return; setVariantsDirtyFlag(true); updateVariant(v.id,{ color_value_id: e.target.value ? Number(e.target.value) : null }); }} className={`border rounded px-2 py-1 ${unlockVariantStructure ? '' : 'bg-gray-100 cursor-not-allowed'}`}>
                          <option value="">(none)</option>
                          {colors.map((c) => (
                            <option key={c.id} value={c.id}>{c.value}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <select id={`row-size-${v.id}`} value={v.size_value_id ?? ''} disabled={!unlockVariantStructure} onChange={(e)=>{ if (!unlockVariantStructure) return; setVariantsDirtyFlag(true); updateVariant(v.id,{ size_value_id: e.target.value ? Number(e.target.value) : null }); }} className={`border rounded px-2 py-1 ${unlockVariantStructure ? '' : 'bg-gray-100 cursor-not-allowed'}`}>
                          <option value="">(none)</option>
                          {sizes.map((s) => (
                            <option key={s.id} value={s.id}>{s.value}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <select id={`row-model-${v.id}`} value={v.model_value_id ?? ''} disabled={!unlockVariantStructure} onChange={(e)=>{ if (!unlockVariantStructure) return; setVariantsDirtyFlag(true); updateVariant(v.id,{ model_value_id: e.target.value ? Number(e.target.value) : null }); }} className={`border rounded px-2 py-1 ${unlockVariantStructure ? '' : 'bg-gray-100 cursor-not-allowed'}`}>
                          <option value="">(none)</option>
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>{m.value}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <select id={`row-pack-${v.id}`} value={v.package_value_id ?? ''} disabled={!unlockVariantStructure} onChange={(e)=>{ if (!unlockVariantStructure) return; setVariantsDirtyFlag(true); updateVariant(v.id,{ package_value_id: e.target.value ? Number(e.target.value) : null }); }} className={`border rounded px-2 py-1 ${unlockVariantStructure ? '' : 'bg-gray-100 cursor-not-allowed'}`}>
                          <option value="">(none)</option>
                          {packages.map((p) => (
                            <option key={p.id} value={p.id}>{p.value}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <input id={`row-price-${v.id}`} type="number" step="0.01" defaultValue={v.price} onChange={()=>setVariantsDirtyFlag(true)} onBlur={(e)=>updateVariant(v.id,{ price: Number(e.target.value) })} className="border rounded px-2 py-1 w-28" />
                      </td>
                      <td className="py-2 pr-3">
                        <input id={`row-onhand-${v.id}`} type="number" defaultValue={v.on_hand ?? 0} onChange={()=>setVariantsDirtyFlag(true)} onBlur={(e)=>setOnHand(v.id, Number(e.target.value))} className="border rounded px-2 py-1 w-24" />
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <input id={`row-adjust-${v.id}`} type="number" className="border rounded px-2 py-1 w-20" placeholder="+/-" />
                          <button className="px-2 py-1 rounded border text-xs" onClick={()=>{
                            const el = document.getElementById(`row-adjust-${v.id}`) as HTMLInputElement | null;
                            const val = Number(el?.value || '0'); if (!val) return;
                            adjustOnHandDelta(v.id, val);
                            if (el) el.value = '';
                          }}>Receive +</button>
                          <button className="px-2 py-1 rounded border text-xs" onClick={()=>{
                            const el = document.getElementById(`row-adjust-${v.id}`) as HTMLInputElement | null;
                            const val = Number(el?.value || '0'); if (!val) return;
                            if (!confirm('Scrap this quantity?')) return;
                            adjustOnHandDelta(v.id, -Math.abs(val));
                            if (el) el.value = '';
                          }}>Scrap −</button>
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <input id={`row-active-${v.id}`} type="checkbox" defaultChecked={v.active} onChange={(e)=>{ setVariantsDirtyFlag(true); updateVariant(v.id,{ active: e.target.checked }); }} />
                      </td>
                      <td className="py-2 pr-3">
  <div className="flex items-center gap-2 mb-1">
    <input
      type="file"
      accept="image/*"
      id={`row-thumb-file-${v.id}`}
      className="hidden"
      onChange={async (e) => {
        // Capture input element immediately; React may pool the event
        const inputEl = e.currentTarget as HTMLInputElement;
        const f = (inputEl.files || [])[0];
        if (!f) return;
        try {
          setSaving(true);
          const url = await uploadToBucket(f);
          await updateVariant(v.id, { thumb_url: url });
          setVariants((prev) => prev.map((x) => (x.id === v.id ? { ...x, thumb_url: url } : x)));
        } catch (err: any) {
          setError(err?.message || 'Upload failed');
        } finally {
          setSaving(false);
          if (inputEl) inputEl.value = '';
        }
      }}
    />
    {/* Current thumbnail preview, if any */}
    {v.thumb_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={v.thumb_url as any} alt="thumb" className="w-8 h-8 object-cover rounded border" />
    ) : (
      <div className="w-8 h-8 rounded border bg-gray-100" />
    )}
    <button
      className="px-2 py-1 rounded border text-xs"
      onClick={() => { (document.getElementById(`row-thumb-file-${v.id}`) as HTMLInputElement)?.click(); }}
    >
      Change Thumb
    </button>
    {v.thumb_url && (
      <button
        className="px-2 py-1 rounded border text-xs"
        onClick={async () => {
          await updateVariant(v.id, { thumb_url: null });
          setVariants((prev) => prev.map((x) => (x.id === v.id ? { ...x, thumb_url: null } : x)));
        }}
      >
        Clear Thumb
      </button>
    )}
  </div>

  <button onClick={()=>removeVariant(v.id)} className="px-2 py-1 rounded border text-xs">Delete</button>
  </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Specifications Editor */}
      <section className="space-y-4 border rounded p-4">
        <h2 className="font-medium">Specifications <HelpTip>Key facts shown below the gallery on the landing page. Use Group to visually cluster rows.</HelpTip></h2>
        <div className="flex gap-2 mb-3">
          <button className="px-3 py-1 rounded border text-sm" onClick={() => addSpec('en')}>+ Add (EN)</button>
          <button className="px-3 py-1 rounded border text-sm" onClick={() => addSpec('ur')}>+ Add (UR)</button>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {(['en','ur'] as const).map((lng) => (
            <div key={lng} className={lng === 'ur' ? 'font-urdu' : ''} dir={lng === 'ur' ? 'rtl' : undefined}>
              <h3 className="font-medium mb-2">{lng.toUpperCase()} <HelpTip>Enter rows as Label/Value; optional Group to cluster related rows. Order with arrows.</HelpTip></h3>
              {(specs.filter(s => s.lang === lng)).map((s, idx) => (
                <div key={s.id} className="border rounded p-2 mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-1">
                      <button disabled={idx===0} className="px-2 py-1 rounded border text-xs disabled:opacity-50" onClick={() => moveSpec(s.id,'up')}>↑</button>
                      <button disabled={idx===specs.filter(x=>x.lang===lng).length-1} className="px-2 py-1 rounded border text-xs disabled:opacity-50" onClick={() => moveSpec(s.id,'down')}>↓</button>
                    </div>
                    <button className="px-2 py-1 rounded border text-xs" onClick={() => deleteSpec(s.id)}>Remove</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <input placeholder="Group" defaultValue={s.group ?? ''} onBlur={(e)=>updateSpec(s.id,{ group: e.target.value || null })} className="border rounded px-2 py-1" />
                    <input placeholder="Label" defaultValue={s.label} onBlur={(e)=>updateSpec(s.id,{ label: e.target.value })} className="border rounded px-2 py-1" />
                    <input placeholder="Value" defaultValue={s.value} onBlur={(e)=>updateSpec(s.id,{ value: e.target.value })} className="border rounded px-2 py-1" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Bottom Sections Editor */}
      <section className="space-y-4 border rounded p-4">
        <h2 className="font-medium">Bottom Sections <HelpTip>Optional sections shown beneath the main gallery: images, galleries, videos, or rich text blocks.</HelpTip></h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {(['image','gallery','video','rich_text'] as const).map((t) => (
            <button key={t} className="px-3 py-1 rounded border text-sm" onClick={() => addSection(t)}>+ Add {t}</button>
          ))}
        </div>
        <div className="space-y-3">
          {sections.map((sec, idx) => (
            <div key={sec.id} className="border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{sec.type}</span>
                <div className="flex gap-1">
                  <button disabled={idx===0} className="px-2 py-1 rounded border text-xs disabled:opacity-50" onClick={()=>moveSection(sec.id,'up')}>↑</button>
                  <button disabled={idx===sections.length-1} className="px-2 py-1 rounded border text-xs disabled:opacity-50" onClick={()=>moveSection(sec.id,'down')}>↓</button>
                  <button className="px-2 py-1 rounded border text-xs" onClick={()=>deleteSection(sec.id)}>Remove</button>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <label className="block text-xs">Title <HelpTip>Optional heading for this section.</HelpTip></label>
                  <input defaultValue={sec.title ?? ''} onBlur={(e)=>updateSection(sec.id,{ title: e.target.value || null })} className="w-full border rounded px-2 py-1" />
                </div>
                {sec.type === 'rich_text' ? (
                  <div className="md:col-span-2">
                    <label className="block text-xs">Body (HTML allowed) <HelpTip>Use simple HTML for formatting (e.g., <strong>bold</strong>, lists).</HelpTip></label>
                    <textarea defaultValue={sec.body ?? ''} onBlur={(e)=>updateSection(sec.id,{ body: e.target.value || null })} rows={4} className="w-full border rounded px-2 py-1" />
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <label className="block text-xs">Media URLs (comma-separated) <HelpTip>Paste one or more public URLs, separated by commas. Uploaded files append here automatically.</HelpTip></label>
                    <input defaultValue={Array.isArray(sec.media_refs)? sec.media_refs.join(',') : ''}
                      onBlur={(e)=>updateSection(sec.id,{ media_refs: e.target.value.split(',').map(v=>v.trim()).filter(Boolean) })}
                      className="w-full border rounded px-2 py-1" />
                    {/* Visual previews for current media_refs */}
                    {Array.isArray(sec.media_refs) && sec.media_refs.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-600 mb-1">Items: {sec.media_refs.length}</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {sec.media_refs.map((u: string, i: number) => (
                            <div key={i} className="relative border rounded overflow-hidden bg-gray-50 aspect-[1/1]">
                              {/* Simple type heuristic */}
                              {sec.type === 'video' || /\.(mp4|webm|mov)(\?|#|$)/i.test(u) ? (
                                <video className="absolute inset-0 w-full h-full object-cover" controls>
                                  <source src={u} />
                                </video>
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={u} alt={`media ${i+1}`} className="absolute inset-0 w-full h-full object-cover" />
                              )}
                              <button
                                className="absolute top-1 right-1 bg-white/80 hover:bg-white text-xs px-1.5 py-0.5 rounded border"
                                title="Remove"
                                onClick={async () => {
                                  const list = (sec.media_refs as string[]).filter((_, idx) => idx !== i);
                                  await updateSection(sec.id, { media_refs: list as any });
                                }}
                              >×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Upload from computer */}
                    {sec.type === 'image' && (
                      <div className="mt-2 text-xs">
                        <label className="block mb-1">Upload image <HelpTip>Choose an image from your computer to store and attach to this section.</HelpTip></label>
                        <input type="file" accept="image/*" onChange={async (e)=>{
                          const inputEl = e.currentTarget as HTMLInputElement;
                          const f = inputEl.files?.[0];
                          if (!f) return;
                          try {
                            setSaving(true);
                            const url = await uploadToBucket(f);
                            await appendSectionMedia(sec.id, [url]);
                          } catch (err:any) { setError(err?.message || 'Upload failed'); } finally { setSaving(false); if (inputEl) inputEl.value=''; }
                        }} />
                      </div>
                    )}
                    {sec.type === 'gallery' && (
                      <div className="mt-2 text-xs">
                        <label className="block mb-1">Upload images (multiple) <HelpTip>Select multiple images; they will be uploaded and added to the URL list.</HelpTip></label>
                        <input type="file" accept="image/*" multiple onChange={async (e)=>{
                          const inputEl = e.currentTarget as HTMLInputElement;
                          const files = Array.from(inputEl.files || []);
                          if (!files.length) return;
                          try {
                            setSaving(true);
                            const urls = await Promise.all(files.map(uploadToBucket));
                            await appendSectionMedia(sec.id, urls);
                          } catch (err:any) { setError(err?.message || 'Upload failed'); } finally { setSaving(false); if (inputEl) inputEl.value=''; }
                        }} />
                      </div>
                    )}
                    {sec.type === 'video' && (
                      <div className="mt-2 text-xs">
                        <label className="block mb-1">Upload video <HelpTip>Upload an MP4/H.264 clip. Keep size under the project limit for best playback.</HelpTip></label>
                        <input type="file" accept="video/*" onChange={async (e)=>{
                          const inputEl = e.currentTarget as HTMLInputElement;
                          const f = inputEl.files?.[0];
                          if (!f) return;
                          try {
                            setSaving(true);
                            const url = await uploadToBucket(f);
                            await appendSectionMedia(sec.id, [url]);
                          } catch (err:any) { setError(err?.message || 'Upload failed'); } finally { setSaving(false); if (inputEl) inputEl.value=''; }
                        }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Media Manager */}
      <section className="space-y-4 border rounded p-4">
        <h2 className="font-medium">Media (Top Gallery) <HelpTip>Manage the main gallery shown at the top of the landing page. The first item is the hero. Reorder with arrows.</HelpTip></h2>
        <p className="text-sm text-gray-600">First item becomes the hero image/video. Use the arrows to reorder. Add images or a video (with optional poster). Thumbnails on the left rail can use a smaller override if needed.</p>

        <div className="flex flex-wrap gap-3">
          {media.map((m, idx) => (
            <div key={m.id} className="border rounded p-2 w-56">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{m.type}</span>
                <div className="flex gap-1">
                  <button disabled={idx===0} onClick={() => move(m.id, 'up')} className="px-2 py-1 rounded border text-xs disabled:opacity-50">↑</button>
                  <button disabled={idx===media.length-1} onClick={() => move(m.id, 'down')} className="px-2 py-1 rounded border text-xs disabled:opacity-50">↓</button>
                </div>
              </div>
              <div className="mb-2">
                {m.type === 'image' ? (
                  <div className="relative w-full aspect-[1/1] border rounded overflow-hidden bg-gray-50">
                    {/* use thumb if present, else full url */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.thumb_url || m.url} alt={m.alt || ''} className="absolute inset-0 w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="relative w-full aspect-[1/1] border rounded overflow-hidden bg-gray-50 grid place-items-center">
                    <video className="max-w-full max-h-full" poster={m.poster_url || undefined} controls>
                      <source src={m.url} />
                    </video>
                  </div>
                )}
                <details className="mt-1">
                  <summary className="text-xs text-gray-600 cursor-pointer">Show URL</summary>
                  <div className="text-[10px] break-all mt-1">{m.url}</div>
                </details>
              </div>
              <div className="space-y-1">
                <label className="block text-xs">Alt <HelpTip>Short description for accessibility and SEO.</HelpTip></label>
                <input defaultValue={m.alt ?? ''} onBlur={(e) => setAlt(m.id, e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                {m.type === 'image' && (
                  <div className="mt-2 space-y-1">
                    <label className="block text-xs">Thumbnail override (optional) <HelpTip>Use a smaller, cropped, or optimized image for the sidebar thumbnail if desired.</HelpTip></label>
                    <input type="file" accept="image/*" onChange={(e)=> e.target.files && updateMediaField(m.id,'thumb_url', e.target.files[0])} />
                    {m.thumb_url && <div className="text-[10px] text-gray-600 break-all">thumb: {m.thumb_url}</div>}
                  </div>
                )}
                {m.type === 'video' && (
                  <div className="mt-2 space-y-1">
                    <label className="block text-xs">Poster image (optional) <HelpTip>Still image shown before playback or if video cannot auto-play.</HelpTip></label>
                    <input type="file" accept="image/*" onChange={(e)=> e.target.files && updateMediaField(m.id,'poster_url', e.target.files[0])} />
                    {m.poster_url && <div className="text-[10px] text-gray-600 break-all">poster: {m.poster_url}</div>}
                    <button
                      type="button"
                      className="mt-1 px-2 py-1 rounded border text-xs"
                      onClick={() => generatePosterFromVideo(m as any, 1)}
                      title="Capture a frame around 1s and set as poster"
                    >
                      Generate poster from 1s
                    </button>
                  </div>
                )}
                <button onClick={() => removeMedia(m.id)} className="mt-2 w-full px-2 py-1 rounded border text-xs">Remove</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="space-y-2">
            <label className="block font-medium">Add image <HelpTip>Upload a new image to the gallery. It will appear at the end; reorder as needed.</HelpTip></label>
            <input type="file" accept="image/*" onChange={(e) => e.target.files && addImage(e.target.files[0])} />
          </div>
          <div className="space-y-2">
            <label className="block font-medium">Add video <HelpTip>Upload one video to the gallery. Consider 720p MP4/H.264 for compatibility.</HelpTip></label>
            <input id="video-file" type="file" accept="video/*" onChange={(e)=> { const f = e.currentTarget.files?.[0]; setVideoReady(!!f); if (f) analyzeVideo(f); }} />
            <div className="text-xs text-gray-500">Max {MAX_VIDEO_MB} MB. Use MP4/H.264 for best compatibility.</div>
            <div>
              <button
                disabled={!videoReady}
                className={`px-3 py-2 rounded border ${videoReady ? (saving ? 'bg-gray-400 text-white' : 'bg-black text-white hover:bg-gray-900') : 'bg-gray-200 text-gray-600 cursor-not-allowed'}`}
                onClick={async () => {
                  const inputEl = document.getElementById('video-file') as HTMLInputElement | null;
                  const v = inputEl?.files?.[0];
                  if (!v) return;
                  await addVideo(v);
                  if (inputEl) inputEl.value = '';
                  setVideoReady(false);
                  setVideoAdvice(null);
                }}
              >{saving ? 'Uploading…' : 'Upload video'}</button>
            </div>
            {videoAdvice && (
              <div className="mt-2 p-2 border rounded bg-gray-50 text-xs">
                <div><span className="font-medium">Selected:</span> {videoAdvice.name} ({videoAdvice.sizeMB} MB)</div>
                {videoAdvice.durationSec != null ? (
                  <>
                    <div><span className="font-medium">Duration:</span> {Math.round(videoAdvice.durationSec)} sec</div>
                    <div>
                      <span className="font-medium">Target bitrate:</span> {videoAdvice.targetBitrateKbps} kbps video + ~128 kbps audio
                    </div>
                    <div className="mt-1 font-mono whitespace-pre-wrap break-words">
{`ffmpeg -i input.mp4 -vcodec libx264 -b:v ${videoAdvice.targetBitrateKbps}k -acodec aac -b:a 128k -movflags +faststart -preset medium -vf "scale=-2:720" output.mp4`}
                    </div>
                  </>
                ) : (
                  <div>Could not read duration. You can still try exporting at 720p, ~2500 kbps video.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="text-xs text-gray-500">More editors (Options/Variants, Specs, Bottom Sections) will appear here next.</div>
    </div>
  );
}
