import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { PenNibIcon, ogFonts } from "./og-shared";

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function formatCategory(cat: string): string {
  return cat
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function EntryCard({
  title,
  author,
  username,
  category,
  date,
}: {
  title: string;
  author: string;
  username: string;
  category: string;
  date: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#faf8f5",
        padding: "60px 70px",
        fontFamily: "Lora",
      }}
    >
      {/* Top: pen nib + inkwell.social */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "40px",
        }}
      >
        <PenNibIcon size={36} />
        <span
          style={{
            fontSize: "20px",
            color: "#2d4a8a",
            marginLeft: "12px",
            letterSpacing: "0.02em",
          }}
        >
          inkwell.social
        </span>
      </div>

      {/* Title */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
        }}
      >
        <h1
          style={{
            fontSize: title.length > 60 ? "36px" : "44px",
            fontWeight: 700,
            color: "#1a1a1a",
            lineHeight: 1.25,
            margin: 0,
            marginBottom: "24px",
          }}
        >
          {truncate(title, 100)}
        </h1>

        {/* Author line */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: "22px",
            color: "#555",
          }}
        >
          <span style={{ color: "#333", fontWeight: 400 }}>{author}</span>
          <span style={{ margin: "0 10px", color: "#aaa" }}>·</span>
          <span style={{ color: "#888" }}>@{username}</span>
        </div>
      </div>

      {/* Bottom: category + date */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        {category && (
          <span
            style={{
              fontSize: "16px",
              backgroundColor: "#2d4a8a",
              color: "#fff",
              padding: "6px 16px",
              borderRadius: "20px",
            }}
          >
            {formatCategory(category)}
          </span>
        )}
        {date && (
          <span style={{ fontSize: "16px", color: "#888" }}>
            {formatDate(date)}
          </span>
        )}
      </div>
    </div>
  );
}

function ProfileCard({
  name,
  username,
  bio,
}: {
  name: string;
  username: string;
  bio: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#faf8f5",
        padding: "60px 70px",
        fontFamily: "Lora",
      }}
    >
      {/* Top: pen nib + inkwell.social */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "48px",
        }}
      >
        <PenNibIcon size={36} />
        <span
          style={{
            fontSize: "20px",
            color: "#2d4a8a",
            marginLeft: "12px",
            letterSpacing: "0.02em",
          }}
        >
          inkwell.social
        </span>
      </div>

      {/* Name + username */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
        }}
      >
        <h1
          style={{
            fontSize: "52px",
            fontWeight: 700,
            color: "#1a1a1a",
            margin: 0,
            marginBottom: "12px",
            lineHeight: 1.2,
          }}
        >
          {truncate(name, 40)}
        </h1>
        <p
          style={{
            fontSize: "24px",
            color: "#2d4a8a",
            margin: 0,
            marginBottom: "28px",
          }}
        >
          @{username}
        </p>
        {bio && (
          <p
            style={{
              fontSize: "22px",
              color: "#555",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {truncate(bio, 160)}
          </p>
        )}
      </div>
    </div>
  );
}

function DefaultCard() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: "#faf8f5",
        fontFamily: "Lora",
      }}
    >
      <PenNibIcon size={72} />
      <h1
        style={{
          fontSize: "56px",
          fontWeight: 700,
          color: "#2d4a8a",
          margin: 0,
          marginTop: "24px",
          marginBottom: "12px",
        }}
      >
        Inkwell
      </h1>
      <p
        style={{
          fontSize: "22px",
          color: "#666",
          margin: 0,
          fontStyle: "italic",
        }}
      >
        Your journal, your pen pals, your space.
      </p>
    </div>
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "default";

  const fonts = await ogFonts();

  let content: React.ReactElement;

  switch (type) {
    case "entry": {
      const title = searchParams.get("title") || "Untitled Entry";
      const author = searchParams.get("author") || "";
      const username = searchParams.get("username") || "";
      const category = searchParams.get("category") || "";
      const date = searchParams.get("date") || "";
      content = (
        <EntryCard
          title={title}
          author={author}
          username={username}
          category={category}
          date={date}
        />
      );
      break;
    }
    case "profile": {
      const name = searchParams.get("name") || "";
      const username = searchParams.get("username") || "";
      const bio = searchParams.get("bio") || "";
      content = <ProfileCard name={name} username={username} bio={bio} />;
      break;
    }
    default:
      content = <DefaultCard />;
  }

  return new ImageResponse(content, {
    width: 1200,
    height: 630,
    fonts,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
