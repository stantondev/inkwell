import type { Metadata } from "next";
import { AdminEntryList } from "../admin-entry-list";

export const metadata: Metadata = { title: "Entries · Admin · Inkwell" };

export default function AdminEntriesPage() {
  return <AdminEntryList />;
}
