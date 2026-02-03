// src/lib/shipping/easypost.ts
// EasyPost shipping integration for LuxHub
// Supports test mode (devnet) and production mode (mainnet)

import EasyPostClient from '@easypost/api';

// Environment detection
const isProduction =
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta';

// API Keys - Use test key for development, production key for mainnet
const EASYPOST_API_KEY = isProduction
  ? process.env.EASYPOST_PRODUCTION_API_KEY
  : process.env.EASYPOST_TEST_API_KEY;

// Test addresses for development (EasyPost provides these)
export const TEST_ADDRESSES = {
  // Valid test addresses that work with EasyPost test mode
  sender: {
    name: 'LuxHub Warehouse',
    street1: '417 Montgomery Street',
    street2: 'Floor 5',
    city: 'San Francisco',
    state: 'CA',
    zip: '94104',
    country: 'US',
    phone: '415-528-7555',
    email: 'shipping@luxhub.io',
  },
  recipient: {
    name: 'Test Buyer',
    street1: '388 Townsend St',
    street2: 'Apt 20',
    city: 'San Francisco',
    state: 'CA',
    zip: '94107',
    country: 'US',
    phone: '415-456-7890',
    email: 'buyer@test.com',
  },
};

// Common parcel dimensions for luxury items
export const PARCEL_PRESETS = {
  watch: {
    length: 6,
    width: 6,
    height: 4,
    weight: 16, // ounces (1 lb)
    description: 'Luxury Watch',
  },
  jewelry: {
    length: 4,
    width: 4,
    height: 2,
    weight: 8, // ounces (0.5 lb)
    description: 'Jewelry Item',
  },
  small_collectible: {
    length: 8,
    width: 8,
    height: 6,
    weight: 32, // ounces (2 lb)
    description: 'Small Collectible',
  },
  large_collectible: {
    length: 12,
    width: 12,
    height: 10,
    weight: 80, // ounces (5 lb)
    description: 'Large Collectible',
  },
  art: {
    length: 24,
    width: 20,
    height: 4,
    weight: 64, // ounces (4 lb)
    description: 'Art Piece',
  },
};

// Carrier service levels recommended for luxury items
export const LUXURY_SERVICES = {
  fedex: ['FEDEX_2_DAY', 'PRIORITY_OVERNIGHT', 'STANDARD_OVERNIGHT'],
  ups: ['UPSNextDayAirSaver', 'UPS2ndDayAir', 'UPSGround'],
  usps: ['Priority', 'PriorityMailExpress'],
  dhl: ['DHL Express Worldwide'],
};

// Create EasyPost client
function getClient(): InstanceType<typeof EasyPostClient> | null {
  if (!EASYPOST_API_KEY) {
    console.warn('[EasyPost] API key not configured');
    return null;
  }
  return new EasyPostClient(EASYPOST_API_KEY);
}

export interface AddressInput {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
  company?: string;
}

export interface ParcelInput {
  length: number; // inches
  width: number; // inches
  height: number; // inches
  weight: number; // ounces
  predefined_package?: string;
}

export interface ShipmentOptions {
  fromAddress: AddressInput;
  toAddress: AddressInput;
  parcel: ParcelInput;
  insuranceAmount?: number; // USD - for luxury items
  signatureRequired?: boolean;
  saturdayDelivery?: boolean;
  reference?: string; // Order/escrow ID
}

export interface ShippingRate {
  id: string;
  carrier: string;
  service: string;
  rate: number;
  currency: string;
  deliveryDays: number | null;
  deliveryDate: string | null;
  deliveryDateGuaranteed: boolean;
  listRate?: number;
  retailRate?: number;
}

export interface ShipmentResult {
  id: string;
  trackingCode: string;
  trackingUrl: string;
  labelUrl: string;
  labelFormat: string;
  carrier: string;
  service: string;
  rate: number;
  insuranceAmount?: number;
  estimatedDeliveryDate?: string;
  shipmentId: string;
}

/**
 * Verify and validate an address
 */
export async function verifyAddress(address: AddressInput): Promise<{
  valid: boolean;
  address: AddressInput | null;
  messages: string[];
}> {
  const client = getClient();

  if (!client) {
    // In demo/test mode without API key, return as valid
    return { valid: true, address, messages: ['Demo mode - address not verified'] };
  }

  try {
    const verifiedAddress = await client.Address.createAndVerify({
      name: address.name,
      street1: address.street1,
      street2: address.street2 || '',
      city: address.city,
      state: address.state,
      zip: address.zip,
      country: address.country,
      phone: address.phone || '',
      email: address.email || '',
      company: address.company || '',
    });

    const messages: string[] = [];
    if (verifiedAddress.verifications?.delivery?.success) {
      return {
        valid: true,
        address: {
          name: verifiedAddress.name || address.name,
          street1: verifiedAddress.street1 || address.street1,
          street2: verifiedAddress.street2 || '',
          city: verifiedAddress.city || address.city,
          state: verifiedAddress.state || address.state,
          zip: verifiedAddress.zip || address.zip,
          country: verifiedAddress.country || address.country,
          phone: verifiedAddress.phone || '',
          email: address.email || '',
        },
        messages,
      };
    } else {
      // Get verification errors
      const errors = verifiedAddress.verifications?.delivery?.errors || [];
      return {
        valid: false,
        address: null,
        messages: errors.map((e: any) => e.message || 'Address verification failed'),
      };
    }
  } catch (error: any) {
    console.error('[EasyPost] Address verification error:', error);
    return {
      valid: false,
      address: null,
      messages: [error.message || 'Address verification failed'],
    };
  }
}

