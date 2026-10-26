import { createSlice } from "@reduxjs/toolkit";

interface ModalState {
    signupOpen: boolean;
    loginOpen: boolean;
    // Quick-view cart side drawer (presentation-only — reads the same
    // cart data the /cart and /checkout pages use).
    cartDrawerOpen: boolean;
}
const initialState: ModalState = {
    signupOpen: false,
    loginOpen: false,
    cartDrawerOpen: false,
};

const modalSlice = createSlice({
    name: "modal",
    initialState,
    reducers: {
        openSignup: (state) => { state.signupOpen = true; },
        closeSignup: (state) => { state.signupOpen = false; },
        openLogin: (state) => { state.loginOpen = true; },
        closeLogin: (state) => { state.loginOpen = false; },
        openCartDrawer: (state) => { state.cartDrawerOpen = true; },
        closeCartDrawer: (state) => { state.cartDrawerOpen = false; },
    },
});

export const { openSignup, closeSignup, openLogin, closeLogin, openCartDrawer, closeCartDrawer } = modalSlice.actions;
export default modalSlice.reducer;
