import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./styles-v2.css";

// Browsers change a focused number field's value on mouse-wheel scroll, which silently altered amounts.
// Scrolling over a focused number field now just leaves the field (value unchanged) and the page scrolls as usual.
document.addEventListener(
  "wheel",
  (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "number" && document.activeElement === target) {
      target.blur();
    }
  },
  { capture: true, passive: true },
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
