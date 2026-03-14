import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Pen nib SVG path data from favicon.svg (simplified for OG card)
const PEN_NIB_PATH_1 =
  "M1381.98 42.001C1392.85 48.4527 1403.18 56.8657 1419.35 72.001C1435.29 86.9164 1445.47 101.702 1451 111.004C1434.57 125.64 1400.8 158.604 1374.38 203.331C1342.24 257.731 1327.03 288.034 1320.42 302.294C1319.76 302.287 1319.1 302.287 1318.44 302.287C1270.57 302.287 1222.63 317.511 1185.51 333.483L1288.48 230.52C1291.82 231.46 1295.27 231.956 1298.74 231.956C1308.74 231.956 1318.14 228.064 1325.22 220.996C1332.33 213.892 1336.25 204.433 1336.25 194.38C1336.25 184.324 1332.33 174.869 1325.23 167.772C1318.13 160.664 1308.68 156.749 1298.63 156.749C1288.57 156.749 1279.13 160.66 1272.03 167.753C1262.21 177.541 1258.91 191.749 1262.5 204.52L1159.5 307.503C1175.7 269.873 1191.13 221.106 1190.68 172.56C1204.94 165.959 1235.24 150.756 1289.63 118.626C1334.37 92.2151 1367.33 58.4464 1381.98 41.9997M1378.29 22.6834C1378.29 22.6834 1340.27 70.9401 1281.85 105.437C1201.74 152.75 1175.02 162.68 1175.02 162.68C1180.9 261.32 1110.62 367.667 1110.62 367.667C1110.62 367.667 1108.26 366.991 1105.25 366.991C1101.14 366.991 1095.82 368.244 1093.6 374.175C1091.45 379.935 1095.5 386.323 1098.57 390.09L1280.92 207.76C1274.28 199.017 1274.86 186.559 1282.84 178.6C1287.2 174.248 1292.91 172.067 1298.62 172.067C1304.33 172.067 1310.04 174.243 1314.39 178.6C1323.11 187.308 1323.11 201.448 1314.39 210.156C1310.05 214.48 1304.4 216.636 1298.74 216.636C1293.99 216.636 1289.23 215.117 1285.24 212.1L1102.89 394.433C1105.93 396.901 1110.66 399.985 1115.39 399.985C1116.54 399.985 1117.69 399.806 1118.82 399.389C1129.12 395.545 1125.34 382.36 1125.34 382.36C1125.34 382.36 1223.33 317.607 1318.43 317.607C1322.4 317.607 1326.35 317.719 1330.3 317.951C1330.3 317.951 1340.23 291.227 1387.56 211.127C1422.05 152.731 1470.3 114.694 1470.3 114.694C1470.3 114.694 1458.91 88.0493 1429.82 60.814C1408.11 40.4963 1395.77 31.1123 1378.29 22.684L1378.29 22.6834Z";

const PEN_NIB_PATH_2 =
  "M1485.33 107.321C1482.37 107.321 1479.54 105.585 1478.28 102.689C1478.18 102.437 1467.03 77.054 1439.61 51.3793C1417.81 30.9757 1406.21 22.3753 1389.98 14.5627C1386.17 12.7306 1384.57 8.15133 1386.4 4.33866C1388.25 0.52233 1392.83 -1.07267 1396.63 0.75933C1414.47 9.344 1426.97 18.555 1450.09 40.1893C1479.99 68.197 1491.88 95.4927 1492.36 96.6427C1494.04 100.531 1492.23 105.023 1488.35 106.691C1487.36 107.122 1486.34 107.322 1485.33 107.322L1485.33 107.321Z";

function PenNibIcon({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="1085 -5 415 415"
      fill="none"
    >
      <path d={PEN_NIB_PATH_1} fill="#2d4a8a" />
      <path d={PEN_NIB_PATH_2} fill="#2d4a8a" />
    </svg>
  );
}

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

  // Load fonts
  const [loraRegularData, loraBoldData] = await Promise.all([
    fetch(new URL("/fonts/Lora-Regular.ttf", req.nextUrl.origin)).then((r) =>
      r.arrayBuffer()
    ),
    fetch(new URL("/fonts/Lora-Bold.ttf", req.nextUrl.origin)).then((r) =>
      r.arrayBuffer()
    ),
  ]);

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
    fonts: [
      {
        name: "Lora",
        data: loraRegularData,
        weight: 400,
        style: "normal",
      },
      {
        name: "Lora",
        data: loraBoldData,
        weight: 700,
        style: "normal",
      },
    ],
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
