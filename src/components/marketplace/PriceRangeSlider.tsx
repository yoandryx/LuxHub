import React, { useState, useCallback, useRef, useEffect } from 'react';
import styles from '../../styles/PriceRangeSlider.module.css';

interface PriceRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (range: [number, number]) => void;
  onChangeCommitted: (range: [number, number]) => void;
}

export default function PriceRangeSlider({
  min,
  max,
  value,
  onChange,
  onChangeCommitted,
}: PriceRangeSliderProps) {
  const [localMin, setLocalMin] = useState(String(value[0]));
  const [localMax, setLocalMax] = useState(String(value[1]));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local inputs when value prop changes externally (e.g. clear all)
  useEffect(() => {
    setLocalMin(String(value[0]));
    setLocalMax(String(value[1]));
  }, [value]);

  const leftPercent = ((value[0] - min) / (max - min)) * 100;
  const rightPercent = ((value[1] - min) / (max - min)) * 100;

  const handleMinSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newMin = Math.min(Number(e.target.value), value[1]);
      onChange([newMin, value[1]]);
    },
    [onChange, value]
  );

  const handleMaxSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newMax = Math.max(Number(e.target.value), value[0]);
      onChange([value[0], newMax]);
    },
    [onChange, value]
  );

  const handleSliderCommit = useCallback(() => {
    onChangeCommitted(value);
  }, [onChangeCommitted, value]);

  const handleMinInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalMin(e.target.value);
  }, []);

  const handleMaxInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalMax(e.target.value);
  }, []);

  const commitInputValues = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      let parsedMin = Math.max(min, Math.min(Number(localMin) || min, max));
      let parsedMax = Math.max(min, Math.min(Number(localMax) || max, max));
      if (parsedMin > parsedMax) {
        [parsedMin, parsedMax] = [parsedMax, parsedMin];
      }
      const newRange: [number, number] = [parsedMin, parsedMax];
      onChange(newRange);
      onChangeCommitted(newRange);
      setLocalMin(String(parsedMin));
      setLocalMax(String(parsedMax));
    }, 300);
  }, [localMin, localMax, min, max, onChange, onChangeCommitted]);

  return (
    <div className={styles.container}>
      <div className={styles.sliderTrack}>
        <div
          className={styles.sliderFill}
          style={{
            left: `${leftPercent}%`,
            width: `${rightPercent - leftPercent}%`,
          }}
        />
        <input
          type="range"
          className={styles.sliderInput}
          min={min}
          max={max}
          step={500}
          value={value[0]}
          onChange={handleMinSlider}
          onMouseUp={handleSliderCommit}
          onTouchEnd={handleSliderCommit}
          aria-label="Minimum price"
        />
        <input
          type="range"
          className={styles.sliderInput}
          min={min}
          max={max}
          step={500}
          value={value[1]}
          onChange={handleMaxSlider}
          onMouseUp={handleSliderCommit}
          onTouchEnd={handleSliderCommit}
          aria-label="Maximum price"
        />
      </div>

      <div className={styles.inputRow}>
        <div className={styles.inputGroup}>
          <span className={styles.prefix}>$</span>
          <input
            type="number"
            className={styles.numberInput}
            value={localMin}
            onChange={handleMinInput}
            onBlur={commitInputValues}
            placeholder="Min"
            min={min}
            max={max}
          />
        </div>
        <span className={styles.separator}>&ndash;</span>
        <div className={styles.inputGroup}>
          <span className={styles.prefix}>$</span>
          <input
            type="number"
            className={styles.numberInput}
            value={localMax}
            onChange={handleMaxInput}
            onBlur={commitInputValues}
            placeholder="Max"
            min={min}
            max={max}
          />
        </div>
      </div>
    </div>
  );
}
