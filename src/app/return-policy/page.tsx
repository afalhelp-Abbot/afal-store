export default function ReturnPolicyPage() {
  const email = 'afalhelp@gmail.com';
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Return & Refund Policy</h1>
      <p className="text-gray-700">We sell in Pakistan and stand behind the quality of our products. If a product arrives defective or stops working within the window below, we will make it right.</p>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">Eligibility</h2>
        <ul className="list-disc pl-6 space-y-1 text-gray-700">
          <li>Returns are accepted only for <span className="font-medium">manufacturing defects</span>.</li>
          <li>Item must be in <span className="font-medium">original condition</span> with all accessories and <span className="font-medium">original packaging intact</span>.</li>
          <li>Request must be made within <span className="font-medium">7 days of receiving</span> the order.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">How to request a return</h2>
        <ol className="list-decimal pl-6 space-y-1 text-gray-700">
          <li>Email us at <a className="text-blue-600 hover:underline" href={`mailto:${email}`}>{email}</a> with your order ID, issue description, and photos/video if possible.</li>
          <li>Our support team will <span className="font-medium">inspect and verify</span> the claim. We may request additional details.</li>
          <li>Once approved, we will arrange a pickup or provide return instructions. For approved defect claims, <span className="font-medium">we cover return shipping</span>.</li>
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">Refund method & timeline</h2>
        <p className="text-gray-700">After the return is received and approved, the refund will be issued within <span className="font-medium">14 days</span> via <span className="font-medium">Easypaisa</span> to the number used at checkout (or a number you confirm with support).</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">Exclusions</h2>
        <ul className="list-disc pl-6 space-y-1 text-gray-700">
          <li>Damage caused by misuse, drops, water ingress beyond rating, or unauthorized repairs.</li>
          <li>Missing accessories, user manuals, or packaging.</li>
          <li>Normal wear and tear or cosmetic damage that does not affect function.</li>
          <li>Change-of-mind purchases.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">Exchange</h2>
        <p className="text-gray-700">For verified defects we can exchange the item for the same model instead of a refund if you prefer.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">Need help?</h2>
        <p className="text-gray-700">Contact our Pakistan-based support team at <a className="text-blue-600 hover:underline" href={`mailto:${email}`}>{email}</a>. We’re here to help.</p>
      </section>
    </div>
  );
}
