// Single source of truth for MoneyFlow's real-world business/contact details.
// Used by the public Pricing/Terms/Privacy/Refund/Contact pages and the
// footer — nowhere else should these values be hardcoded.
//
// IMPORTANT: every blank string below is intentional. Nothing in this file
// was invented — fill in only what is actually true for your business
// before relying on these pages for Razorpay (or any other) verification.
// Fields left blank are automatically hidden by the pages that use them
// (see isConfigured()) rather than shown as "YOUR_..." placeholders.

export const BUSINESS_INFO = {
  brandName: "MoneyFlow",
  // Registered legal entity name, if you operate as one (e.g. a proprietorship
  // or company name). Leave blank if you operate as an unregistered individual.
  legalName: "",
  // Primary support inbox shown on the Contact page and in the footer.
  supportEmail: "rajasivanesh@gmail.com",
  // Optional second inbox for partnership/business enquiries.
  businessEmail: "sivaneshkkf@gmail.com",
  supportPhone: "",
  // Digits only, with country code, e.g. '919876543210' — no '+' or spaces.
  whatsappNumber: "917010037476",
  websiteUrl: "https://moneyflowtracker.vercel.app",
  businessAddress:
    "3/226, North Street, Kaniyakulam Post, Parvathipuram, Nagercoil, Kanyakumari District, Tamil Nadu, 629003",
};

export const LEGAL_INFO = {
  // Shown as "Last updated: <value>" on every legal page. Update this
  // whenever the Terms/Privacy/Refund content actually changes.
  lastUpdated: "September 2026",
};

/** True for any non-empty, non-whitespace-only config value. */
export function isConfigured(value) {
  return Boolean(value && String(value).trim());
}
