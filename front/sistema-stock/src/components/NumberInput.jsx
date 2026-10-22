import { useEffect, useRef } from "react";

export default function NumberInput({ value, min, max, onChange, ...props }) {
  const ref = useRef(null);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const text = String(value ?? "");
    const number = Number(text);
    let message = "";
    if (text !== "" && min != null && min !== "" && number < Number(min)) {
      message = `Tiene que ser ${min} o más`;
    } else if (text !== "" && max != null && max !== "" && number > Number(max)) {
      message = `No puede ser más de ${max}`;
    }
    input.setCustomValidity(message);
  }, [value, min, max]);

  const handleChange = (event) => {
    const digits = event.target.value.replace(/\D/g, "");
    if (digits !== event.target.value) event.target.value = digits;
    onChange?.(event);
  };

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={value ?? ""}
      onChange={handleChange}
    />
  );
}
