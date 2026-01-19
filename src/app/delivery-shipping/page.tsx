import Link from 'next/link';

export default function DeliveryShippingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-r from-blue-50 via-blue-100 to-blue-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-blue-900">Delivery &amp; Shipping</h1>
          <p className="text-sm text-blue-700">
            Cash on Delivery across major cities in Pakistan, with clear timelines and terms so you know what to expect.
          </p>
        </header>

        <section className="space-y-3 bg-white/80 rounded-xl shadow-sm p-6 border border-blue-100">
          <h2 className="text-xl font-semibold text-blue-900">Cash on Delivery (COD)</h2>
          <ul className="list-disc pl-5 text-sm text-blue-800 space-y-1">
            <li>COD is available in major cities across Pakistan, including Karachi, Lahore, Islamabad, Rawalpindi, Peshawar, and Faisalabad.</li>
            <li>You pay the courier in cash when the parcel arrives at your address.</li>
            <li>Please have the exact amount ready to speed up delivery.</li>
            <li>If the courier is unable to reach you after repeated attempts, the order may be returned to us.</li>
          </ul>
        </section>

        <section className="space-y-3 bg-white/80 rounded-xl shadow-sm p-6 border border-blue-100">
          <h2 className="text-xl font-semibold text-blue-900">Dispatch &amp; Delivery Timelines</h2>
          <ul className="list-disc pl-5 text-sm text-blue-800 space-y-1">
            <li>Most paid and confirmed COD orders are dispatched within <span className="font-semibold">24–48 working hours</span>.</li>
            <li>Delivery time after dispatch is usually 2–5 working days, depending on your city and courier operations.</li>
            <li>Public holidays, extreme weather, or courier operational issues may add extra days.</li>
            <li>If your parcel is delayed beyond normal timelines, you can contact our support team for an update.</li>
          </ul>
        </section>

        <section className="space-y-3 bg-white/80 rounded-xl shadow-sm p-6 border border-blue-100">
          <h2 className="text-xl font-semibold text-blue-900">Address &amp; Delivery Attempts</h2>
          <ul className="list-disc pl-5 text-sm text-blue-800 space-y-1">
            <li>Please provide a complete and accurate address, including landmark and active phone number.</li>
            <li>If the courier cannot contact you or locate the address, they may mark the parcel as undeliverable.</li>
            <li>Repeated refusals or fake addresses may result in restrictions on future COD orders.</li>
          </ul>
        </section>

        <section className="space-y-3 text-sm text-blue-800 bg-white/70 rounded-xl p-4 border border-blue-100">
          <p>
            For questions about shipping, delivery status, or urgent changes to your address, please contact our support team
            using the details on your product page or the <Link href="/" className="text-blue-700 font-medium hover:text-blue-900">Afal Store homepage</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
