"use client";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Select } from "radix-ui";

type Option = { value: string; label: string; disabled?: boolean };
export default function ThemedSelect({ value, onChange, options, label, id, describedBy, invalid = false }: {
  value: string; onChange: (value: string) => void; options: Option[];
  label: string; id?: string; describedBy?: string; invalid?: boolean;
}) {
  return <Select.Root value={value} onValueChange={onChange}>
    <Select.Trigger id={id} className="sunspot-select" aria-label={label} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      <Select.Value /><Select.Icon><ChevronDown size={14} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="sunspot-select-menu" position="popper" sideOffset={6} collisionPadding={14} onKeyDown={e => {
        // Escape closes only this picker, not the surrounding planner/dialog.
        if (e.key === "Escape") e.stopPropagation();
      }}>
        <Select.ScrollUpButton className="sunspot-select-scroll"><ChevronUp size={14} /></Select.ScrollUpButton>
        <Select.Viewport className="sunspot-select-options">
          {options.map(option => <Select.Item key={option.value} value={option.value} disabled={option.disabled} className="sunspot-select-option">
            <Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator><Check size={14} /></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
        <Select.ScrollDownButton className="sunspot-select-scroll"><ChevronDown size={14} /></Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
