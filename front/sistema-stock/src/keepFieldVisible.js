const TYPING_FIELDS = "input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea";

function focusedModalField() {
  const field = document.activeElement;
  if (!(field instanceof HTMLElement)) return null;
  if (!field.matches(TYPING_FIELDS) || !field.closest(".modal")) return null;
  return field;
}

function centerField() {
  const field = focusedModalField();
  if (field) field.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function keepFieldVisible() {
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  let timer;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(centerField, 300);
  };
  document.addEventListener("focusin", (event) => {
    if (event.target === focusedModalField()) later();
  });
  window.visualViewport?.addEventListener("resize", () => {
    if (focusedModalField()) later();
  });
}
