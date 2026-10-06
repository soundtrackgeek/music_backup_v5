import type { UserEvent } from "@testing-library/user-event";

/**
 * Enters text with one paste instead of one keystroke event per character.
 * `user.type` re-renders the panel for every character, so long prompts took
 * 2-3 s on an idle machine and exceeded the 5 s test timeout under CPU load.
 */
export async function enterText(user: UserEvent, element: Element, text: string) {
  await user.click(element);
  await user.paste(text);
}
