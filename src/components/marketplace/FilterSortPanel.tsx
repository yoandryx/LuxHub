import React, { useState } from "react";
import styles from "../../styles/FilterSortPanel.module.css"; // Adjust the path as necessary

interface FilterSortPanelProps {
  onFilterChange: (filters: any) => void;
  onSortChange: (sortKey: "price_low" | "price_high" | "latest") => void;
  currentSort: "price_low" | "price_high" | "latest";
  onClose: () => void;
}

const brands = ["Rolex", "Audemars Piguet", "Cartier", "Patek Philippe", "Richard Mille", "Omega"];
const materials = ["Steel", "Gold", "Titanium"];
const colors = ["Black", "Blue", "White"];
const sizes = ["36mm", "40mm", "41mm", "44mm"];
const categories = ["Sport", "Dress", "Luxury"];

const FilterSortPanel = ({ onFilterChange, onSortChange, currentSort, onClose }: FilterSortPanelProps) => {

  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<any>({});
  const [sortKey, setSortKey] = useState("");

  const togglePanel = () => setIsOpen(!isOpen);

  const updateFilter = (key: string, value: string) => {
    const current = filters[key] || [];
    const updatedValues = current.includes(value)
      ? current.filter((v: string) => v !== value)
      : [...current, value];

    const updated = { ...filters, [key]: updatedValues };
    setFilters(updated);
    onFilterChange(updated);
  };


  const updateSort = (key: string) => {
    setSortKey(key);
    onSortChange(key as "price_low" | "price_high" | "latest");
  };

  return (
    <>
      {/* <button onClick={togglePanel} className={styles.toggleButton}>Filters</button> */}
      <div className={`${styles.panel} ${styles.open}`}>
        <button className={styles.closeButton} onClick={onClose}>✕</button>
        <h3>Filters</h3>

        <div className={styles.section}>
          <label>Brand</label>
          <div className={styles.options}>
            {brands.map((b) => (
              <button key={b} onClick={() => updateFilter("brand", b)}>{b}</button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <label>Material</label>
          <div className={styles.options}>
            {materials.map((m) => (
              <button key={m} onClick={() => updateFilter("material", m)}>{m}</button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <label>Dial Color</label>
          <div className={styles.options}>
            {colors.map((c) => (
              <button key={c} onClick={() => updateFilter("color", c)}>{c}</button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <label>Size</label>
          <div className={styles.options}>
            {sizes.map((s) => (
              <button key={s} onClick={() => updateFilter("size", s)}>{s}</button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <label>Category</label>
          <div className={styles.options}>
            {categories.map((c) => (
              <button key={c} onClick={() => updateFilter("category", c)}>{c}</button>
            ))}
          </div>
        </div>

        <div className={styles.sortDropdown}>
          <label htmlFor="sort">Sort by:</label>
          <select
              id="sort"
              value={currentSort ?? "latest"}
              onChange={(e) => updateSort(e.target.value as "price_low" | "price_high" | "latest")}
            >
            <option value="latest">Latest</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
          </select>
        </div>

        <div className={styles.resetSection}>
          <button className={styles.resetButton} onClick={() => {
            const cleared = {
              brand: [],
              material: [],
              color: [],
              size: [],
              category: [],
            };
            setFilters(cleared);
            onFilterChange(cleared);
          }}>
            Clear All Filters
          </button>
        </div>

      </div>
    </>
  );
};

export default FilterSortPanel;
