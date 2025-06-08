"use client";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import styles from "../../styles/CreateNFT.module.css"; // Adjust if needed

interface RadixSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options: (string | { label: string; value: string })[];
}

export default function RadixSelect({
  value,
  onValueChange,
  placeholder = "Select...",
  options,
}: RadixSelectProps) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger className={styles.selectTrigger}>
        <Select.Value placeholder={placeholder}>
          <Select.Value />
        </Select.Value>
        <Select.Icon className={styles.selectIcon}>
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content className={styles.selectContent} position="popper">
          <Select.ScrollUpButton className={styles.selectScroll}>
            <ChevronUp size={16} />
          </Select.ScrollUpButton>
          <Select.Viewport className={styles.selectViewport}>
            {options.map((option) => {
              const label = typeof option === "string" ? option : option.label;
              const val = typeof option === "string" ? option : option.value;

              return (
                <Select.Item key={val} value={val} className={styles.selectItem}>
                  <Select.ItemText>{label}</Select.ItemText>
                  <Select.ItemIndicator className={styles.selectCheck}>
                    <Check size={14} />
                  </Select.ItemIndicator>
                </Select.Item>
              );
            })}
          </Select.Viewport>
          <Select.ScrollDownButton className={styles.selectScroll}>
            <ChevronDown size={16} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
