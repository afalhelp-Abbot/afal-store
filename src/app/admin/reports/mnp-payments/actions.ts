'use server';

import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { revalidatePath } from 'next/cache';

const MNP_API_BASE = 'https://mnpcourier.com/mycodapi/api';

type PaymentReportResponse = {
  ZoneName?: string;
  BranchName?: string;
  AccountNo?: string;
  AcccountName?: string;
  BeneficiaryName?: string;
  BeneficiaryBankAccount?: string;
  BankName?: string;
  Details?: Array<{
    serial_no: number;
    PaymentID: string;
    PaidOn: string;
    RRAmount: number;
    InvoiceAmount: number;
    NetPayable: number;
    InstrumentMode: string;
    InstrumentNumber: string;
  }>;
};

export async function syncMnpPaymentReportAction(formData: FormData) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const dateFrom = String(formData.get('dateFrom') || '');
  const dateTo = String(formData.get('dateTo') || '');

  if (!dateFrom || !dateTo) {
    return { ok: false, message: 'Date range is required' } as const;
  }

  // Get M&P credentials
  const username = process.env.MNP_USERNAME;
  const password = process.env.MNP_PASSWORD;
  const locationId = process.env.MNP_LOCATION_ID;
  const accountNo = process.env.MNP_ACCOUNT_NO;
  const subAccountId = process.env.MNP_SUB_ACCOUNT_ID;

  if (!username || !password || !locationId) {
    return { ok: false, message: 'M&P credentials not configured' } as const;
  }

  // Create sync log entry
  const { data: syncLog, error: logErr } = await supabase
    .from('courier_sync_logs')
    .insert({
      courier_api_type: 'mnp',
      sync_type: 'payment_report',
      triggered_by: 'manual',
      status: 'running',
    })
    .select()
    .single();

  if (logErr) {
    console.error('[M&P] Failed to create sync log:', logErr);
  }

  try {
    // Call M&P Payment Report API
    // Note: M&P uses "Payment_Report" endpoint with specific date format
    const payload = {
      UserName: username,
      Password: password,
      dateFrom: `${dateFrom}T00:00:00.000Z`,
      dateTo: `${dateTo}T23:59:59.999Z`,
      locationID: locationId,
      AccountNo: accountNo,
      subAccountId: subAccountId || '0',
    };

    console.log('[M&P] Payment Report request:', JSON.stringify(payload, null, 2));

    const response = await fetch(`${MNP_API_BASE}/Reports/Payment_Report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('[M&P] Payment Report response:', JSON.stringify(result, null, 2));

    // Parse response - it may be an array
    const data: PaymentReportResponse = Array.isArray(result) ? result[0] : result;

    if (!data || !data.Details || data.Details.length === 0) {
      // Update sync log with raw response for debugging
      if (syncLog) {
        await supabase
          .from('courier_sync_logs')
          .update({
            ended_at: new Date().toISOString(),
            status: 'completed',
            total_orders: 0,
            orders_updated: 0,
            api_calls_made: 1,
            errors: { raw_response: result, message: 'No Details array in response' },
          })
          .eq('id', syncLog.id);
      }

      return { ok: true, recordsAdded: 0, message: 'No payment records found. Check Sync Logs for API response.' } as const;
    }

    // Insert payment records
    let recordsAdded = 0;
    for (const detail of data.Details) {
      const { error: insertErr } = await supabase
        .from('mnp_payment_records')
        .upsert({
          payment_id: detail.PaymentID,
          paid_on: detail.PaidOn,
          rr_amount: detail.RRAmount,
          invoice_amount: detail.InvoiceAmount,
          net_payable: detail.NetPayable,
          instrument_mode: detail.InstrumentMode,
          instrument_number: detail.InstrumentNumber,
          zone_name: data.ZoneName,
          branch_name: data.BranchName,
          account_no: data.AccountNo,
          date_from: dateFrom,
          date_to: dateTo,
          raw_response: detail,
        }, {
          onConflict: 'payment_id,paid_on',
        });

      if (!insertErr) {
        recordsAdded++;
      }
    }

    // Update sync log
    if (syncLog) {
      await supabase
        .from('courier_sync_logs')
        .update({
          ended_at: new Date().toISOString(),
          status: 'completed',
          total_orders: data.Details.length,
          orders_updated: recordsAdded,
          api_calls_made: 1,
        })
        .eq('id', syncLog.id);
    }

    revalidatePath('/admin/reports/mnp-payments');

    return { ok: true, recordsAdded } as const;
  } catch (err: any) {
    // Update sync log with error
    if (syncLog) {
      await supabase
        .from('courier_sync_logs')
        .update({
          ended_at: new Date().toISOString(),
          status: 'failed',
          error_message: err.message,
        })
        .eq('id', syncLog.id);
    }

    return { ok: false, message: `API error: ${err.message}` } as const;
  }
}
