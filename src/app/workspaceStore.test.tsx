import { act, fireEvent, render, screen } from "@testing-library/react";
import { useMemo, useReducer } from "react";
import { describe, expect, it } from "vitest";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "./workspaceStore";

type State = { count: number; filter: string };

describe("workspace reducer stores", () => {
  it("applies queued functional updates to the latest state and leaves other fields intact", () => {
    const state: State = { count: 2, filter: "Synthpop" };
    const next = workspaceReducer(state, {
      key: "count",
      value: (count) => count + 1,
    });
    expect(
      workspaceReducer(next, { key: "count", value: (count) => count + 1 }),
    ).toEqual({ count: 4, filter: "Synthpop" });
    expect(workspaceReducer(state, { key: "count", value: 2 })).toBe(state);
  });

  it("keeps stable setters and retained workspace state through panel remounts", () => {
    const settersSeen: unknown[] = [];
    const { Provider, useStore } = createWorkspaceContext(() => {
      const [state, dispatch] = useReducer(workspaceReducer<State>, {
        count: 0,
        filter: "",
      });
      const setters = useMemo(
        () => createWorkspaceSetters<State>(dispatch, ["count", "filter"]),
        [dispatch],
      );
      settersSeen.push(setters.setCount);
      return { ...state, ...setters };
    }, "test");
    function Panel() {
      const store = useStore();
      return (
        <button
          onClick={() => {
            store.setCount((count) => count + 1);
            store.setCount((count) => count + 1);
          }}
        >
          {store.count}
        </button>
      );
    }
    const view = render(
      <Provider>
        <Panel />
      </Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "0" }));
    expect(screen.getByRole("button", { name: "2" })).toBeVisible();
    act(() =>
      view.rerender(
        <Provider>
          <span>Another view</span>
        </Provider>,
      ),
    );
    act(() =>
      view.rerender(
        <Provider>
          <Panel />
        </Provider>,
      ),
    );
    expect(screen.getByRole("button", { name: "2" })).toBeVisible();
    expect(new Set(settersSeen).size).toBe(1);
  });
});
