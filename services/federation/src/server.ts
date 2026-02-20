import { createFederation, MemoryKvStore } from "@fedify/fedify";
import { createServer } from "node:http";

// Inkwell Federation Service
// This Node.js sidecar handles all ActivityPub protocol concerns.
// It shares a PostgreSQL database with the Phoenix backend.
// Communication with Phoenix happens via Redis PubSub.

const federation = createFederation({
  kv: new MemoryKvStore(), // TODO: Replace with Redis-backed KV store
});

// Actor dispatcher — maps Inkwell users to ActivityPub actors
federation.setActorDispatcher("/users/{identifier}", async (ctx, identifier) => {
  // TODO: Look up user in PostgreSQL by username
  // Return an ActivityPub Person object with:
  // - id: https://inkwell.social/users/{username}
  // - preferredUsername: username
  // - name: displayName
  // - summary: bio (sanitized HTML)
  // - icon: avatar image
  // - inbox: https://inkwell.social/users/{username}/inbox
  // - outbox: https://inkwell.social/users/{username}/outbox
  // - publicKey: RSA public key for HTTP Signatures
  return null;
});

// Inbox listener — handles incoming ActivityPub activities
federation.setInboxListeners("/users/{identifier}/inbox", "/inbox")
  .on("Create", async (ctx, create) => {
    // Handle incoming posts/comments from remote users
    console.log("Received Create activity:", create.id);
  })
  .on("Follow", async (ctx, follow) => {
    // Handle follow requests from remote users
    console.log("Received Follow activity:", follow.id);
  })
  .on("Like", async (ctx, like) => {
    // Record likes (shown privately to author only)
    console.log("Received Like activity:", like.id);
  })
  .on("Undo", async (ctx, undo) => {
    // Handle unfollows, unlikes
    console.log("Received Undo activity:", undo.id);
  })
  .on("Delete", async (ctx, del) => {
    // Handle content deletion from remote instances
    console.log("Received Delete activity:", del.id);
  });

// Start the HTTP server for the federation service
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "inkwell-federation" }));
    return;
  }

  // WebFinger endpoint
  if (url.pathname === "/.well-known/webfinger") {
    // TODO: Handle WebFinger lookups for user discovery
    res.writeHead(404);
    res.end();
    return;
  }

  // Let Fedify handle ActivityPub routes
  // TODO: Wire up Fedify's request handler
  res.writeHead(404);
  res.end();
});

const PORT = process.env.FEDERATION_PORT ?? 4002;

server.listen(PORT, () => {
  console.log(`Inkwell Federation service running on port ${PORT}`);
});
