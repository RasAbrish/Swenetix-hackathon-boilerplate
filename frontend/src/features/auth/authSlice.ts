import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api, ApiError, TOKEN_KEY } from "../../lib/api";
import { setQueue } from "../../lib/outbox";
import { disconnectSocket } from "../../lib/socket";
import { readJSON, removeKey, TASKS_CACHE_KEY, USER_KEY, writeJSON } from "../../lib/storage";
import type { AuthUser } from "../../types";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  // "checking" = a stored token is being verified on startup
  status: "idle" | "loading" | "checking";
  error: string | null;
}

interface Credentials {
  username: string;
  password: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

const readStoredToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const storedToken = readStoredToken();

const initialState: AuthState = {
  user: null,
  token: storedToken,
  status: storedToken ? "checking" : "idle",
  error: null,
};

const authRequest = async (path: string, creds: Credentials): Promise<AuthResponse> => {
  const res = await api<AuthResponse>(path, { method: "POST", body: creds });
  localStorage.setItem(TOKEN_KEY, res.token);
  writeJSON(USER_KEY, res.user);
  return res;
};

export const login = createAsyncThunk<AuthResponse, Credentials, { rejectValue: string }>(
  "auth/login",
  async (creds, { rejectWithValue }) => {
    try {
      return await authRequest("/api/auth/login", creds);
    } catch (e) {
      return rejectWithValue((e as ApiError).message);
    }
  }
);

export const register = createAsyncThunk<AuthResponse, Credentials, { rejectValue: string }>(
  "auth/register",
  async (creds, { rejectWithValue }) => {
    try {
      return await authRequest("/api/auth/register", creds);
    } catch (e) {
      return rejectWithValue((e as ApiError).message);
    }
  }
);

export const restoreSession = createAsyncThunk<AuthUser, void, { rejectValue: number }>(
  "auth/restore",
  async (_, { rejectWithValue }) => {
    try {
      const res = await api<{ user: AuthUser }>("/api/auth/me");
      writeJSON(USER_KEY, res.user);
      return res.user;
    } catch (e) {
      const status = (e as ApiError).status;
      if (status === 0) {
        // Offline or server down: trust the remembered user so the board still opens
        const cachedUser = readJSON<AuthUser | null>(USER_KEY, null);
        if (cachedUser) return cachedUser;
      }
      if (status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        removeKey(USER_KEY);
      }
      return rejectWithValue(status);
    }
  }
);

export const logout = createAsyncThunk("auth/logout", async () => {
  localStorage.removeItem(TOKEN_KEY);
  removeKey(USER_KEY);
  removeKey(TASKS_CACHE_KEY);
  setQueue([]);
  disconnectSocket();
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearAuthError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    const pending = (state: AuthState) => {
      state.status = "loading";
      state.error = null;
    };
    const success = (state: AuthState, action: { payload: AuthResponse }) => {
      state.status = "idle";
      state.user = action.payload.user;
      state.token = action.payload.token;
    };
    const failure = (state: AuthState, action: { payload?: string }) => {
      state.status = "idle";
      state.error = action.payload ?? "Something went wrong";
    };

    builder
      .addCase(login.pending, pending)
      .addCase(login.fulfilled, success)
      .addCase(login.rejected, failure)
      .addCase(register.pending, pending)
      .addCase(register.fulfilled, success)
      .addCase(register.rejected, failure)
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.status = "idle";
        state.user = action.payload;
      })
      .addCase(restoreSession.rejected, (state, action) => {
        state.status = "idle";
        if (action.payload === 401) state.token = null;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.status = "idle";
        state.error = null;
      });
  },
});

export const { clearAuthError } = authSlice.actions;
export default authSlice.reducer;
