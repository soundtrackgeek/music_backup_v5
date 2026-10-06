import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type WorkspaceAction<State> = {
  [Key in keyof State]: { key: Key; value: SetStateAction<State[Key]> };
}[keyof State];

/** Field updates retain React's functional-update and Object.is semantics. */
export function workspaceReducer<State>(
  state: State,
  action: WorkspaceAction<State>,
): State {
  const previous = state[action.key];
  const next =
    typeof action.value === "function"
      ? (action.value as (value: typeof previous) => typeof previous)(previous)
      : action.value;
  return Object.is(previous, next) ? state : { ...state, [action.key]: next };
}

type WorkspaceSetters<State> = {
  [
    Key in keyof State as Key extends string ? `set${Capitalize<Key>}` : never
  ]: Dispatch<SetStateAction<State[Key]>>;
};

/** Build setters once per reducer so effect dependencies stay stable. */
export function createWorkspaceSetters<State>(
  dispatch: Dispatch<WorkspaceAction<State>>,
  keys: (keyof State & string)[],
): WorkspaceSetters<State> {
  return Object.fromEntries(
    keys.map((key) => [
      `set${key.charAt(0).toUpperCase()}${key.slice(1)}`,
      (value: SetStateAction<State[typeof key]>) =>
        dispatch({ key, value } as WorkspaceAction<State>),
    ]),
  ) as WorkspaceSetters<State>;
}

export function createWorkspaceContext<Value>(
  useValue: () => Value,
  name: string,
) {
  const Context = createContext<Value | undefined>(undefined);
  Context.displayName = `${name} workspace`;

  function Provider({ children }: { children: ReactNode }) {
    const value = useValue();
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useStore(): Value {
    const value = useContext(Context);
    if (value === undefined)
      throw new Error(`The ${name} workspace store needs its provider.`);
    return value;
  }

  return { Provider, useStore };
}
