import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { EmailListClient, EmailRow, EmailTemplate } from './EmailListClient';

export const dynamic = 'force-dynamic';

export default async function EmailListPage() {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const { data } = await supabase
    .from('email_list')
    .select('id, email, name, phone, city, province_code, last_order_at, source, created_at')
    .order('last_order_at', { ascending: false });

  const { data: templateRows } = await supabase
    .from('email_templates')
    .select('code, name, subject_tpl, body_tpl')
    .order('name', { ascending: true });

  const rows: EmailRow[] = (data || []).map((r: any) => ({
    id: String(r.id),
    email: r.email,
    name: r.name,
    phone: r.phone,
    city: r.city,
    province_code: r.province_code,
    last_order_at: r.last_order_at,
    source: r.source,
  }));

  const templates: EmailTemplate[] = (templateRows || []).map((t: any) => ({
    code: String(t.code),
    name: String(t.name),
    subject_tpl: String(t.subject_tpl),
    body_tpl: String(t.body_tpl),
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Email list</h1>

      <div className="border rounded p-4">
        <h2 className="font-medium">Email list capabilities (This Page)</h2>
        <ul className="list-disc pl-5 text-sm mt-2 space-y-1 text-gray-700">
          <li>View all customer email addresses captured from orders.</li>
          <li>Quickly open Gmail in this browser to send a message to one or many selected customers.</li>
          <li>Each email opens as an individual compose window so customers do not see each other.</li>
        </ul>
      </div>

      <EmailListClient rows={rows} templates={templates} />
    </div>
  );
}
