import type { Metadata } from "next";
import { EditorClient } from "./editor-client";

export const metadata: Metadata = {
  title: "New entry",
};

export default function EditorPage() {
  return <EditorClient />;
}
