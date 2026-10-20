"use client";

import { PRIVACY_EVENT } from "../analytics.mjs";

// Footer control that reopens the analytics consent choice. Only rendered when analytics is active.
const PrivacySettingsButton = () => (
  <button type="button" className="privacy-settings-link" onClick={() => window.dispatchEvent(new Event(PRIVACY_EVENT))}>
    Pengaturan privasi
  </button>
);

export default PrivacySettingsButton;
