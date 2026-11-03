import { useEffect, useRef } from "react";
import { isMetro } from "../measure";

function sanitize(raw, allowDecimal) {
  const value = String(raw ?? "");
  if (!allowDecimal) return value.replace(/\D/g, "");
  let out = "";
  let sawDot = false;
  for (const char of value.replace(",", ".")) {
    if (char >= "0" && char <= "9") {
      out += char;
    } else if (char === "." && !sawDot) {
      out += ".";
      sawDot = true;
    }
  }
  return out;
}

export default function NumberInput({
  value,
  min,
  max,
  onChange,
  allowDecimal = false,
  unit,
  ...props
}) {
  const decimals = allowDecimal || isMetro(unit);
  const ref = useRef(null);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const text = String(value ?? "");
    const number = Number(text);
    let message = "";
    if (text !== "" && text !== "." && min != null && min !== "" && number < Number(min)) {
      message = `Tiene que ser ${min} o más`;
    } else if (text !== "" && text !== "." && max != null && max !== "" && number > Number(max)) {
      message = `No puede ser más de ${max}`;
    }
    input.setCustomValidity(message);
  }, [value, min, max]);

  const handleChange = (event) => {
    const cleaned = sanitize(event.target.value, decimals);
    if (cleaned !== event.target.value) event.target.value = cleaned;
    onChange?.(event);
  };

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      pattern={decimals ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
      autoComplete="off"
      value={value ?? ""}
      onChange={handleChange}
    />
  );
}
