/**
 * M&P Courier API Client
 * Documentation: M&P COD API Document
 */

const MNP_API_BASE = 'https://mnpcourier.com/mycodapi/api';

type MnpCredentials = {
  username: string;
  password: string;
  accountNo: string;
  locationId: string;
  returnLocation: string;
  subAccountId: string;
};

function getCredentials(): MnpCredentials {
  const username = process.env.MNP_USERNAME;
  const password = process.env.MNP_PASSWORD;
  const accountNo = process.env.MNP_ACCOUNT_NO;
  const locationId = process.env.MNP_LOCATION_ID;
  const returnLocation = process.env.MNP_RETURN_LOCATION;
  const subAccountId = process.env.MNP_SUB_ACCOUNT_ID;

  console.log('[M&P] Credentials check - Username:', !!username, 'Password:', !!password, 'AccountNo:', !!accountNo);

  if (!username || !password || !accountNo) {
    throw new Error('M&P API credentials not configured');
  }

  return {
    username,
    password,
    accountNo,
    locationId: locationId || accountNo,
    returnLocation: returnLocation || accountNo,
    subAccountId: subAccountId || '0',
  };
}

export type MnpBookingRequest = {
  consigneeName: string;
  consigneePhone: string;
  consigneeAddress: string;
  consigneeEmail?: string;
  destinationCityName: string;
  pieces: number;
  weight: number;
  codAmount: number;
  custRefNo: string;
  productDetails?: string;
  service?: 'Overnight' | 'Second Day';
  remarks?: string;
  fragile?: boolean;
  insuranceValue?: number;
};

export type MnpBookingResponse = {
  isSuccess: string;
  message: string;
  orderReferenceId?: string;
};

export type MnpCitiesResponse = {
  City: string[];
};

export type MnpTrackingResponse = {
  OrderNo: string;
  ConsigneeName: string;
  ConsigneeAddress: string;
  ConsigneeMobNo: string;
  DestinationCity: string;
  Pieces: number;
  Weight: number;
  CodAmount: number;
  CurrentStatus: string;
  BookingDate: string;
  DeliveryDate?: string;
  Remarks?: string;
};

/**
 * Book a consignment with M&P
 */
export async function bookConsignment(data: MnpBookingRequest): Promise<MnpBookingResponse> {
  const creds = getCredentials();

  const payload = {
    username: creds.username,
    password: creds.password,
    consigneeName: data.consigneeName,
    consigneeAddress: data.consigneeAddress,
    consigneeMobNo: data.consigneePhone.replace(/[^\d]/g, ''), // digits only
    consigneeEmail: data.consigneeEmail || '',
    destinationCityName: data.destinationCityName,
    pieces: data.pieces || 1,
    weight: data.weight || 0.5,
    codAmount: Math.round(data.codAmount),
    custRefNo: data.custRefNo,
    productDetails: data.productDetails || '',
    fragile: data.fragile ? 'Yes' : 'No',
    service: data.service || 'Overnight',
    remarks: data.remarks || '',
    insuranceValue: String(data.insuranceValue || 0),
    locationID: creds.locationId,
    AccountNo: creds.accountNo,
    InsertType: '19',
    ReturnLocation: creds.returnLocation,
    subAccountId: creds.subAccountId,
  };

  console.log('[M&P] Booking payload:', JSON.stringify(payload, null, 2));

  const response = await fetch(`${MNP_API_BASE}/Booking/InsertBookingData`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  console.log('[M&P] Booking response:', JSON.stringify(result, null, 2));

  // Response is an array, get first item
  const item = Array.isArray(result) ? result[0] : result;

  return {
    isSuccess: item?.isSuccess || 'false',
    message: item?.message || 'Unknown error',
    orderReferenceId: item?.orderReferenceId || undefined,
  };
}

/**
 * Get list of cities from M&P
 */
export async function getCities(): Promise<string[]> {
  const creds = getCredentials();

  const params = new URLSearchParams({
    username: creds.username,
    password: creds.password,
    AccountNo: creds.accountNo,
  });

  const response = await fetch(`${MNP_API_BASE}/Branches/Get_Cities?${params.toString()}`, {
    method: 'GET',
  });

  const result = await response.json();
  console.log('[M&P] Cities response received, count:', Array.isArray(result) ? result[0]?.City?.length : 0);

  // Response is array with City array inside
  if (Array.isArray(result) && result[0]?.City) {
    return result[0].City;
  }

  return [];
}

/**
 * M&P Tracking API response types
 */
export type MnpTrackingDetail = {
  TrackingTagID: string;
  TransactionTime: string;
  Location: string | null;
  TrackingStatus: string;
  TrackingNarration: string;
  Event: string | null;
};

export type MnpTrackingResult = {
  isSuccess: string;
  message: string;
  tracking_Details?: Array<{
    ConsignmentNumber: string;
    OrderId: string;
    OriginCity: string;
    BookingDate: string;
    CODAmount: string | null;
    ConsigneeName: string;
    DestinationCity: string;
    DeliveryAddress: string;
    CNTrackingDetail: MnpTrackingDetail[];
  }>;
};

/**
 * Track a consignment by CN number
 * Uses the tracking.mulphilog.com.pk endpoint
 */
export async function trackConsignment(cnNumber: string): Promise<MnpTrackingResult | null> {
  const params = new URLSearchParams({
    consignment: cnNumber,
    id: '4',
  });

  const response = await fetch(`https://tracking.mulphilog.com.pk/api/CNTracking?${params.toString()}`, {
    method: 'GET',
  });

  const result = await response.json();
  console.log('[M&P] Tracking response:', JSON.stringify(result, null, 2));

  if (Array.isArray(result) && result.length > 0) {
    return result[0] as MnpTrackingResult;
  }

  return null;
}

/**
 * Get the latest tracking status from M&P response
 */
export function getLatestMnpStatus(trackingResult: MnpTrackingResult): string | null {
  const details = trackingResult.tracking_Details?.[0]?.CNTrackingDetail;
  if (!details || details.length === 0) return null;
  
  // Get the last (most recent) tracking entry
  const latest = details[details.length - 1];
  return latest?.TrackingStatus || null;
}

/**
 * Map M&P tracking status to our order status
 * 
 * Important: RTS/Return maps to 'return_in_transit' (not 'returned')
 * because 'returned' requires manual confirmation after inspection.
 * Only explicit "Received Back" / "Delivered to Shipper" should map to 'returned'.
 */
export function mapMnpStatusToOrderStatus(mnpStatus: string): string | null {
  const status = mnpStatus?.toLowerCase() || '';
  
  // Terminal: Delivered
  if (status.includes('delivered') && !status.includes('shipper')) {
    return 'delivered';
  }
  
  // Terminal: Received back at shipper (rare - most couriers don't have this)
  if (status.includes('received back') || status.includes('delivered to shipper')) {
    return 'returned';
  }
  
  // In-transit return: RTS, Return initiated, etc. -> return_in_transit
  // Requires manual confirmation to move to 'returned' after inspection
  if (status.includes('return') || status.includes('rts')) {
    return 'return_in_transit';
  }
  
  // Cancelled
  if (status.includes('cancel')) {
    return 'cancelled';
  }
  
  // In-transit forward: various shipping statuses
  if (status.includes('booked') || status.includes('picked') || status.includes('transit') || 
      status.includes('arrived') || status.includes('dispatched') || status.includes('out for delivery')) {
    return 'shipped';
  }
  
  // Don't change status for unknown statuses
  return null;
}
