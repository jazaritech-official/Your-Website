import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface UiState {
  loading: boolean;
  loadingMessage: string;
}

const initialState: UiState = {
  loading: false,
  loadingMessage: "Loading...",
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    startLoading: (state, action: PayloadAction<string>) => {
      state.loading = true;
      state.loadingMessage = action.payload;
    },
    stopLoading: (state) => {
      state.loading = false;
      state.loadingMessage = "Loading...";
    },
  },
});

export const { startLoading, stopLoading } = uiSlice.actions;
export default uiSlice.reducer;
