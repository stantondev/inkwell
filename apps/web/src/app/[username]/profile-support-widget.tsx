"use client";

import { detectService, getServiceIconSvg } from "@/lib/support-services";

interface ProfileSupportWidgetProps {
  supportUrl: string;
  supportLabel: string | null;
  displayName: string;
  styles: {
    surface: Record<string, string | undefined>;
    muted: string;
    accent: string;
    border: string;
    foreground: string;
  };
  preview?: boolean;
}

export function ProfileSupportWidget({
  supportUrl,
  supportLabel,
  displayName,
  styles,
  preview = false,
}: ProfileSupportWidgetProps) {
  const service = detectService(supportUrl);
  const label = supportLabel || "Support My Writing";

  return (
    <div className="rounded-xl border p-3 sm:p-4" style={styles.surface}>
      <h3
        className="text-xs font-medium uppercase tracking-widest mb-3"
        style={{ color: styles.muted }}
      >
        Support {displayName}
      </h3>

      <a
        href={preview ? undefined : supportUrl}
        target={preview ? undefined : "_blank"}
        rel={preview ? undefined : "noopener noreferrer"}
        onClick={preview ? (e) => e.preventDefault() : undefined}
        className={`flex items-center justify-center gap-2 w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
          preview ? "opacity-60 cursor-default" : "hover:opacity-90"
        }`}
        style={{
          borderColor: styles.accent,
          color: styles.accent,
        }}
      >
        <span
          dangerouslySetInnerHTML={{ __html: getServiceIconSvg(service.icon) }}
          style={{ color: service.color !== "var(--accent)" ? service.color : styles.accent }}
          className="flex-shrink-0 flex items-center"
        />
        {label}
      </a>

      {service.name !== "Support" && (
        <p className="text-xs mt-2 text-center" style={{ color: styles.muted }}>
          via {service.name}
        </p>
      )}
    </div>
  );
}
