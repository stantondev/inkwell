"use client";

import { useAdmin } from "../admin-context";
import { UserManagement } from "../users/user-management";

export default function UsersPanel() {
  const { currentUserId } = useAdmin();

  return <UserManagement currentUserId={currentUserId} />;
}