/**
 * Get shipping rates for a shipment
 */
export async function getShippingRates(options: ShipmentOptions): Promise<{
  success: boolean;
  rates: ShippingRate[];
  shipmentId?: string;
  error?: string;
}> {
  const client = getClient();

  if (!client) {
    // Return mock rates for demo mode
    return {
      success: true,
      shipmentId: 'demo_shp_' + Date.now(),
      rates: [
        {
          id: 'demo_rate_1',
          carrier: 'USPS',
          service: 'Priority',
          rate: 8.95,
          currency: 'USD',
          deliveryDays: 3,
          deliveryDate: null,
          deliveryDateGuaranteed: false,
        },
        {
          id: 'demo_rate_2',
          carrier: 'FedEx',
          service: 'Ground',
          rate: 12.5,
          currency: 'USD',
          deliveryDays: 5,
          deliveryDate: null,
          deliveryDateGuaranteed: false,
        },
        {
          id: 'demo_rate_3',
          carrier: 'UPS',
          service: '2nd Day Air',
          rate: 24.99,
          currency: 'USD',
          deliveryDays: 2,
          deliveryDate: null,
          deliveryDateGuaranteed: true,
        },
        {
          id: 'demo_rate_4',
          carrier: 'FedEx',
          service: 'Priority Overnight',
          rate: 45.0,
          currency: 'USD',
          deliveryDays: 1,
          deliveryDate: null,
          deliveryDateGuaranteed: true,
        },
      ],
    };
  }

  try {
    const shipment = await client.Shipment.create({
      from_address: {
        name: options.fromAddress.name,
        street1: options.fromAddress.street1,
        street2: options.fromAddress.street2 || '',
        city: options.fromAddress.city,
        state: options.fromAddress.state,
        zip: options.fromAddress.zip,
        country: options.fromAddress.country,
        phone: options.fromAddress.phone || '',
        email: options.fromAddress.email || '',
      },
      to_address: {
        name: options.toAddress.name,
        street1: options.toAddress.street1,
        street2: options.toAddress.street2 || '',
        city: options.toAddress.city,
        state: options.toAddress.state,
        zip: options.toAddress.zip,
        country: options.toAddress.country,
        phone: options.toAddress.phone || '',
        email: options.toAddress.email || '',
      },
      parcel: {
        length: options.parcel.length,
        width: options.parcel.width,
        height: options.parcel.height,
        weight: options.parcel.weight,
        predefined_package: options.parcel.predefined_package,
      },
      options: {
        signature: options.signatureRequired ? 'ADULT' : undefined,
        saturday_delivery: options.saturdayDelivery || false,
        print_custom_1: options.reference || undefined,
      },
    });

    // Transform rates to our format
    const rates: ShippingRate[] = (shipment.rates || []).map((rate: any) => ({
      id: rate.id,
      carrier: rate.carrier,
      service: rate.service,
      rate: parseFloat(rate.rate),
      currency: rate.currency,
      deliveryDays: rate.delivery_days || null,
      deliveryDate: rate.delivery_date || null,
      deliveryDateGuaranteed: rate.delivery_date_guaranteed || false,
      listRate: rate.list_rate ? parseFloat(rate.list_rate) : undefined,
      retailRate: rate.retail_rate ? parseFloat(rate.retail_rate) : undefined,
    }));

    // Sort by price
    rates.sort((a, b) => a.rate - b.rate);

    return {
      success: true,
      shipmentId: shipment.id,
      rates,
    };
  } catch (error: any) {
    console.error('[EasyPost] Get rates error:', error);
    return {
      success: false,
      rates: [],
      error: error.message || 'Failed to get shipping rates',
    };
  }
}

/**
 * Purchase a shipping label
 */
