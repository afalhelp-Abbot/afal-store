'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import ImageCarousel from './ImageCarousel';

type HomePresenterProps = {
  onAddToCart?: () => void;
  startingPrice?: number | null;
  colorPrices?: Record<string, number>;
  colorAvailability?: Record<string, number>;
  products?: { id: string; name: string; slug: string; fromPrice: number | null; image: string | null }[];
  logoUrl?: string | null;
  contactEmail?: string | null;
  fbPageUrl?: string | null;
  activeProductsCount?: number;
  singleProductSlug?: string | null;
};

type ColorOption = {
  name: string;
  value: string;
  tailwindClass: string;
};

export default function HomePresenter({ onAddToCart, startingPrice, colorPrices, colorAvailability, products, logoUrl, contactEmail, fbPageUrl, activeProductsCount, singleProductSlug }: HomePresenterProps) {
  const router = useRouter();
  const tealName = React.useMemo(() => (colorPrices && 'Teal' in (colorPrices ?? {}) && !('Teel' in (colorPrices ?? {})) ? 'Teal' : 'Teel'), [colorPrices]);
  const colorOptions: ColorOption[] = React.useMemo(() => ([
    { name: 'Black', value: '#000000', tailwindClass: 'bg-black' },
    { name: 'White', value: '#FFFFFF', tailwindClass: 'bg-white ring-1 ring-gray-200' },
    { name: 'Pink', value: '#EC4899', tailwindClass: 'bg-pink-500' },
    { name: tealName, value: '#14B8A6', tailwindClass: 'bg-teal-500' },
  ]), [tealName]);
  const [selectedColor, setSelectedColor] = React.useState<ColorOption>(colorOptions[0]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const hasProducts = Array.isArray(products) && products.length > 0;
  const activeProduct = hasProducts ? products[Math.max(0, Math.min(activeIndex, products.length - 1))] : null;
  const productCards = Array.isArray(products) ? products.slice(0, 4) : [];
  const hasSlider = Array.isArray(products) && products.length > 4;
  const handleAdd = React.useCallback(() => {
    if (typeof onAddToCart === 'function') onAddToCart();
  }, [onAddToCart]);
  const scrollOrRouteToProducts = React.useCallback(() => {
    const count = typeof activeProductsCount === 'number' ? activeProductsCount : (Array.isArray(products) ? products.length : 0);

    // If exactly one active product, go straight to that LP using the most reliable slug.
    if (count === 1) {
      const fallbackSlug = Array.isArray(products) && products.length === 1 ? products[0].slug : undefined;
      const targetSlug = singleProductSlug || fallbackSlug;
      if (targetSlug) {
        router.push(`/lp/${targetSlug}`);
        return;
      }
    }

    if (typeof document === 'undefined') return;
    const el = document.getElementById('home-products');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeProductsCount, singleProductSlug, products, router]);
  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-100 via-blue-200 to-blue-100">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-sm shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="flex items-center gap-2">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="Afal Store logo"
                    className="h-8 w-8 sm:h-10 sm:w-10 rounded-md object-contain border border-blue-100 bg-white"
                  />
                ) : null}
                <h1 className="text-2xl sm:text-3xl font-bold text-blue-600">Afal Store</h1>
              </div>
              <span className="text-blue-700 tracking-wide uppercase text-xs sm:text-sm font-medium">Ultimate Shopping Store</span>
            </div>
            <nav className="flex items-center space-x-2 sm:space-x-4">
              {/* Desktop nav */}
              <div className="hidden sm:flex items-center space-x-8">
                <Link href="/products" className="text-blue-700 hover:text-blue-800 font-medium transition-colors">Products</Link>
                <button className="text-blue-700 hover:text-blue-800 relative group">
                  <svg className="w-6 h-6 transform group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </button>
              </div>
              {/* Mobile hamburger */}
              <button
                type="button"
                className="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-label="Toggle navigation menu"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </svg>
              </button>
            </nav>
          </div>
        </div>
        {/* Mobile nav menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-blue-100 bg-white/95">
            <div className="max-w-7xl mx-auto px-4 py-2 space-y-1">
              <Link
                href="/products"
                className="block px-2 py-2 text-sm font-medium text-blue-800 hover:bg-blue-50 rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                Products
              </Link>
              <Link
                href="/return-policy"
                className="block px-2 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                Returns Policy
              </Link>
              <Link
                href={contactEmail ? `mailto:${contactEmail}` : (fbPageUrl || '#')}
                className="block px-2 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                Contact / Support
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section (brand-level) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Brand story */}
          <div className="text-white space-y-8">
            <h2 className="text-4xl sm:text-5xl font-bold text-blue-900">Afal Store — Smart Tech, Delivered Across Pakistan</h2>
            <div className="space-y-6 max-w-2xl">
              <div className="h-px w-24 bg-gradient-to-r from-blue-600 via-blue-400 to-transparent" />
              <p className="text-lg sm:text-xl text-blue-900 leading-relaxed tracking-wide font-medium">
                Cash on Delivery • 24–48h Dispatch • Easy Returns — buy with confidence.
              </p>
              <p className="text-sm sm:text-base text-blue-900 leading-relaxed font-urdu" dir="rtl">
                پاکستان بھر میں کیش آن ڈیلیوری • 24–48 گھنٹے ڈسپیچ • آسان ریٹرنز
              </p>
              <p className="text-base text-blue-800 leading-relaxed">
                We source practical, everyday devices and ship them directly from our team – clear pricing, fast dispatch, and
                real support after delivery.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-blue-900">Cash on Delivery</h3>
                    <p className="text-sm text-blue-800">Pay at your doorstep in major cities across Pakistan.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h11M9 21V3m4 18l7-8-7-8" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-blue-900">24–48h Dispatch</h3>
                    <p className="text-sm text-blue-800">Orders leave our warehouse quickly so you get devices sooner.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v16h16V4H4zm4 6h8m-8 4h5" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-blue-900">Easy Returns</h3>
                    <p className="text-sm text-blue-800">Clear, written return policy so there is no confusion.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-4">
              <Link
                href="/products"
                className="inline-flex items-center justify-center font-medium px-8 py-3 rounded-lg transition-all text-white bg-blue-600 hover:bg-blue-700 shadow-sm"
              >
                Explore Products
              </Link>
            </div>
          </div>

          {/* Visual side – generic brand visual (no product-specific copy) */}
          <div className="relative flex items-center justify-center bg-gradient-to-r from-blue-100/50 via-blue-200/50 to-blue-100/50 rounded-3xl overflow-hidden p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.7)_0%,transparent_70%)]" />
            
            {/* Feature Badges */}
            <div className="absolute top-6 left-6 flex gap-2">
              <div className="bg-blue-500/90 backdrop-blur-sm text-white text-sm font-medium px-3 py-1 rounded-full shadow-sm">
                Slim
              </div>
              <div className="bg-blue-500/90 backdrop-blur-sm text-white text-sm font-medium px-3 py-1 rounded-full shadow-sm">
                Light
              </div>
              <div className="bg-blue-500/90 backdrop-blur-sm text-white text-sm font-medium px-3 py-1 rounded-full shadow-sm">
                Compact
              </div>
            </div>

            <div className="relative w-full max-w-4xl mx-auto px-4 py-8">
              <div className="relative w-full max-w-2xl mx-auto bg-blend-screen">
                <div className="absolute inset-0 bg-gradient-to-t from-blue-600/10 to-transparent" />
                <Image
                  src="/images/2c6e7458128b076e82bd99f52ab130c8.avif"
                  alt="Afal Store smart devices"
                  width={800}
                  height={600}
                  className="w-full h-auto select-none mix-blend-multiply brightness-110"
                  priority
                  quality={100}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Why Afal Store (generic trust section) */}
      <div className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-100/50 to-white/50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.1)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.1)_0%,transparent_50%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-3xl sm:text-4xl font-bold text-blue-900">Why shop with Afal Store?</h2>
            <p className="text-lg text-blue-800 leading-relaxed">
              Reliable delivery, clear policies, and support that actually replies.
            </p>
            <p className="text-sm text-blue-700 font-urdu" dir="rtl">
              اعتماد، آسان ریٹرنز، اور بروقت ڈلیوری — یہی ہمارا وعدہ ہے۔
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mt-6 text-left">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </div>
                <h3 className="font-semibold text-blue-900">Verified Delivery Experience</h3>
                <p className="text-sm text-blue-700">Clear dispatch timelines and delivery updates so you know what to expect.</p>
              </div>
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h11M9 21V3m4 18l7-8-7-8" />
                  </svg>
                </div>
                <h3 className="font-semibold text-blue-900">Fast Dispatch</h3>
                <p className="text-sm text-blue-700">Most orders leave our warehouse within 2438 hours after confirmation.</p>
              </div>
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-blue-900">Easy Returns Policy</h3>
                <p className="text-sm text-blue-700">Simple return rules shown upfront so there is no confusion.</p>
              </div>
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M8 5v14m8-14v14M5 9h2m10 0h2M5 15h2m10 0h2" />
                  </svg>
                </div>
                <h3 className="font-semibold text-blue-900">Direct Support</h3>
                <p className="text-sm text-blue-700">Talk to our team on WhatsApp or email before and after purchase.</p>
              </div>
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h6" />
                  </svg>
                </div>
                <h3 className="font-semibold text-blue-900">Curated Products Only</h3>
                <p className="text-sm text-blue-700">We only list products we can support properly with parts and service.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Information */}
      <div className="relative py-24 overflow-hidden">
        {/* Background with Dots Pattern */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-100 via-blue-200 to-blue-100" />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(59,130,246,0.1) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="relative p-10 rounded-2xl bg-white/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-transparent to-blue-50/30 rounded-2xl" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <p className="text-2xl text-blue-800 leading-loose font-urdu text-right" dir="rtl">
                ہر آرڈر کے ساتھ ہمارا وعدہ ہے — صاف بات، تیز ڈلیوری، اور آسان واپسی۔<br />
                افال اسٹور کے ساتھ آن لائن خریداری کو بنائیں بے فکر اور پُراعتماد۔
              </p>
              <div className="mt-10 pt-6 border-t border-blue-100/50">
                <div className="flex items-center gap-3 text-blue-700">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">
                    <span className="font-medium">Available Across Pakistan:</span> Cash on Delivery in all major cities including Karachi, Lahore, Islamabad, Rawalpindi, Peshawar, and Faisalabad
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Products Grid / Slider (admin-driven, up to 4 items) */}
      {productCards.length > 0 && (
        <div id="home-products" className="py-16 bg-white/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xl font-bold text-blue-900">Products</h3>
              <a href="/products" className="text-blue-700 hover:text-blue-900 text-sm font-medium">View all</a>
            </div>
            <p className="text-sm text-blue-700 mb-6">Choose a product to see full details, photos, and order options.</p>

            {/* If we have more than 4 total active products, render a horizontal slider using the first 4 cards */}
            {hasSlider ? (
              <div className="flex flex-nowrap overflow-x-auto gap-6 pb-4 -mx-2 px-2 scrollbar-blue snap-x snap-mandatory">
                {productCards.map((p) => (
                  <Link
                    key={p.id}
                    href={`/lp/${p.slug}`}
                    className="flex-none w-[260px] sm:w-[280px] snap-start group rounded-xl border border-blue-100 bg-white hover:shadow-md transition-shadow overflow-hidden"
                  >
                    <div className="aspect-[4/3] w-full bg-blue-50 grid place-items-center overflow-hidden">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                        />
                      ) : (
                        <div className="text-blue-300 text-sm">Image coming soon</div>
                      )}
                    </div>
                    <div className="p-4 space-y-1">
                      <div className="font-medium text-blue-900 truncate">{p.name}</div>
                      <div className="text-sm text-blue-700">
                        {p.fromPrice != null
                          ? `From PKR ${Number(p.fromPrice).toLocaleString()}`
                          : 'Price coming soon'}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[11px] font-medium border border-blue-100">Cash on Delivery</span>
                        <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[11px] font-medium border border-blue-100">Fast Dispatch</span>
                      </div>
                      <div className="pt-2 text-sm text-blue-600 group-hover:text-blue-800 font-medium">View details 92</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {productCards.map((p) => (
                  <Link
                    key={p.id}
                    href={`/lp/${p.slug}`}
                    className="group rounded-xl border border-blue-100 bg-white hover:shadow-md transition-shadow overflow-hidden"
                  >
                    <div className="aspect-[4/3] w-full bg-blue-50 grid place-items-center overflow-hidden">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                        />
                      ) : (
                        <div className="text-blue-300 text-sm">Image coming soon</div>
                      )}
                    </div>
                    <div className="p-4 space-y-1">
                      <div className="font-medium text-blue-900 truncate">{p.name}</div>
                      <div className="text-sm text-blue-700">
                        {p.fromPrice != null
                          ? `From PKR ${Number(p.fromPrice).toLocaleString()}`
                          : 'Price coming soon'}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[11px] font-medium border border-blue-100">Cash on Delivery</span>
                        <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[11px] font-medium border border-blue-100">Fast Dispatch</span>
                      </div>
                      <div className="pt-2 text-sm text-blue-600 group-hover:text-blue-800 font-medium">View details 92</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Footer / final trust strip */}
      <footer className="border-t border-blue-100 bg-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-blue-800">
            <Link href="/delivery-shipping" className="hover:text-blue-900 underline-offset-2 hover:underline">Delivery &amp; Shipping</Link>
            <Link href="/return-policy" className="hover:text-blue-900 underline-offset-2 hover:underline">Returns Policy</Link>
            <Link
              href={contactEmail ? `mailto:${contactEmail}` : (fbPageUrl || '#')}
              className="hover:text-blue-900 underline-offset-2 hover:underline"
            >
              Contact / Support
            </Link>
          </div>
          <div className="text-sm text-blue-700">
            Cash on Delivery available 1 Fast dispatch 1 Easy returns 1 Support that responds.
          </div>
          <p className="text-sm text-blue-700 font-urdu" dir="rtl">
            کیش آن ڈیلیوری 1 تیز ڈسپیچ 1 آسان ریٹرنز 1 فوری سپورٹ
          </p>
        </div>
      </footer>
    </div>
  );
}
