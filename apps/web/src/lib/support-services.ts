/**
 * Detects the support/donation service from a URL and returns metadata for display.
 */

export interface SupportService {
  name: string;
  /** Inline SVG path data for the service icon */
  icon: string;
  /** Brand color for the service */
  color: string;
}

const SERVICE_PATTERNS: Array<{ pattern: RegExp; service: SupportService }> = [
  {
    pattern: /ko-fi\.com/i,
    service: {
      name: "Ko-fi",
      icon: "kofi",
      color: "#FF5E5B",
    },
  },
  {
    pattern: /buymeacoffee\.com/i,
    service: {
      name: "Buy Me a Coffee",
      icon: "bmc",
      color: "#FFDD00",
    },
  },
  {
    pattern: /patreon\.com/i,
    service: {
      name: "Patreon",
      icon: "patreon",
      color: "#FF424D",
    },
  },
  {
    pattern: /paypal\.me|paypal\.com/i,
    service: {
      name: "PayPal",
      icon: "paypal",
      color: "#003087",
    },
  },
  {
    pattern: /venmo\.com/i,
    service: {
      name: "Venmo",
      icon: "venmo",
      color: "#3D95CE",
    },
  },
  {
    pattern: /cash\.app/i,
    service: {
      name: "Cash App",
      icon: "cashapp",
      color: "#00D632",
    },
  },
  {
    pattern: /gofundme\.com/i,
    service: {
      name: "GoFundMe",
      icon: "gofundme",
      color: "#02A95C",
    },
  },
  {
    pattern: /stripe\.com/i,
    service: {
      name: "Stripe",
      icon: "stripe",
      color: "#635BFF",
    },
  },
];

const GENERIC_SERVICE: SupportService = {
  name: "Support",
  icon: "heart",
  color: "var(--accent)",
};

export function detectService(url: string): SupportService {
  for (const { pattern, service } of SERVICE_PATTERNS) {
    if (pattern.test(url)) return service;
  }
  return GENERIC_SERVICE;
}

/**
 * Returns an inline SVG element for the given service icon key.
 * All icons are 20x20 viewBox.
 */
export function getServiceIconSvg(iconKey: string): string {
  switch (iconKey) {
    case "kofi":
      // Coffee cup
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`;
    case "bmc":
      // Coffee cup (same icon, different brand)
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`;
    case "patreon":
      // Circle (simplified Patreon mark)
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="14" cy="9" r="7"/><rect x="2" y="2" width="3" height="20" rx="1.5"/></svg>`;
    case "paypal":
      // Dollar sign
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
    case "venmo":
      // Dollar sign (same concept)
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
    case "cashapp":
      // Dollar sign
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
    case "gofundme":
      // Heart
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    case "stripe":
      // Credit card
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`;
    case "heart":
    default:
      // Heart
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  }
}
