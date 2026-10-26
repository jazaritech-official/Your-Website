import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./Features/authSlice";
import modalReducer from "./Features/modalSlice";
import uiReducer from "./Features/uiSlice";

// Redux store
export const store = configureStore({
  reducer: {
    auth: authReducer,
    modal: modalReducer,
    ui: uiReducer,
  },
});

// Types for TypeScript
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;