import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "@/game/config";
import { cancelPlayerHold, stopRoomSession } from "@/room/session";
import { createRoom, getRoom, joinRoom, updatePlayerScore } from "@/room/store";

describe("room reconnect", () => {
  it("preserves total score and clears interrupted hold on rejoin", () => {
    const room = createRoom({
      mode: "replay",
      hostId: "host-1",
      hostLabel: "host",
      sessionDurationId: "5m",
    });
    joinRoom(room.code, "p2", "player-two");
    updatePlayerScore(room.code, "p2", {
      totalScore: 42,
      currentHold: 8,
      holding: true,
      status: "HOLDING",
    });

    const rejoined = joinRoom(room.code, "p2", "player-two");
    expect(rejoined.ok).toBe(true);
    cancelPlayerHold(room.code, "p2");

    const fresh = getRoom(room.code)!;
    const p = fresh.players.find((x) => x.id === "p2")!;
    expect(p.totalScore).toBe(42);
    expect(p.holding).toBe(false);
    expect(p.currentHold).toBe(0);

    stopRoomSession(room.code);
  });

  it("rejects a 6th player", () => {
    const room = createRoom({
      mode: "replay",
      hostId: "h",
      hostLabel: "h",
      sessionDurationId: "5m",
    });
    for (let i = 0; i < GAME_CONFIG.MAX_PLAYERS - 1; i++) {
      const r = joinRoom(room.code, `p${i}`, `p${i}`);
      expect(r.ok).toBe(true);
    }
    const full = joinRoom(room.code, "overflow", "overflow");
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.error).toBe("full");
  });
});
