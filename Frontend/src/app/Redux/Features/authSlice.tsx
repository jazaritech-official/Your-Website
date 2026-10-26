import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface AuthState {
  _id: string | null;
  username: string | null;
  profilePic: string | null;
  email: string | null;
  phoneNo: string | number | null;
  isAdmin: boolean;
  role: "superadmin" | "admin" | "user" | "rider";
  isVerified: boolean;
  hasPassword: boolean;
  loading: boolean;
  error: string | null;
}

const getUserFromLocalStorage = () => {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  }
  return null;
};

const storedUser = getUserFromLocalStorage();

const initialState: AuthState = storedUser
  ? {
      _id: storedUser._id ?? null,
      username: storedUser.username ?? null,
      profilePic: storedUser.profilePic ?? null,
      email: storedUser.email ?? null,
      phoneNo: storedUser.phoneNo ?? null,
      isAdmin: storedUser.isAdmin ?? false,
      role: storedUser.role ?? "user",
      isVerified: storedUser.isVerified ?? false,
      hasPassword: storedUser.hasPassword ?? false,
      loading: false,
      error: null,
    }
  : {
      _id: null,
      username: null,
      profilePic: null,
      email: null,
      phoneNo: null,
      isAdmin: false,
      role: "user",
      isVerified: false,
      hasPassword: false,
      loading: false,
      error: null,
    };

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    loginRequest: (state) => {
      state.loading = true;
      state.error = null;
    },
    loginSuccess: (
      state,
      action: PayloadAction<{
        _id: string;
        username: string;
        profilePic: string;
        email: string;
        phoneNo: string;
        isVerified: boolean;
        isAdmin: boolean;
        role?: "superadmin" | "admin" | "user" | "rider";
        hasPassword?: boolean;
      }>,
    ) => {
      const user = action.payload;

      // REGRESSION GUARD (Admin Dashboard entry disappearing): several callers
      // dispatch PARTIAL user payloads — the OTP page omits `role` entirely and
      // the profile-update flow passes the raw DB role. Defaulting `role` to
      // "user" here silently downgraded admins in Redux *and* in the persisted
      // `user` object, which the navbar reads back from localStorage.
      // Never invent a role: keep the incoming value, else keep what we have.
      const nextRole = user.role ?? state.role;
      const nextIsAdmin = user.isAdmin ?? state.isAdmin;

      if (typeof window !== "undefined") {
        // MERGE into the persisted user rather than replacing it, so a partial
        // payload can never drop fields (role, isAdmin, …) that other parts of
        // the storefront read back from localStorage.
        let merged: Record<string, unknown> = { ...user };
        try {
          const stored = localStorage.getItem("user");
          const parsed = stored ? JSON.parse(stored) : null;
          if (
            parsed &&
            typeof parsed === "object" &&
            parsed._id &&
            parsed._id === user._id
          ) {
            merged = { ...parsed, ...user };
          }
        } catch {
          /* malformed stored user — fall back to the incoming payload */
        }
        localStorage.setItem("user", JSON.stringify(merged));
      }

      state._id = user._id;
      state.username = user.username;
      state.profilePic = user.profilePic;
      state.email = user.email;
      state.phoneNo = user.phoneNo;
      state.isVerified = user.isVerified;
      state.isAdmin = nextIsAdmin;
      state.role = nextRole;
      state.hasPassword = user.hasPassword ?? state.hasPassword;

      state.loading = false;
      state.error = null;
    },

    // Narrow, dedicated action for the "set your password" flow. The prompt
    // must flip ONE flag — it must never re-dispatch a whole user object, which
    // is what previously let a stale role overwrite the persisted user.
    markPasswordSet: (state) => {
      state.hasPassword = true;
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("user");
          if (stored) {
            const parsed = JSON.parse(stored);
            localStorage.setItem(
              "user",
              JSON.stringify({ ...parsed, hasPassword: true }),
            );
          }
        } catch {
          /* malformed stored user — Redux state is already correct */
        }
      }
    },

    loginFailure: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },

    logout: (state) => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("user");
      }

      state._id = null;
      state.username = null;
      state.profilePic = null;
      state.email = null;
      state.phoneNo = null;
      state.isVerified = false;
      state.isAdmin = false;
      state.role = "user";
      state.hasPassword = false;
      state.loading = false;
      state.error = null;
    },

    // Phase 1 of localStorage migration: hydrate Redux from the server-truth
    // /auth/me endpoint. Runs alongside (not instead of) localStorage hydration
    // on app load. This ensures the server-verified role/email are reflected
    // in Redux state, providing a verified source of truth that doesn't rely
    // on client-stored data.
    hydrateFromServer: (
      state,
      action: PayloadAction<{
        _id: string;
        username: string;
        profilePic?: string;
        email: string;
        phoneNo?: string;
        isVerified: boolean;
        isAdmin: boolean;
        role: "superadmin" | "admin" | "user" | "rider";
        hasPassword?: boolean;
      }>,
    ) => {
      const user = action.payload;
      state._id = user._id;
      state.username = user.username;
      state.profilePic = user.profilePic ?? null;
      state.email = user.email;
      state.phoneNo = user.phoneNo ?? null;
      state.isVerified = user.isVerified;
      state.isAdmin = user.isAdmin ?? state.isAdmin;
      state.role = user.role ?? state.role;
      if (user.hasPassword !== undefined) state.hasPassword = user.hasPassword;
      state.loading = false;
      state.error = null;
    },
  },
});

export const {
  loginRequest,
  loginSuccess,
  loginFailure,
  logout,
  hydrateFromServer,
  markPasswordSet,
} = authSlice.actions;
export default authSlice.reducer;
