"use client";

import { useState } from "react";
import { StampPicker } from "@/components/stamp-picker";
import { StampPopover } from "@/components/stamp-popover";

interface EntryStampsProps {
  entryId: string;
  initialStamps: string[];
  initialMyStamp: string | null;
  isOwnEntry: boolean;
  isLoggedIn: boolean;
  isPlus: boolean;
  stampApiPath?: string;
}

export function EntryStamps({
  entryId,
  initialStamps,
  initialMyStamp,
  isOwnEntry,
  isLoggedIn,
  isPlus,
  stampApiPath,
}: EntryStampsProps) {
  const [stamps, setStamps] = useState<string[]>(initialStamps);
  const [myStamp, setMyStamp] = useState<string | null>(initialMyStamp);

  function handleStampChange(newStamps: string[], newMyStamp: string | null) {
    setStamps(newStamps);
    setMyStamp(newMyStamp);
  }

  return (
    <div className="flex flex-row items-center gap-2 flex-wrap">
      {/* Stamp icons (author can click to see who) */}
      <StampPopover
        entryId={entryId}
        stamps={stamps}
        isAuthor={isOwnEntry}
      />

      {/* Stamp picker (readers only, not author) */}
      <StampPicker
        entryId={entryId}
        currentStamp={myStamp}
        isOwnEntry={isOwnEntry}
        isLoggedIn={isLoggedIn}
        isPlus={isPlus}
        onStampChange={handleStampChange}
        stampApiPath={stampApiPath}
      />
    </div>
  );
}
