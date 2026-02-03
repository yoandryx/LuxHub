// src/components/common/ShippingAddressForm.tsx
// Reusable shipping address form for buy/offer flows
import React, { useState, useEffect } from 'react';
import styles from '../../styles/ShippingAddressForm.module.css';
import { FiMapPin, FiUser, FiPhone, FiMail, FiInfo } from 'react-icons/fi';

export interface ShippingAddress {
  fullName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
  deliveryInstructions?: string;
}

interface ShippingAddressFormProps {
  onAddressChange: (address: ShippingAddress, isValid: boolean) => void;
  initialAddress?: Partial<ShippingAddress>;
  showDeliveryInstructions?: boolean;
  compact?: boolean;
}

// Common countries for dropdown
const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'Germany',
  'France',
  'Japan',
  'Switzerland',
  'Singapore',
  'Hong Kong',
  'United Arab Emirates',
  'Netherlands',
  'Italy',
  'Spain',
  'Brazil',
  'Mexico',
];

// US States
const US_STATES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
  'DC',
];

const ShippingAddressForm: React.FC<ShippingAddressFormProps> = ({
  onAddressChange,
  initialAddress,
  showDeliveryInstructions = true,
  compact = false,
}) => {
  const [address, setAddress] = useState<ShippingAddress>({
    fullName: initialAddress?.fullName || '',
    street1: initialAddress?.street1 || '',
    street2: initialAddress?.street2 || '',
    city: initialAddress?.city || '',
    state: initialAddress?.state || '',
    postalCode: initialAddress?.postalCode || '',
    country: initialAddress?.country || 'United States',
    phone: initialAddress?.phone || '',
    email: initialAddress?.email || '',
    deliveryInstructions: initialAddress?.deliveryInstructions || '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof ShippingAddress, string>>>({});

  // Validate address
  const validateAddress = (addr: ShippingAddress): boolean => {
    const newErrors: Partial<Record<keyof ShippingAddress, string>> = {};

    if (!addr.fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!addr.street1.trim()) newErrors.street1 = 'Street address is required';
    if (!addr.city.trim()) newErrors.city = 'City is required';
    if (!addr.state.trim()) newErrors.state = 'State/Province is required';
    if (!addr.postalCode.trim()) newErrors.postalCode = 'Postal code is required';
    if (!addr.country.trim()) newErrors.country = 'Country is required';

    // Optional: validate email format if provided
    if (addr.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.email)) {
      newErrors.email = 'Invalid email format';
    }

    // Optional: validate phone format if provided (basic check)
    if (addr.phone && addr.phone.length > 0 && addr.phone.length < 7) {
      newErrors.phone = 'Invalid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle field change
  const handleChange = (field: keyof ShippingAddress, value: string) => {
    const newAddress = { ...address, [field]: value };
    setAddress(newAddress);

    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // Notify parent of changes
  useEffect(() => {
    const isValid = validateAddress(address);
    onAddressChange(address, isValid);
  }, [address]);

  return (
    <div className={`${styles.container} ${compact ? styles.compact : ''}`}>
      <div className={styles.header}>
        <FiMapPin className={styles.headerIcon} />
        <h3>Shipping Address</h3>
      </div>

      <div className={styles.form}>
        {/* Full Name */}
        <div className={styles.field}>
          <label>
            <FiUser className={styles.fieldIcon} />
            Full Name *
          </label>
          <input
            type="text"
            placeholder="John Doe"
            value={address.fullName}
            onChange={(e) => handleChange('fullName', e.target.value)}
            className={errors.fullName ? styles.inputError : ''}
          />
          {errors.fullName && <span className={styles.error}>{errors.fullName}</span>}
        </div>

        {/* Street Address 1 */}
        <div className={styles.field}>
          <label>Street Address *</label>
          <input
            type="text"
            placeholder="123 Main Street"
            value={address.street1}
            onChange={(e) => handleChange('street1', e.target.value)}
            className={errors.street1 ? styles.inputError : ''}
          />
          {errors.street1 && <span className={styles.error}>{errors.street1}</span>}
        </div>

        {/* Street Address 2 */}
        <div className={styles.field}>
          <label>Apt, Suite, Unit (Optional)</label>
          <input
            type="text"
            placeholder="Apt 4B"
            value={address.street2}
            onChange={(e) => handleChange('street2', e.target.value)}
          />
        </div>

        {/* City & State Row */}
        <div className={styles.row}>
          <div className={styles.field}>
            <label>City *</label>
            <input
              type="text"
              placeholder="New York"
              value={address.city}
              onChange={(e) => handleChange('city', e.target.value)}
              className={errors.city ? styles.inputError : ''}
            />
            {errors.city && <span className={styles.error}>{errors.city}</span>}
          </div>

          <div className={styles.field}>
            <label>State/Province *</label>
            {address.country === 'United States' ? (
              <select
                value={address.state}
                onChange={(e) => handleChange('state', e.target.value)}
                className={errors.state ? styles.inputError : ''}
              >
                <option value="">Select State</option>
                {US_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Province/State"
                value={address.state}
                onChange={(e) => handleChange('state', e.target.value)}
                className={errors.state ? styles.inputError : ''}
              />
            )}
            {errors.state && <span className={styles.error}>{errors.state}</span>}
          </div>
        </div>

        {/* Postal Code & Country Row */}
        <div className={styles.row}>
          <div className={styles.field}>
            <label>Postal Code *</label>
            <input
              type="text"
              placeholder="10001"
              value={address.postalCode}
              onChange={(e) => handleChange('postalCode', e.target.value)}
              className={errors.postalCode ? styles.inputError : ''}
            />
            {errors.postalCode && <span className={styles.error}>{errors.postalCode}</span>}
          </div>

          <div className={styles.field}>
            <label>Country *</label>
            <select
              value={address.country}
              onChange={(e) => handleChange('country', e.target.value)}
              className={errors.country ? styles.inputError : ''}
            >
              {COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
            {errors.country && <span className={styles.error}>{errors.country}</span>}
          </div>
        </div>

        {/* Phone & Email Row */}
        <div className={styles.row}>
          <div className={styles.field}>
            <label>
              <FiPhone className={styles.fieldIcon} />
              Phone (Optional)
            </label>
            <input
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={address.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className={errors.phone ? styles.inputError : ''}
            />
            {errors.phone && <span className={styles.error}>{errors.phone}</span>}
          </div>

          <div className={styles.field}>
            <label>
              <FiMail className={styles.fieldIcon} />
              Email (Optional)
            </label>
            <input
              type="email"
              placeholder="email@example.com"
              value={address.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className={errors.email ? styles.inputError : ''}
            />
            {errors.email && <span className={styles.error}>{errors.email}</span>}
          </div>
        </div>

        {/* Delivery Instructions */}
        {showDeliveryInstructions && (
          <div className={styles.field}>
            <label>
              <FiInfo className={styles.fieldIcon} />
              Delivery Instructions (Optional)
            </label>
            <textarea
              placeholder="Gate code, leave at door, etc."
              value={address.deliveryInstructions}
              onChange={(e) => handleChange('deliveryInstructions', e.target.value)}
              rows={2}
            />
          </div>
        )}
      </div>

      <div className={styles.securityNote}>
        <FiInfo />
        <span>
          Your address is encrypted and only shared with the vendor for shipping purposes.
        </span>
      </div>
    </div>
  );
};

export default ShippingAddressForm;
