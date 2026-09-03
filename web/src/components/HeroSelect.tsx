import { ListBox, ListBoxItem, Select, SelectIndicator, SelectPopover, SelectTrigger, SelectValue } from "@heroui/react";

export interface HeroSelectItem<T extends string> {
  id: T;
  label: string;
  /** Optional accent color applied to the item text in the dropdown. */
  color?: string;
}

/**
 * Thin wrapper over HeroUI's react-aria Select with a plain string-item API.
 */
export function HeroSelect<T extends string>({
  label,
  value,
  onChange,
  items,
  className = "",
  triggerStyle,
  popoverClassName = "",
}: {
  label: string;
  value: T | null;
  onChange: (value: T | null) => void;
  items: HeroSelectItem<T>[];
  className?: string;
  /** Inline styles for the closed trigger, e.g. status color coding. */
  triggerStyle?: React.CSSProperties;
  popoverClassName?: string;
}) {
  return (
    <Select
      aria-label={label}
      className={className}
      selectedKey={value ?? null}
      onSelectionChange={(key) => onChange((key as T | null) ?? null)}
    >
      <Select.Trigger style={triggerStyle}>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className={popoverClassName}>
        <ListBox>
          {items.map((item) => (
            <ListBoxItem
              key={item.id}
              id={item.id}
              textValue={item.label}
              style={item.color ? { color: item.color } : undefined}
            >
              {item.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
