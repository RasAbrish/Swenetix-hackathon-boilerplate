import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { EditingInfo, OnlineUser } from "../../types";

interface PresenceState {
  connected: boolean;
  online: OnlineUser[];
  editing: EditingInfo[];
}

const initialState: PresenceState = { connected: false, online: [], editing: [] };

const presenceSlice = createSlice({
  name: "presence",
  initialState,
  reducers: {
    connectionChanged: (state, action: PayloadAction<boolean>) => {
      state.connected = action.payload;
      if (!action.payload) {
        state.online = [];
        state.editing = [];
      }
    },
    presenceUpdated: (state, action: PayloadAction<OnlineUser[]>) => {
      state.online = action.payload;
    },
    editingUpdated: (state, action: PayloadAction<EditingInfo[]>) => {
      state.editing = action.payload;
    },
  },
});

export const { connectionChanged, presenceUpdated, editingUpdated } = presenceSlice.actions;
export default presenceSlice.reducer;
