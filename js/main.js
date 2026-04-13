import { EditorApp } from "./editor/EditorApp.js?v=20260413i";

const bootEditor = () => {
  if (window.__editorAppInstance) return;
  window.__editorAppInstance = new EditorApp();
};

window.addEventListener("DOMContentLoaded", bootEditor, { once: true });
window.addEventListener("pageshow", () => {
  window.__editorAppInstance?.resumeFromNavigation?.();
});
