"use client";

import { useAdmin } from "../admin-context";
import { PeopleDashboard } from "../users/people-dashboard";
import { UserManagement } from "../users/user-management";

export default function UsersPanel() {
  const { currentUserId } = useAdmin();

  return (
    <>
      <PeopleDashboard />
      <h2 className="adm-overview-heading" id="every-account">Every account</h2>
      <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
        Search by name or email. Promote admins, rename, block, unblock or delete.
      </p>
      <UserManagement currentUserId={currentUserId} />
    </>
  );
}
