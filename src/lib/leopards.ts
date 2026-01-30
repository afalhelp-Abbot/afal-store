/**
 * Leopards Courier API Client
 * Documentation: https://ecom.leopardscourier.com/eCom-Merchant-APIs-V2.pdf
 */

const LEOPARDS_API_BASE = 'https://merchantapi.leopardscourier.com/api';

type LeopardsCredentials = {
  apiKey: string;
  apiPassword: string;
};

function getCredentials(): LeopardsCredentials {
  const apiKey = process.env.LEOPARDS_API_KEY;
  const apiPassword = process.env.LEOPARDS_API_PASSWORD;

  console.log('[Leopards] API Key exists:', !!apiKey, 'Password exists:', !!apiPassword);

  if (!apiKey || !apiPassword) {
    throw new Error('Leopards API credentials not configured');
  }

  return { apiKey, apiPassword };
}

export type BookPacketRequest = {
  consigneeName: string;
  consigneePhone: string;
  consigneeAddress: string;
  consigneeCityCode: string;
  orderRefNumber: string;
  collectAmount: number;
  weight?: number;
  pieces?: number;
  productType?: 'COD' | 'Overnight' | 'Overland';
  remarks?: string;
  specialHandling?: string;
};

export type BookPacketResponse = {
  status: number;
  message: string;
  packet_list?: Array<{
    track_number: string;
    slip_link?: string;
  }>;
  error?: string;
};

export type TrackPacketResponse = {
  status: number;
  message: string;
  packet_list?: Array<{
    track_number: string;
    booked_packet_status: string;
    booked_packet_date: string;
    destination_city: string;
    consignee_name: string;
    packet_amount: string;
    booking_date: string;
    status_history?: Array<{
      status: string;
      date_time: string;
      remarks: string;
    }>;
  }>;
};

export type CityListResponse = {
  status: number;
  message: string;
  city_list?: Array<{
    id: string;
    name: string;
  }>;
};

/**
 * Book a packet with Leopards Courier
 */
export async function bookPacket(data: BookPacketRequest): Promise<BookPacketResponse> {
  const { apiKey, apiPassword } = getCredentials();

  const payload = {
    api_key: apiKey,
    api_password: apiPassword,
    booked_packet_weight: data.weight || 500,
    booked_packet_no_piece: data.pieces || 1,
    booked_packet_collect_amount: data.collectAmount,
    booked_packet_order_id: data.orderRefNumber,
    origin_city: '789', // Lahore - update based on your origin
    destination_city: data.consigneeCityCode,
    shipment_name_eng: data.consigneeName,
    shipment_email: '',
    shipment_phone: data.consigneePhone,
    shipment_address: data.consigneeAddress,
    booking_date: new Date().toISOString().split('T')[0],
    special_handling: data.specialHandling || '',
    shipment_type: data.productType || 'COD',
    remarks: data.remarks || '',
  };

  const response = await fetch(`${LEOPARDS_API_BASE}/bookPacket/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  return result as BookPacketResponse;
}

/**
 * Track booked packets by tracking numbers
 */
export async function trackPackets(trackNumbers: string[]): Promise<TrackPacketResponse> {
  const { apiKey, apiPassword } = getCredentials();

  const payload = {
    api_key: apiKey,
    api_password: apiPassword,
    track_numbers: trackNumbers.join(','),
  };

  const response = await fetch(`${LEOPARDS_API_BASE}/trackBookedPacket/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  return result as TrackPacketResponse;
}

/**
 * Get list of cities from Leopards
 */
export async function getCities(): Promise<CityListResponse> {
  const { apiKey, apiPassword } = getCredentials();

  const payload = {
    api_key: apiKey,
    api_password: apiPassword,
  };

  const response = await fetch(`${LEOPARDS_API_BASE}/getAllCities/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  return result as CityListResponse;
}

/**
 * Map Leopards status to our order status
 */
export function mapLeopardsStatus(leopardsStatus: string): string | null {
  const statusLower = leopardsStatus.toLowerCase();

  if (statusLower.includes('delivered')) {
    return 'delivered';
  }
  if (statusLower.includes('return') && statusLower.includes('transit')) {
    return 'return_in_transit';
  }
  if (statusLower.includes('returned')) {
    return 'returned';
  }
  // Statuses like 'Booked', 'Arrived at Station', 'Out for Delivery' don't change our status
  // They remain as 'shipped' in our system
  return null;
}