export async function purchaseLabel(
  shipmentId: string,
  rateId: string,
  insuranceAmount?: number
): Promise<{
  success: boolean;
  shipment?: ShipmentResult;
  error?: string;
}> {
  const client = getClient();

  if (!client) {
    // Return mock label for demo mode
    return {
      success: true,
      shipment: {
        id: shipmentId,
        trackingCode: 'DEMO' + Date.now().toString().slice(-10),
        trackingUrl: 'https://track.easypost.com/demo',
        labelUrl: 'https://easypost-files.s3.us-west-2.amazonaws.com/files/postage_labels/demo.pdf',
        labelFormat: 'PDF',
        carrier: 'USPS',
        service: 'Priority',
        rate: 8.95,
        insuranceAmount: insuranceAmount,
        estimatedDeliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        shipmentId: shipmentId,
      },
    };
  }

  try {
    // First retrieve the shipment
    const shipment = await client.Shipment.retrieve(shipmentId);

    // Buy the label with the selected rate
    const boughtShipment = await client.Shipment.buy(shipment.id, rateId);

    // Add insurance if specified
    if (insuranceAmount && insuranceAmount > 0) {
      await client.Shipment.insure(boughtShipment.id, insuranceAmount);
    }

    // Get the updated shipment with insurance
    const finalShipment = insuranceAmount
      ? await client.Shipment.retrieve(boughtShipment.id)
      : boughtShipment;

    const selectedRate = finalShipment.selected_rate;
    const tracker = finalShipment.tracker;
    const postageLabel = finalShipment.postage_label;

    return {
      success: true,
      shipment: {
        id: finalShipment.id,
        trackingCode: finalShipment.tracking_code || '',
        trackingUrl:
          tracker?.public_url || `https://track.easypost.com/${finalShipment.tracking_code}`,
        labelUrl: postageLabel?.label_url || '',
        labelFormat: postageLabel?.label_file_type || 'PDF',
        carrier: selectedRate?.carrier || '',
        service: selectedRate?.service || '',
        rate: parseFloat(selectedRate?.rate || '0'),
        insuranceAmount: finalShipment.insurance
          ? parseFloat(String(finalShipment.insurance))
          : undefined,
        estimatedDeliveryDate: selectedRate?.delivery_date || undefined,
        shipmentId: finalShipment.id,
      },
    };
  } catch (error: any) {
    console.error('[EasyPost] Purchase label error:', error);
    return {
      success: false,
      error: error.message || 'Failed to purchase shipping label',
    };
  }
}

/**
 * Get tracking information for a shipment
 */
export async function getTracking(
  trackingCode: string,
  carrier?: string
): Promise<{
  success: boolean;
  tracking?: {
    status: string;
    statusDetail: string;
    estimatedDelivery?: string;
    signedBy?: string;
    trackingDetails: Array<{
      datetime: string;
      message: string;
      status: string;
      location?: string;
    }>;
  };
  error?: string;
}> {
  const client = getClient();

  if (!client) {
    // Return mock tracking for demo mode
    return {
      success: true,
      tracking: {
        status: 'in_transit',
        statusDetail: 'Your package is on its way',
        estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        trackingDetails: [
          {
            datetime: new Date().toISOString(),
            message: 'Package in transit to destination',
            status: 'in_transit',
            location: 'San Francisco, CA',
          },
          {
            datetime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            message: 'Package picked up',
            status: 'picked_up',
            location: 'San Francisco, CA',
          },
        ],
      },
    };
  }

  try {
    const tracker = await client.Tracker.create({
      tracking_code: trackingCode,
      carrier: carrier,
    });

    return {
      success: true,
      tracking: {
        status: tracker.status || 'unknown',
        statusDetail: tracker.status_detail || '',
        estimatedDelivery: tracker.est_delivery_date || undefined,
        signedBy: tracker.signed_by || undefined,
        trackingDetails: (tracker.tracking_details || []).map((detail: any) => ({
          datetime: detail.datetime,
          message: detail.message,
          status: detail.status,
          location: detail.tracking_location
            ? `${detail.tracking_location.city}, ${detail.tracking_location.state}`
            : undefined,
        })),
      },
    };
  } catch (error: any) {
    console.error('[EasyPost] Get tracking error:', error);
    return {
      success: false,
      error: error.message || 'Failed to get tracking information',
    };
  }
}

/**
 * Create a refund request for a shipment
 */
export async function refundShipment(shipmentId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const client = getClient();

  if (!client) {
    return { success: true, message: 'Demo mode - refund simulated' };
  }

  try {
    const shipment = await client.Shipment.retrieve(shipmentId);
    await client.Shipment.refund(shipment.id);

    return {
      success: true,
      message: 'Refund requested successfully',
    };
  } catch (error: any) {
    console.error('[EasyPost] Refund error:', error);
    return {
      success: false,
      error: error.message || 'Failed to request refund',
    };
  }
}

/**
 * Check if EasyPost is configured
 */
export function isConfigured(): boolean {
  return !!EASYPOST_API_KEY;
}

/**
 * Get current mode (test or production)
 */
export function getMode(): 'test' | 'production' | 'demo' {
  if (!EASYPOST_API_KEY) return 'demo';
  return isProduction ? 'production' : 'test';
}

export default {
  verifyAddress,
  getShippingRates,
  purchaseLabel,
  getTracking,
  refundShipment,
  isConfigured,
  getMode,
  TEST_ADDRESSES,
  PARCEL_PRESETS,
  LUXURY_SERVICES,
};
