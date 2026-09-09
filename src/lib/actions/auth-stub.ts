import type { AuthState, GoogleAuthState } from "./auth";

const DEVICE_MODE_ERROR = "Cloud accounts aren't available in device mode. Everything stays on this device.";

export async function signUp(): Promise<AuthState> {
  return { error: DEVICE_MODE_ERROR };
}

export async function logIn(): Promise<AuthState> {
  return { error: DEVICE_MODE_ERROR };
}

export async function signInWithGoogle(): Promise<GoogleAuthState> {
  return { error: DEVICE_MODE_ERROR };
}