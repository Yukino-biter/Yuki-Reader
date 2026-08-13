import '@testing-library/jest-dom/vitest';

// jsdom lacks matchMedia / scrollTo used by some components.
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
}
