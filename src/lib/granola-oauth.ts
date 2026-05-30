import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { randomToken, sealJson, sha256Base64Url, unsealJson } from "@/lib/crypto";

export const GRANOLA_TOKEN_COOKIE = "mv_granola";
export const GRANOLA_PENDING_COOKIE = "mv_granola_pending";

const GRANOLA_RESOURCE = "https://mcp.granola.ai/mcp";
const GRANOLA_AUTH_METADATA_URL = "https://mcp-auth.granola.ai/.well-known/oauth-authorization-server";
const TOKEN_REFRESH_GRACE_MS = 1000 * 60;

type OAuthMetadata = {
  authorization_endpoint: string;
  registration_endpoint: string;
  token_endpoint: string;
};

type GranolaClientRegistration = {
  client_id: string;
};

export type GranolaPendingOAuth = {
  state: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  createdAt: number;
};

export type GranolaTokens = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: number;
  scope?: string;
  client_id: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export async function createGranolaAuthorization(request: NextRequest) {
  const metadata = await getGranolaOAuthMetadata();
  const redirectUri = `${getBaseUrl(request)}/api/granola/callback`;
  const registration = await registerGranolaClient(metadata, redirectUri);
  const codeVerifier = randomToken(48);
  const state = randomToken(24);
  const pending: GranolaPendingOAuth = {
    state,
    codeVerifier,
    clientId: registration.client_id,
    redirectUri,
    createdAt: Date.now()
  };

  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", registration.client_id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", sha256Base64Url(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "openid profile email offline_access");
  url.searchParams.set("resource", GRANOLA_RESOURCE);

  return {
    url,
    pending
  };
}

export async function exchangeGranolaCode(code: string, pending: GranolaPendingOAuth) {
  const metadata = await getGranolaOAuthMetadata();
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    client_id: pending.clientId,
    code_verifier: pending.codeVerifier,
    resource: GRANOLA_RESOURCE
  });

  const response = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Granola token exchange failed with ${response.status}`);
  }

  return withTokenMetadata((await response.json()) as TokenResponse, pending.clientId);
}

export async function refreshGranolaTokens(tokens: GranolaTokens) {
  if (!tokens.refresh_token) {
    return tokens;
  }

  if (tokens.expires_at && tokens.expires_at - Date.now() > TOKEN_REFRESH_GRACE_MS) {
    return tokens;
  }

  const metadata = await getGranolaOAuthMetadata();
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: tokens.client_id,
    resource: GRANOLA_RESOURCE
  });

  const response = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Granola token refresh failed with ${response.status}`);
  }

  return withTokenMetadata((await response.json()) as TokenResponse, tokens.client_id);
}

export async function readGranolaTokens() {
  const cookieStore = await cookies();
  const sealed = cookieStore.get(GRANOLA_TOKEN_COOKIE)?.value;
  return sealed ? unsealJson<GranolaTokens>(sealed) : null;
}

export function readPendingGranolaOAuth(value?: string) {
  return value ? unsealJson<GranolaPendingOAuth>(value) : null;
}

export function granolaCookieOptions(maxAge = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge
  };
}

export function sealGranolaValue(value: unknown) {
  return sealJson(value);
}

function withTokenMetadata(response: TokenResponse, clientId: string): GranolaTokens {
  return {
    ...response,
    client_id: clientId,
    expires_at: response.expires_in ? Date.now() + response.expires_in * 1000 : undefined
  };
}

async function getGranolaOAuthMetadata() {
  const response = await fetch(GRANOLA_AUTH_METADATA_URL, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Unable to fetch Granola OAuth metadata: ${response.status}`);
  }

  return (await response.json()) as OAuthMetadata;
}

async function registerGranolaClient(metadata: OAuthMetadata, redirectUri: string) {
  const response = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_name: "Echolog Lucid PWA",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Granola dynamic client registration failed with ${response.status}`);
  }

  return (await response.json()) as GranolaClientRegistration;
}

function getBaseUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}
