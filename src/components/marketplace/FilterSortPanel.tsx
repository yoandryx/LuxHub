import React, { useCallback, useMemo } from 'react';
import styles from '../../styles/FilterSortPanel.module.css';

interface FilterSortPanelProps {
  onFilterChange: (filters: any) => void;
  onSortChange: (sortKey: 'price_low' | 'price_high' | 'latest') => void;
  currentSort: 'price_low' | 'price_high' | 'latest';
  onClose: () => void;
  currentFilters: any;
}

const brands = ['Rolex', 'Audemars Piguet', 'Cartier', 'Patek Philippe', 'Richard Mille', 'Omega'];
const materials = ['Steel', 'Gold', 'Titanium'];
const colors = ['Black', 'Blue', 'White'];
const sizes = ['36mm', '40mm', '41mm', '44mm'];
const categories = ['Sport', 'Dress', 'Luxury'];

const FilterSortPanel = ({
  onFilterChange,
  onSortChange,
  currentSort,
  onClose,
  currentFilters,
}: FilterSortPanelProps) => {
  const filters = currentFilters;

  // Memoized filter update handler
  const updateFilter = useCallback(
    (key: string, value: string) => {
      const current = filters[key] || [];
      const updatedValues = current.includes(value)
        ? current.filter((v: string) => v !== value)
        : [...current, value];

      const updated = { ...filters, [key]: updatedValues };
      onFilterChange(updated);
    },
    [filters, onFilterChange]
  );

  // Memoized sort update handler
  const updateSort = useCallback(
    (key: string) => {
      onSortChange(key as 'price_low' | 'price_high' | 'latest');
    },
    [onSortChange]
  );

  // Memoized selection checker
  const isSelected = useCallback(
    (key: string, value: string) => {
      return filters[key]?.includes(value);
    },
    [filters]
  );

  // Memoized clear handler
  const handleClearFilters = useCallback(() => {
    const cleared = {
      brands: [],
      materials: [],
      colors: [],
      sizes: [],
      categories: [],
    };
    onFilterChange(cleared);
  }, [onFilterChange]);

  return (
    <div className={`${styles.panel}`}>
      <button className={styles.closeButton} onClick={onClose}>
        ✕
      </button>
      <h3>Filters</h3>

      <div className={styles.section}>
        <label>Brand</label>
        <div className={styles.options}>
          {brands.map((b) => (
            <button
              key={b}
              className={`${styles.filterButton} ${isSelected('brands', b) ? styles.active : ''}`}
              onClick={() => updateFilter('brands', b)}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <label>Material</label>
        <div className={styles.options}>
          {materials.map((m) => (
            <button
              key={m}
              className={`${styles.filterButton} ${isSelected('materials', m) ? styles.active : ''}`}
              onClick={() => updateFilter('materials', m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <label>Dial Color</label>
        <div className={styles.options}>
          {colors.map((c) => (
            <button
              key={c}
              className={`${styles.filterButton} ${isSelected('colors', c) ? styles.active : ''}`}
              onClick={() => updateFilter('colors', c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <label>Size</label>
        <div className={styles.options}>
          {sizes.map((s) => (
            <button
              key={s}
              className={`${styles.filterButton} ${isSelected('sizes', s) ? styles.active : ''}`}
              onClick={() => updateFilter('sizes', s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <label>Category</label>
        <div className={styles.options}>
          {categories.map((c) => (
            <button
              key={c}
              className={`${styles.filterButton} ${isSelected('categories', c) ? styles.active : ''}`}
              onClick={() => updateFilter('categories', c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.sortDropdown}>
        <label htmlFor="sort">Sort by:</label>
        <select id="sort" value={currentSort} onChange={(e) => updateSort(e.target.value)}>
          <option value="latest">Latest</option>
          <option value="price_low">Price: Low to High</option>
          <option value="price_high">Price: High to Low</option>
        </select>
      </div>

      <div className={styles.resetSection}>
        <button className={styles.resetButton} onClick={handleClearFilters}>
          Clear All Filters
        </button>
      </div>
    </div>
  );
};

export default FilterSortPanel;
