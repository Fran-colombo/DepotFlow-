let listener = () => {};

export function setActivityListener(fn) {
  listener = typeof fn === "function" ? fn : () => {};
}

export function noteActivity() {
  listener();
}
