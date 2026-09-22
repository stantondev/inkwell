import { SettingsChrome } from "./settings-chrome";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="set-shell">
      <div className="set-shell-inner">
        <SettingsChrome />
        {children}
      </div>
    </div>
  );
}
